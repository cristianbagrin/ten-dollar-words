/* Marks laid over the draft's text: alternatives and ghosts. The text stays plain markdown; these
   are ranges of markdown offsets kept beside it, and they follow every edit. Pure functions only,
   so Node can test them. UMD: TDW.Marks in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./inline.js'));
  else { root.TDW = root.TDW || {}; root.TDW.Marks = factory(root.TDW.Engine, root.TDW.Inline); }
})(typeof self !== 'undefined' ? self : this, function (Engine, Inline) {
  'use strict';

  const KINDS = ['word', 'sentence', 'paragraph'];
  const MAX_ALTS = 200;
  const MAX_OPTIONS = 20;
  const MAX_GHOSTS = 400;
  const MAX_HLS = 600;
  const MAX_NOTES = 300;
  const EMPTY = Object.freeze({ alts: Object.freeze([]), ghosts: Object.freeze([]), hls: Object.freeze([]), notes: Object.freeze([]) });
  // Colors, in Notion's words: a text color, or a background ("yellow_background"). Gray text is
  // how ghosts look in Notion, so it isn't offered as a color.
  const HUES = ['brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  const COLORS = HUES.concat(['gray'].concat(HUES).map((h) => h + '_background'));
  const isColor = (c) => COLORS.includes(c);
  // Every list a set of marks has, so a change to one keeps the others.
  const withAnn = (ann, patch) => Object.assign({ alts: [], ghosts: [], hls: [], notes: [] }, ann, patch);
  const hasAny = (ann) => !!ann && (ann.alts.length || ann.ghosts.length || (ann.hls && ann.hls.length) || (ann.notes && ann.notes.length));

  const WORD_ONLY = /^[\p{L}\p{N}'’\-]+$/u;
  let seq = 0;
  const newId = (p) => (p || 'm') + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

  /* ---------- Following edits ---------- */

  // The one region where a and b differ: a[start, end) became b[start, start + len).
  function diff(a, b) {
    let p = 0;
    const max = Math.min(a.length, b.length);
    while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    return { start: p, end: a.length - s, len: b.length - s - p };
  }

  // Where a range goes when [start, end) is replaced by ins. mode says what typing at its edges
  // does: 'fixed' never grows (ghosts), 'word' and 'sentence' grow at the end while you keep
  // typing the same word, 'paragraph' grows at either end (it's the whole line). null = gone.
  function shiftRange(r, start, end, ins, mode) {
    const len = ins.length;
    const d = len - (end - start);
    let s = r.start, e = r.end;
    if (start === end) {
      const grows = mode === 'paragraph' ? !ins.includes('\n')
        : mode === 'word' ? WORD_ONLY.test(ins)
        : mode === 'sentence' ? !/^\s/.test(ins) && !ins.includes('\n')
        : mode === 'color' ? !ins.includes('\n')
        : false;
      if (start < s) return { start: s + d, end: e + d };
      if (start > e) return { start: s, end: e };
      if (start > s && start < e) return { start: s, end: e + d };
      if (start === s) return mode === 'paragraph' && grows ? { start: s, end: e + d } : { start: s + d, end: e + d };
      return grows ? { start: s, end: e + d } : { start: s, end: e };
    }
    if (end <= s) return { start: s + d, end: e + d };
    if (start >= e) return { start: s, end: e };
    if (start >= s && end <= e) { e += d; return e > s ? { start: s, end: e } : null; }
    if (start < s && end >= e) return null;
    if (start < s) { s = start + len; e += d; } // the change ate the front of the range
    else e = start;                             // the change ate the back
    return e > s ? { start: s, end: e } : null;
  }

  const modeOf = (alt) => alt.kind;

  // Alternatives and ghosts after the text went from oldText to newText. Typing inside an
  // alternative rewrites the option that's showing, so the page and the list always agree.
  function applyChange(ann, oldText, newText) {
    if (!hasAny(ann) || oldText === newText) return ann || EMPTY;
    const c = diff(oldText, newText);
    return shiftAll(ann, c.start, c.end, newText.slice(c.start, c.start + c.len), newText);
  }

  function shiftAll(ann, start, end, ins, newText) {
    const alts = [];
    for (const a of ann.alts) {
      const r = shiftRange(a, start, end, ins, modeOf(a));
      if (!r) continue;
      const shown = newText.slice(r.start, r.end);
      if (shown.includes('\n') || !shown.trim()) continue;
      if (r.start === a.start && r.end === a.end && shown === a.options[a.active].text) { alts.push(a); continue; }
      const options = a.options.slice();
      options[a.active] = Object.assign({}, options[a.active], { text: shown });
      alts.push(Object.assign({}, a, r, { options }));
    }
    const ghosts = [];
    for (const g of ann.ghosts) {
      const r = shiftRange(g, start, end, ins, 'fixed');
      if (!r || !newText.slice(r.start, r.end).trim()) continue;
      ghosts.push(r.start === g.start && r.end === g.end ? g : Object.assign({}, g, r));
    }
    // Highlights grow as you type at their end, the way color carries on in Notion.
    const hls = [];
    for (const h of ann.hls || []) {
      const r = shiftRange(h, start, end, ins, 'color');
      if (!r || !newText.slice(r.start, r.end).trim()) continue;
      hls.push(r.start === h.start && r.end === h.end ? h : Object.assign({}, h, r));
    }
    // A note is never lost with its text: it stays, pinned where the text was.
    const notes = [];
    for (const n of ann.notes || []) {
      let r = n.end > n.start ? shiftRange(n, start, end, ins, 'fixed') : shiftPoint(n.start, start, end, ins);
      if (!r) r = { start: Math.min(start + ins.length, newText.length), end: Math.min(start + ins.length, newText.length) };
      notes.push(r.start === n.start && r.end === n.end ? n : Object.assign({}, n, r));
    }
    return { alts, ghosts: mergeGhosts(ghosts), hls: mergeColors(hls), notes };
  }

  function shiftPoint(p, start, end, ins) {
    const d = ins.length - (end - start);
    if (p < start || (p === start && start === end)) return { start: p, end: p };
    if (p >= end) return { start: p + d, end: p + d };
    return { start: start + ins.length, end: start + ins.length };
  }

  // Touching highlights of the same color become one; later ones win where they overlap.
  function mergeColors(list) {
    if (list.length < 2) return list;
    const s = list.slice().sort((a, b) => a.start - b.start);
    const out = [];
    for (const h of s) {
      const last = out[out.length - 1];
      if (last && h.start <= last.end) {
        if (last.color === h.color) { if (h.end > last.end) out[out.length - 1] = Object.assign({}, last, { end: h.end }); continue; }
        if (h.start === last.start) { out[out.length - 1] = h; continue; }
        out[out.length - 1] = Object.assign({}, last, { end: h.start });
      }
      out.push(h);
    }
    return out;
  }

  // Overlapping or touching ghosts become one.
  function mergeGhosts(list) {
    if (list.length < 2) return list;
    const s = list.slice().sort((a, b) => a.start - b.start);
    const out = [s[0]];
    for (let i = 1; i < s.length; i++) {
      const last = out[out.length - 1];
      if (s[i].start <= last.end) {
        if (s[i].end > last.end) out[out.length - 1] = Object.assign({}, last, { end: s[i].end });
      } else out.push(s[i]);
    }
    return out;
  }

  // The text changed somewhere else (Notion, another device). One changed region is followed
  // exactly; anything it swallowed is looked for by its text, nearest its old place first.
  // Alternatives that can't be found come back as `lost`, so the caller can keep their options.
  function reanchor(ann, oldText, newText) {
    if (!hasAny(ann)) return { ann: ann || EMPTY, lost: [] };
    if (oldText === newText) return { ann, lost: [] };
    const c = diff(oldText, newText);
    const shifted = shiftAll(ann, c.start, c.end, newText.slice(c.start, c.start + c.len), newText);
    // Text rewritten somewhere else becomes the version on the page; the one it replaced stays
    // in the list, so nothing written here is lost.
    const was = new Map(ann.alts.map((a) => [a.id, a]));
    shifted.alts = shifted.alts.map((a) => {
      const old = was.get(a.id);
      const prev = old.options[old.active].text;
      const now = a.options[a.active].text;
      if (prev === now || a.options.some((o, i) => i !== a.active && o.text === prev) || a.options.length >= MAX_OPTIONS) return a;
      const options = a.options.slice();
      options.splice(a.active, 0, Object.assign({}, old.options[old.active]));
      return Object.assign({}, a, { options, active: a.active + 1 });
    });
    const kept = new Set(shifted.alts.map((a) => a.id));
    const keptG = new Set(shifted.ghosts.map((g) => g.id));
    const d = c.len - (c.end - c.start);
    const guess = (x) => (x < c.start ? x : x + d);
    const taken = (s, e, list) => list.some((x) => s < x.end && e > x.start);
    const alts = shifted.alts.slice();
    const ghosts = shifted.ghosts.slice();
    const lost = [];
    for (const a of ann.alts) {
      if (kept.has(a.id)) continue;
      const want = a.options[a.active].text;
      const at = nearest(newText, want, guess(a.start), (s) => !taken(s, s + want.length, alts.filter((x) => x.kind === a.kind)));
      if (at < 0) { lost.push(a); continue; }
      alts.push(Object.assign({}, a, { start: at, end: at + want.length }));
    }
    for (const g of ann.ghosts) {
      if (keptG.has(g.id)) continue;
      const want = oldText.slice(g.start, g.end);
      const at = want.trim() ? nearest(newText, want, guess(g.start), (s) => !taken(s, s + want.length, ghosts)) : -1;
      if (at >= 0) ghosts.push(Object.assign({}, g, { start: at, end: at + want.length }));
    }
    const keptH = new Set(shifted.hls.map((h) => h.id));
    const hls = shifted.hls.slice();
    for (const h of ann.hls || []) {
      if (keptH.has(h.id)) continue;
      const want = oldText.slice(h.start, h.end);
      const at = want.trim() ? nearest(newText, want, guess(h.start), (s) => !taken(s, s + want.length, hls)) : -1;
      if (at >= 0) hls.push(Object.assign({}, h, { start: at, end: at + want.length }));
    }
    // Notes look for their words again; one that can't find them stays pinned where they were.
    const was2 = new Map((ann.notes || []).map((n) => [n.id, n]));
    const notes = shifted.notes.map((n) => {
      const old = was2.get(n.id);
      if (!old || old.end <= old.start || n.end > n.start) return n;
      const want = oldText.slice(old.start, old.end);
      const at = want.trim() ? nearest(newText, want, guess(old.start), () => true) : -1;
      return at >= 0 ? Object.assign({}, n, { start: at, end: at + want.length }) : n;
    });
    alts.sort((x, y) => x.start - y.start);
    return { ann: { alts, ghosts: mergeGhosts(ghosts), hls: mergeColors(hls), notes }, lost };
  }

  function nearest(text, want, near, ok) {
    if (!want) return -1;
    let best = -1, dist = Infinity;
    for (let i = text.indexOf(want); i >= 0; i = text.indexOf(want, i + 1)) {
      if (text.slice(i, i + want.length).includes('\n') && !want.includes('\n')) continue;
      const dd = Math.abs(i - near);
      if (dd < dist && ok(i)) { best = i; dist = dd; }
    }
    return best;
  }

  /* ---------- Saving ---------- */

  const num = (v) => (Number.isFinite(v) ? Math.floor(v) : -1);

  // Whatever comes from storage or the account: keep what fits the text, drop the rest.
  function normalize(raw, text) {
    const t = String(text || '');
    const src = raw && typeof raw === 'object' ? raw : {};
    const alts = [];
    for (const a of Array.isArray(src.alts) ? src.alts : []) {
      if (!a || !KINDS.includes(a.kind) || !Array.isArray(a.options)) continue;
      const options = a.options
        .filter((o) => o && typeof o.text === 'string' && o.text.trim() && !o.text.includes('\n'))
        .slice(0, MAX_OPTIONS)
        .map((o) => ({ text: o.text, by: o.by === 'ai' ? 'ai' : 'me' }));
      const active = num(a.active);
      if (options.length < 2 || active < 0 || active >= options.length) continue;
      // Saved against another copy of the text (the account, another device): find it again.
      let start = num(a.start), end = num(a.end);
      const want = options[active].text;
      if (t.slice(start, end) !== want) {
        start = nearest(t, want, Math.max(0, start), () => true);
        if (start < 0) continue;
        end = start + want.length;
      }
      if (alts.some((x) => x.kind === a.kind && start < x.end && end > x.start)) continue;
      alts.push({ id: typeof a.id === 'string' && a.id ? a.id : newId('a'), kind: a.kind, start, end, options, active });
      if (alts.length >= MAX_ALTS) break;
    }
    const ghosts = [];
    for (const g of Array.isArray(src.ghosts) ? src.ghosts : []) {
      const start = num(g && g.start), end = num(g && g.end);
      if (start < 0 || end <= start || end > t.length) continue;
      ghosts.push({ id: typeof g.id === 'string' && g.id ? g.id : newId('g'), start, end });
      if (ghosts.length >= MAX_GHOSTS) break;
    }
    const hls = [];
    for (const h of Array.isArray(src.hls) ? src.hls : []) {
      const start = num(h && h.start), end = num(h && h.end);
      if (start < 0 || end <= start || end > t.length || !isColor(h.color)) continue;
      hls.push({ id: typeof h.id === 'string' && h.id ? h.id : newId('h'), start, end, color: h.color });
      if (hls.length >= MAX_HLS) break;
    }
    const notes = [];
    for (const n of Array.isArray(src.notes) ? src.notes : []) {
      if (!n || typeof n !== 'object') continue;
      let start = num(n.start), end = num(n.end);
      if (start < 0 || start > t.length) start = Math.max(0, Math.min(t.length, start));
      if (end < start || end > t.length) end = start;
      // Saved against another copy of the text: find its words again.
      const quote = typeof n.quote === 'string' ? n.quote : '';
      if (quote && t.slice(start, end) !== quote) {
        const at = nearest(t, quote, start, () => true);
        if (at >= 0) { start = at; end = at + quote.length; }
      }
      const thread = (Array.isArray(n.thread) ? n.thread : []).filter((m) => m && typeof m.text === 'string').slice(-60).map((m) => {
        const o = { by: m.by === 'ai' ? 'ai' : 'me', text: m.text.slice(0, 4000), at: Number.isFinite(m.at) ? m.at : 0 };
        if (Array.isArray(m.options)) o.options = m.options.filter((x) => typeof x === 'string' && x.trim()).slice(0, 8);
        return o;
      });
      notes.push({
        id: typeof n.id === 'string' && n.id ? n.id : newId('n'), start, end,
        body: typeof n.body === 'string' ? n.body.slice(0, 4000) : '',
        done: !!n.done, ai: !!n.ai,
        color: isColor(n.color) ? n.color : '',
        at: Number.isFinite(n.at) ? n.at : 0,
        thread
      });
      if (notes.length >= MAX_NOTES) break;
    }
    alts.sort((x, y) => x.start - y.start);
    notes.sort((x, y) => x.start - y.start);
    return { alts, ghosts: mergeGhosts(ghosts), hls: mergeColors(hls), notes };
  }

  // Alternatives with one option left are just text.
  function prune(ann) {
    const alts = ann.alts.filter((a) => a.options.length > 1);
    return alts.length === ann.alts.length ? ann : withAnn(ann, { alts });
  }

  const isEmpty = (ann) => !hasAny(ann);

  /* ---------- a / an ---------- */

  const AN_LETTERS = /^[AEFHILMNORSX]/; // letter names that start with a vowel sound: "an FAQ", "an MBA"
  const SILENT_H = /^(hour|honest|honor|honour|heir|herb)/;
  const SOUNDS_LIKE_Y = /^(uni(?!n|m|d|l(?!at))|use|usa|usu|usur|uten|uti|uto|ura|ure|uri|uro|ubiq|uku|eu|ewe|one(?![a-z])|one-|once)/;

  // "a" or "an" for the word that follows.
  function articleFor(word) {
    const m = /[A-Za-z0-9]+/.exec(String(word || ''));
    if (!m) return null;
    const w = m[0];
    if (/^\d/.test(w)) return /^8/.test(w) || /^(11|18)(\d{3})*$/.test(w) ? 'an' : 'a';
    if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return AN_LETTERS.test(w) ? 'an' : 'a';
    const l = w.toLowerCase();
    if (SILENT_H.test(l)) return 'an';
    if (SOUNDS_LIKE_Y.test(l)) return 'a';
    return /^[aeiou]/.test(l) ? 'an' : 'a';
  }

  // The edit that makes the "a"/"an" right before `at` agree with `next`, or null if it's fine.
  function articleFix(text, at, next) {
    const before = text.slice(Math.max(0, at - 8), at);
    const m = /(^|[^A-Za-z0-9'’])(a|an)(\s+)$/i.exec(before);
    if (!m) return null;
    const want = articleFor(Inline ? Inline.plain(next) : next);
    if (!want) return null;
    const word = m[2];
    if (word.toLowerCase() === want) return null;
    const start = at - m[3].length - word.length;
    let out = want;
    if (word === word.toUpperCase() && word.length > 1) out = want.toUpperCase();
    else if (word[0] === word[0].toUpperCase()) out = want[0].toUpperCase() + want.slice(1);
    return { start, end: start + word.length, insert: out };
  }

  /* ---------- Swapping ---------- */

  // Put option k of alternative id on the page: the new text, the article before it, and every
  // other mark moved to match. Word alternatives inside a swapped sentence go with the old text.
  function swap(text, ann, id, k) {
    const a = ann.alts.find((x) => x.id === id);
    if (!a || k < 0 || k >= a.options.length) return null;
    const next = a.options[k].text;
    let t = text.slice(0, a.start) + next + text.slice(a.end);
    let ann2 = shiftAll(Object.assign({}, ann, { alts: ann.alts.filter((x) => x.id !== id) }), a.start, a.end, next, t);
    let start = a.start;
    const fix = articleFix(t, start, next);
    if (fix) {
      const t2 = t.slice(0, fix.start) + fix.insert + t.slice(fix.end);
      ann2 = shiftAll(ann2, fix.start, fix.end, fix.insert, t2);
      start += fix.insert.length - (fix.end - fix.start);
      t = t2;
    }
    const alts = ann2.alts.concat(Object.assign({}, a, { start, end: start + next.length, active: k }));
    alts.sort((x, y) => x.start - y.start);
    return { text: t, ann: withAnn(ann2, { alts }), start, end: start + next.length };
  }

  // A new alternative over [start, end), or the one already there (same kind, overlapping).
  function ensure(text, ann, kind, start, end) {
    const hit = ann.alts.find((x) => x.kind === kind && start < x.end && end > x.start);
    if (hit) return { ann, id: hit.id };
    if (ann.alts.length >= MAX_ALTS) return null;
    const alt = { id: newId('a'), kind, start, end, options: [{ text: text.slice(start, end), by: 'me' }], active: 0 };
    const alts = ann.alts.concat(alt).sort((x, y) => x.start - y.start);
    return { ann: withAnn(ann, { alts }), id: alt.id };
  }

  function updateAlt(ann, id, patch) {
    return withAnn(ann, { alts: ann.alts.map((x) => (x.id === id ? Object.assign({}, x, patch) : x)) });
  }

  // Add options (skipping ones already in the list); returns the new ann.
  function addOptions(ann, id, texts, by) {
    const a = ann.alts.find((x) => x.id === id);
    if (!a) return ann;
    const have = new Set(a.options.map((o) => o.text.trim().toLowerCase()));
    const options = a.options.slice();
    for (const t of texts) {
      const s = String(t || '').replace(/\s*\n\s*/g, ' ').trim();
      if (!s || have.has(s.toLowerCase()) || options.length >= MAX_OPTIONS) continue;
      have.add(s.toLowerCase());
      options.push({ text: s, by: by === 'ai' ? 'ai' : 'me' });
    }
    return updateAlt(ann, id, { options });
  }

  /* ---------- Ghosts ---------- */

  function ghost(ann, start, end) {
    if (end <= start) return ann;
    return withAnn(ann, { ghosts: mergeGhosts(ann.ghosts.concat({ id: newId('g'), start, end })) });
  }

  // Revive [start, end): ghosts are cut back, or split, around it.
  function revive(ann, start, end) {
    const out = [];
    for (const g of ann.ghosts) {
      if (end <= g.start || start >= g.end) { out.push(g); continue; }
      if (g.start < start) out.push(Object.assign({}, g, { end: start }));
      if (g.end > end) out.push(Object.assign({}, g, { id: newId('g'), start: end }));
    }
    return withAnn(ann, { ghosts: out });
  }

  /* ---------- Colors and notes ---------- */

  // Color [start, end): a Notion color name, or null to clear it. Whatever was there is cut back.
  function setColor(ann, start, end, color) {
    if (end <= start) return ann;
    const out = [];
    for (const h of ann.hls || []) {
      if (end <= h.start || start >= h.end) { out.push(h); continue; }
      if (h.start < start) out.push(Object.assign({}, h, { end: start }));
      if (h.end > end) out.push(Object.assign({}, h, { id: newId('h'), start: end }));
    }
    if (color && isColor(color)) out.push({ id: newId('h'), start, end, color });
    return withAnn(ann, { hls: mergeColors(out) });
  }

  // The color most of [start, end) has (or the one at a caret), or ''.
  function colorAt(ann, start, end) {
    const list = ann.hls || [];
    if (end <= start) { const h = list.find((x) => start > x.start && start <= x.end); return h ? h.color : ''; }
    const by = new Map();
    for (const h of list) {
      const n = Math.max(0, Math.min(h.end, end) - Math.max(h.start, start));
      if (n) by.set(h.color, (by.get(h.color) || 0) + n);
    }
    let best = '', most = 0;
    for (const [c, n] of by) if (n > most) { most = n; best = c; }
    return most * 2 >= end - start ? best : '';
  }

  function addNote(ann, start, end, fields) {
    if ((ann.notes || []).length >= MAX_NOTES) return null;
    const note = Object.assign({ id: newId('n'), start, end, body: '', done: false, ai: false, color: '', at: Date.now(), thread: [] }, fields || {});
    const notes = (ann.notes || []).concat(note).sort((x, y) => x.start - y.start);
    return { ann: withAnn(ann, { notes }), id: note.id };
  }
  const updateNote = (ann, id, patch) => withAnn(ann, { notes: (ann.notes || []).map((n) => (n.id === id ? Object.assign({}, n, patch) : n)) });
  const removeNote = (ann, id) => withAnn(ann, { notes: (ann.notes || []).filter((n) => n.id !== id) });
  const notesAt = (ann, at) => (ann.notes || []).filter((n) => at >= n.start && at <= n.end);

  const ghostAt = (ann, start, end) => ann.ghosts.some((g) => (end > start ? start < g.end && end > g.start : start >= g.start && start <= g.end));

  // The text without its ghosts, for counting, copying and posting. A ghost takes one
  // neighboring space with it, so no double spaces are left behind; lines left empty go.
  function stripGhosts(text, ghosts) {
    if (!ghosts || !ghosts.length) return text;
    const list = mergeGhosts(ghosts.filter((g) => g.end > g.start && g.start >= 0 && g.end <= text.length));
    let out = '', last = 0;
    for (const g of list) {
      let s = g.start, e = g.end;
      if (s < last) s = last;
      if (e <= s) continue;
      if (text[e] === ' ' && (s === 0 || text[s - 1] === ' ' || text[s - 1] === '\n')) e++;
      else if (s > last && text[s - 1] === ' ' && (e >= text.length || /[\s.,;:!?)\]”’"']/.test(text[e]))) s--;
      out += text.slice(last, s);
      last = e;
    }
    out += text.slice(last);
    if (out === text) return out;
    // Lines that only held ghosted text disappear, along with their markers.
    const before = text.split('\n');
    const after = out.split('\n');
    if (before.length !== after.length) return out;
    return after.filter((l, i) => !(before[i].trim() && !Inline.plain(l).trim())).join('\n');
  }

  // The same text with ghosted characters turned into spaces (line breaks kept), so offsets still
  // line up: counts, readability and highlights skip what's ghosted.
  function mask(text, ghosts) {
    if (!ghosts || !ghosts.length) return text;
    let out = '', last = 0;
    for (const g of mergeGhosts(ghosts)) {
      const s = Math.max(last, g.start), e = Math.min(text.length, g.end);
      if (e <= s) continue;
      out += text.slice(last, s) + text.slice(s, e).replace(/[^\n]/g, ' ');
      last = e;
    }
    return out + text.slice(last);
  }

  /* ---------- Scopes: the word, sentence or paragraph at an offset ---------- */

  const WORDCH = /[\p{L}\p{N}'’\-]/u;

  function lineRange(text, at) {
    const s = text.lastIndexOf('\n', at - 1) + 1;
    let e = text.indexOf('\n', at);
    if (e < 0) e = text.length;
    return { start: s, end: e };
  }

  function wordAt(text, at) {
    let s = at, e = at;
    while (s > 0 && WORDCH.test(text[s - 1])) s--;
    while (e < text.length && WORDCH.test(text[e])) e++;
    while (s < e && /['’\-]/.test(text[s])) s++;
    while (e > s && /['’\-]/.test(text[e - 1])) e--;
    return e > s ? { start: s, end: e } : null;
  }

  function paragraphAt(text, at) {
    const l = lineRange(text, at);
    const md = text.slice(l.start, l.end);
    const b = Inline.block(md);
    if (b.type === 'hr' || b.type === 'opaque') return null;
    let s = l.start + b.prefix, e = l.end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    return e > s ? { start: s, end: e } : null;
  }

  function sentenceAt(text, at) {
    const p = paragraphAt(text, at);
    if (!p) return null;
    const body = text.slice(p.start, p.end);
    const list = Engine.splitSentences(body);
    const k = Math.max(0, Math.min(at - p.start, body.length));
    let hit = list.find((r) => k >= r.start && k <= r.end) || list[list.length - 1];
    if (!hit) return null;
    return { start: p.start + hit.start, end: p.start + hit.end };
  }

  const scopeAt = (kind, text, at) => (kind === 'word' ? wordAt(text, at) : kind === 'sentence' ? sentenceAt(text, at) : paragraphAt(text, at));

  // Which kind a selection is: one word, a sentence, or a paragraph (or more of a line).
  function kindOf(text, start, end) {
    const s = text.slice(start, end).trim();
    if (!s || s.includes('\n')) return null;
    const p = paragraphAt(text, start);
    if (p && start <= p.start && end >= p.end) return 'paragraph';
    if (!/\s/.test(s)) return 'word';
    const sen = sentenceAt(text, start);
    if (sen && start <= sen.start + 1 && end >= sen.end - 1) return 'sentence';
    return s.split(/\s+/).length <= 4 ? 'word' : 'sentence';
  }

  return {
    EMPTY, KINDS, MAX_OPTIONS, COLORS, HUES, isColor, withAnn,
    setColor, colorAt, mergeColors, addNote, updateNote, removeNote, notesAt,
    diff, shiftRange, applyChange, reanchor, normalize, prune, isEmpty,
    articleFor, articleFix, swap, ensure, updateAlt, addOptions,
    ghost, revive, ghostAt, stripGhosts, mergeGhosts, mask,
    wordAt, sentenceAt, paragraphAt, scopeAt, kindOf, lineRange, newId
  };
});
