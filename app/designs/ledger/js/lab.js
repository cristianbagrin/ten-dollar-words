/* The Lab: editing ideas that only mark text, never rewrite it, and Trim, which dims what it
   would cut and lets you choose. Marks sit on the editor's lab layer (Editor.setLab); an edit
   over a mark drops it. The pure parts (placing quotes, making cuts) are LabCore, tested in Node. */
(function (root) {
  'use strict';

  /* ---------- Core: no DOM ---------- */
  const Core = (function () {
    const overlaps = (a, b) => a.start < b.end && a.end > b.start;

    // Exact quotes → ranges in text. A quote counts only when it appears once outside ghosts;
    // ranges never overlap each other (or `taken`).
    function place(text, items, ghosts, taken) {
      const out = [];
      const busy = (taken || []).slice();
      for (const it of items) {
        const q = it.quote;
        if (!q || !q.trim()) continue;
        const hits = [];
        for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) {
          const r = { start: i, end: i + q.length };
          // Whole words only: "very" never matches inside "everything".
          const cut = (/[\p{L}\p{N}]/u.test(q[0]) && /[\p{L}\p{N}]/u.test(text[i - 1] || '')) ||
            (/[\p{L}\p{N}]/u.test(q[q.length - 1]) && /[\p{L}\p{N}]/u.test(text[i + q.length] || ''));
          if (!cut && !(ghosts || []).some((g) => overlaps(g, r))) hits.push(r);
        }
        if (hits.length !== 1) continue;
        const r = hits[0];
        // Trim the quote's own outer spaces so the mark sits on words.
        while (r.start < r.end && /\s/.test(text[r.start])) r.start++;
        while (r.end > r.start && /\s/.test(text[r.end - 1])) r.end--;
        if (r.end <= r.start || busy.some((b) => overlaps(b, r))) continue;
        busy.push(r);
        out.push(Object.assign({}, it, r));
      }
      return out.sort((a, b) => a.start - b.start);
    }

    // The same as Editor.cutPlan: take one neighboring space, keep the sentence capitalized.
    function cutPlan(t, start, end, sentenceStart) {
      let s = start, e = end;
      if (t[e] === ',') e++;
      if (t[e] === ' ') e++;
      else if (t[s - 1] === ' ') s--;
      const next = t[e] || '';
      if (start === sentenceStart && /^[a-z]$/.test(next)) return { start: s, end: e + 1, replacement: next.toUpperCase() };
      return { start: s, end: e, replacement: '' };
    }

    // Delete every cut, last first, as one new text. Marks (alternatives, ghosts) follow each
    // cut on its own, so nothing between two cuts is lost. A line left with no words goes too.
    function applyCuts(text, ann, cuts, deps) {
      const { Marks, Engine, Inline } = deps;
      let t = text, a = ann || Marks.EMPTY;
      const step = (s, e, ins) => {
        const next = t.slice(0, s) + ins + t.slice(e);
        a = Marks.applyChange(a, t, next);
        t = next;
      };
      const list = cuts.slice().sort((x, y) => y.start - x.start);
      for (const c of list) {
        if (c.start < 0 || c.end > t.length || c.end <= c.start) continue;
        const sens = Engine.splitSentences(t);
        const sen = sens.find((r) => r.start <= c.start && c.start < r.end);
        const p = cutPlan(t, c.start, c.end, sen ? sen.start : -1);
        const lineHad = Inline.plain(lineAt(t, c.start)).trim();
        step(p.start, p.end, p.replacement);
        const ls = t.lastIndexOf('\n', p.start - 1) + 1;
        let le = t.indexOf('\n', p.start);
        if (le < 0) le = t.length;
        const line = t.slice(ls, le);
        if (lineHad && !Inline.plain(line).trim()) {
          if (le < t.length) step(ls, le + 1, '');
          else if (ls > 0) step(ls - 1, le, '');
          else step(ls, le, '');
        } else if (/ +$/.test(line)) {
          const m = / +$/.exec(line);
          step(ls + m.index, le, '');
        }
      }
      return { text: t, ann: a };
    }

    function lineAt(t, i) {
      const s = t.lastIndexOf('\n', i - 1) + 1;
      let e = t.indexOf('\n', i);
      if (e < 0) e = t.length;
      return t.slice(s, e);
    }

    return { place, cutPlan, applyCuts, overlaps };
  })();

  if (typeof module === 'object' && module.exports) { module.exports = Core; return; }

  const TDW = root.TDW = root.TDW || {};
  TDW.LabCore = Core;

  /* ---------- The Lab ---------- */
  const app = () => TDW.App;
  const E = () => TDW.Editor;
  const el = (...a) => TDW.UI.el(...a);

  const ITEMS = [
    { id: 'punctuation', type: 'fix', label: 'Typos and punctuation', desc: 'Marks typos and punctuation slips. Click one to see its fix; nothing changes until you take it.', local: true, ai: true },
    { id: 'weakest', type: 'weak', label: 'The weakest sentences', desc: 'Up to five sentences that add the least, are vague, or repeat.', ai: true },
    { id: 'long', type: 'long', label: 'Sentences that run long', desc: 'Hard and very hard sentences. Instant, no AI needed.', local: true },
    { id: 'convoluted', type: 'convoluted', label: 'Convoluted sentences', desc: 'Sentences that are hard to follow because of how they are built, even short ones.', ai: true },
    { id: 'tone', type: 'tone', label: 'Words off the tone', desc: 'Fancy words in plain writing, slang in formal writing: words that break the voice.', ai: true },
    { id: 'hedges', type: 'hedge', label: 'Hedges and filler', desc: 'Words that soften or pad without adding meaning.', local: true, ai: true },
    { id: 'message', label: 'Check the message', desc: 'What a busy reader takes away, and whether it’s what you meant.' }
  ];
  const LEVELS = [
    { pct: 0, label: 'Original' },
    { pct: 10, label: 'Slight trim' },
    { pct: 20, label: 'Tighten more' },
    { pct: 30, label: 'Even sharper' },
    { pct: 50, label: 'Cut in half' }
  ];
  const LOCAL_REASON = {
    hard: 'Hard to read: try splitting it.', veryHard: 'Very hard to read: split it up.',
    qualifier: 'Softens without adding meaning.', complex: 'A wordy phrase: a simpler one says it.', adverb: 'An adverb: a stronger verb may do.'
  };

  let pop = null, card, btn;
  let run = null;          // what the marks on the page came from: { kind: 'check', item } | { kind: 'trim', level }
  let info = new Map();    // mark id → { reason, fix }
  let ctrl = null;
  let walk = null;         // { id } while walking through cuts
  let level = 0;
  let seq = 0;
  const cache = new Map(); // publishText + level → quotes
  let cacheText = '';

  const nextId = () => 'lab' + (++seq);
  const marks = () => E().getLab();
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

  let current = null; // the check whose marks are on the page

  /* ---------- The audit: a list of checks that takes over the tape ---------- */
  function openPop() {
    if (app().state.mode !== 'edit') app().setMode('edit');
    const ov = TDW.Tape.openOverlay('audit', { title: 'Audit', onClose: () => { pop = null; if (btn) btn.setAttribute('aria-expanded', 'false'); } });
    pop = ov.el;
    ov.body.append(
      el('p', { class: 'hint', style: 'margin-bottom:12px', text: 'Each check only marks the page. Nothing changes until you take a fix.' }),
      el('ul', { class: 'lab-list' }, ITEMS.map((it) => el('li', null,
        el('button', { type: 'button', class: 'lab-item', 'data-item': it.id, onclick: () => choose(it) },
          el('span', { class: 'lab-item-label' }, it.label, it.ai && !it.local ? el('span', { class: 'lab-item-tag', text: 'AI' }) : null),
          el('span', { class: 'lab-item-desc', text: it.desc }))))));
    btn.setAttribute('aria-expanded', 'true');
    const first = pop.querySelector('.lab-item');
    if (first) first.focus({ preventScroll: true });
  }
  function closePop(refocus) {
    if (!pop) return;
    TDW.Tape.closeOverlay('audit');
    pop = null;
    if (refocus) E().focus();
  }
  const togglePop = () => (pop ? closePop(true) : openPop());

  function syncLevels() { if (TDW.Panel && TDW.Panel.levelsChanged) TDW.Panel.levelsChanged(); }

  /* ---------- The slip clipped to the tape ---------- */
  function showCard(title, line, buttons) {
    card.replaceChildren(
      el('div', { class: 'slip-head' }, el('b', { class: 'slip-title', text: title }), line ? el('span', { class: 'slip-meta', text: line[0] }) : null),
      line && line[1] ? el('p', { class: 'slip-note', text: line[1] }) : null,
      buttons && buttons.length ? el('div', { class: 'slip-actions' }, buttons.map((b) =>
        el('button', { type: 'button', class: (b.primary ? 'btn' : 'btn-outline') + ' btn-sm', text: b.label, onclick: b.run }))) : null);
    if (!card.isConnected) document.getElementById('tape-pinned').append(card);
    card.hidden = false;
    TDW.Tape.measurePin();
    requestAnimationFrame(() => { if (TDW.Tape.isPhone()) TDW.Tape.reveal(card); });
  }
  const hideCard = () => { if (card) { card.remove(); card.classList.remove('is-busy'); current = null; TDW.Tape.sync(); } };

  function busyCard(title, what) {
    showCard(title, ['', what], [{ label: 'Stop', run: () => { stop(); done(); } }]);
    card.classList.add('is-busy');
  }

  function errorCard(title, err, retry) {
    card.classList.remove('is-busy');
    showCard(title, ['', TDW.AI.errorMessage(err)], [{ label: 'Try again', primary: true, run: retry }, { label: 'Done', run: done }]);
  }

  function needsKey(title) {
    showCard(title, ['', 'This one needs a Gemini key.'], [
      { label: 'Add a key in Settings', primary: true, run: () => { done(); app().openSettings('ai'); } },
      { label: 'Done', run: done }]);
  }

  // The marks of a check, each with its reason (and its fix, for typos).
  function markList() {
    const t = E().getText();
    return el('ul', { class: 'lab-marks' }, marks().filter((m) => !/^trim/.test(m.type)).map((m) => {
      const it = info.get(m.id) || {};
      const q = TDW.Inline.plain(t.slice(m.start, m.end));
      const b = el('button', { type: 'button', class: 'lab-mark', dataset: { id: m.id }, onclick: () => pickMark(m.id) },
        el('span', { class: 'lab-mark-q', text: q.length > 60 ? q.slice(0, 60) + '…' : q }),
        el('span', { class: 'lab-mark-why', text: it.reason || 'Marked by the audit.' }));
      return el('li', null, b);
    }));
  }

  function pickMark(id) {
    const m = marks().find((x) => x.id === id);
    if (!m) return;
    for (const b of card.querySelectorAll('.lab-mark')) b.classList.toggle('is-on', b.dataset.id === id);
    const row = card.querySelector('.lab-mark[data-id="' + CSS.escape(id) + '"]');
    E().setActive(id);
    E().scrollToIndex(m.start, 0.35, true);
    const it = info.get(id) || {};
    const old = card.querySelector('.lab-fixrow');
    if (old) old.remove();
    if (row && it.fix && it.fix !== E().getText().slice(m.start, m.end)) {
      row.parentNode.append(el('div', { class: 'lab-fixrow slip-actions' }, el('button', {
        type: 'button', class: 'btn btn-sm', text: 'Use “' + it.fix + '”',
        onclick: () => {
          const cur = marks().find((x) => x.id === id);
          if (!cur) return;
          app().edit(cur.start, cur.end, it.fix, { silent: true });
          E().focus();
        }
      })));
    }
    if (row) TDW.Tape.reveal(row);
  }

  /* ---------- Running an idea ---------- */
  function stop() { if (ctrl) { ctrl.abort(); ctrl = null; } if (card) card.classList.remove('is-busy'); }

  function clearMarks() {
    stop();
    endWalk(true);
    info = new Map();
    run = null;
    level = 0;
    if (E().getLab().length) E().setLab([]);
    hideTip();
    syncLevels();
  }

  function done() { clearMarks(); hideCard(); }

  function setMarks(list, kind) {
    info = new Map();
    E().setLab(list.map((m) => {
      const id = nextId();
      info.set(id, { reason: m.reason || '', fix: m.fix || '' });
      return { start: m.start, end: m.end, type: m.type || kind, id };
    }));
  }

  function localMarks(item, text) {
    const a = app().analyze(text);
    const out = [];
    for (const i of a.issues) {
      if (item.id === 'long' && (i.type === 'hard' || i.type === 'veryHard')) out.push({ start: i.start, end: i.end, reason: LOCAL_REASON[i.type] });
      if (item.id === 'hedges' && (i.type === 'qualifier' || i.type === 'complex' || i.type === 'adverb')) {
        out.push({ start: i.start, end: i.end, reason: LOCAL_REASON[i.type] });
      }
      if (item.id === 'punctuation' && i.type === 'spelling') {
        const fixes = TDW.Spell && TDW.Spell.isReady() ? TDW.Spell.suggest(i.text) : [];
        out.push({ start: i.start, end: i.end, reason: 'Not in the dictionary.', fix: fixes[0] || '' });
      }
    }
    return out;
  }

  function choose(item) {
    closePop(false);
    current = item;
    if (item.id === 'message') { done(); TDW.Panel.startMessage(); return; }
    clearMarks();
    const text = E().getText();
    if (!text.trim()) { showCard(item.label, ['Nothing to check yet.'], [{ label: 'Done', run: done }]); return; }
    const masked = app().masked();
    const local = item.local ? localMarks(item, masked) : [];
    const useAI = item.ai && TDW.AI.status() !== 'none';
    run = { kind: 'check', item };
    if (!useAI) {
      if (!item.local) { needsKey(item.label); run = null; return; }
      finishCheck(item, local, []);
      return;
    }
    const c = new AbortController();
    ctrl = c;
    if (local.length) setMarks(local, item.type);
    busyCard(item.label, 'Reading the whole draft…');
    TDW.AI.lab({ check: item.id, text: app().publishText() }, c.signal).then((out) => {
      if (ctrl !== c) return;
      ctrl = null;
      const ghosts = E().getAnnotations().ghosts;
      const placed = Core.place(E().getText(), out.marks, ghosts, local);
      finishCheck(item, local, placed);
    }, (err) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (err && err.code === 'cancelled') return;
      errorCard(item.label, err, () => choose(item));
    });
  }

  function finishCheck(item, local, ai) {
    card.classList.remove('is-busy');
    const all = local.concat(ai).sort((a, b) => a.start - b.start);
    setMarks(all, item.type);
    const n = all.length;
    showCard(item.label, [n ? n + (n === 1 ? ' mark' : ' marks') : 'Nothing to mark', n ? 'Each one is marked on the page. Pick one to see why.' : 'Nothing stood out.'],
      [{ label: 'Done', primary: !n, run: () => { done(); E().focus(); } }]);
    if (n) card.append(markList());
  }

  /* ---------- Trim ---------- */
  function trim(k) {
    closePop(false);
    if (k === 0) { done(); E().focus(); return; }
    const lv = LEVELS[k];
    clearMarks();
    const title = lv.label;
    if (!E().getText().trim()) { showCard(title, ['Nothing to trim yet.'], [{ label: 'Done', run: done }]); return; }
    if (TDW.AI.status() === 'none') { needsKey(title); return; }
    const pub = app().publishText();
    const key = lv.pct + '\u0000' + pub;
    run = { kind: 'trim', level: k };
    syncLevels();
    if (cache.has(key)) { showCuts(k, cache.get(key)); return; }
    const c = new AbortController();
    ctrl = c;
    busyCard(title, 'Reading the whole draft…');
    TDW.AI.trim({ text: pub, percent: lv.pct }, c.signal).then((out) => {
      if (ctrl !== c) return;
      ctrl = null;
      const quotes = out.cuts.map((q) => ({ quote: q }));
      cache.set(key, quotes);
      showCuts(k, quotes);
    }, (err) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (err && err.code === 'cancelled') return;
      run = null;
      syncLevels();
      errorCard(title, err, () => trim(k));
    });
  }

  function showCuts(k, quotes) {
    card.classList.remove('is-busy');
    run = { kind: 'trim', level: k };
    level = k;
    const placed = Core.place(E().getText(), quotes, E().getAnnotations().ghosts, []);
    setMarks(placed.map((p) => ({ start: p.start, end: p.end, type: 'trim' })), 'trim');
    syncLevels();
    trimCard();
  }

  function counts() {
    const masked = app().masked();
    const before = TDW.Engine.countWords(masked);
    const cuts = marks().filter((m) => m.type === 'trim');
    const after = TDW.Engine.countWords(TDW.Marks.mask(masked, cuts));
    return { before, after, cuts };
  }

  function trimCard() {
    if (!run || run.kind !== 'trim') return;
    const lv = LEVELS[run.level];
    const c = counts();
    if (!marks().some((m) => m.type === 'trim' || m.type === 'trim-kept')) {
      showCard(lv.label, ['Nothing to cut', "It's tight already."], [{ label: 'Done', primary: true, run: () => { done(); E().focus(); } }]);
      return;
    }
    const pct = c.before ? Math.round((c.before - c.after) / c.before * 100) : 0;
    const spent = (c.before - c.after) * 10;
    showCard('Trim: ' + lv.label.toLowerCase(), ['Saves ' + TDW.UI.money(spent), c.before + ' → ' + c.after + ' words, ' + pct + '% shorter. Struck-out words would go; click one to keep it.'], [
      { label: 'Make the cuts', primary: true, run: makeCuts },
      { label: 'Walk through', run: startWalk },
      { label: 'Done', run: () => { done(); E().focus(); } }
    ]);
  }

  function cutNow(list) {
    if (!list.length) return 0;
    const before = app().state.words;
    const out = Core.applyCuts(E().getText(), E().getAnnotations(), list, { Marks: TDW.Marks, Engine: TDW.Engine, Inline: TDW.Inline });
    const keep = new Set(list.map((m) => m.id));
    E().change({ text: out.text, ann: out.ann, kind: 'edit' });
    // change() moved the other marks with the text; drop the ones just cut.
    E().setLab(E().getLab().filter((m) => !keep.has(m.id)));
    const saved = before - app().state.words;
    if (saved > 0) TDW.Sound.play('coin');
    return saved;
  }

  function makeCuts() {
    const list = marks().filter((m) => m.type === 'trim');
    endWalk(true);
    const saved = cutNow(list);
    done();
    E().focus();
    if (saved > 0) TDW.UI.toast('Cut ' + saved + (saved === 1 ? ' word' : ' words') + ', ' + TDW.UI.money(saved * 10) + ' back. ' + TDW.UI.keys('⌘Z') + ' undoes it.');
  }

  function toggleKeep(id) {
    E().setLab(marks().map((m) => (m.id === id ? Object.assign({}, m, { type: m.type === 'trim' ? 'trim-kept' : 'trim' }) : m)));
    if (walk) showWalk(); else trimCard();
  }

  /* ---------- Walk through ---------- */
  function remaining() { return marks().filter((m) => m.type === 'trim').sort((a, b) => a.start - b.start); }

  function startWalk() {
    const list = remaining();
    if (!list.length) { trimCard(); return; }
    walk = { id: list[0].id, at: list[0].start };
    showWalk();
  }

  function showWalk() {
    const list = remaining();
    let cur = list.find((m) => m.id === walk.id) || list.find((m) => m.start >= walk.at) || null;
    if (!cur) { endWalk(); trimCard(); return; }
    walk = { id: cur.id, at: cur.start };
    E().setActive(cur.id);
    E().render();
    E().scrollToIndex(cur.start, 0.4, true);
    const k = list.indexOf(cur) + 1;
    showCard('Walk through the cuts', ['Cut ' + k + ' of ' + list.length, 'Return cuts it, Backspace keeps it, Esc stops.'], [
      { label: 'Cut', primary: true, run: walkCut },
      { label: 'Keep', run: walkKeep },
      { label: 'Stop', run: () => { endWalk(); trimCard(); } }
    ]);
  }

  function walkCut() {
    const cur = remaining().find((m) => m.id === walk.id);
    if (!cur) { showWalk(); return; }
    walk.at = cur.start;
    walk.id = null;
    cutNow([cur]);
    showWalk();
  }

  function walkKeep() {
    const cur = remaining().find((m) => m.id === walk.id);
    if (!cur) { showWalk(); return; }
    walk.at = cur.end;
    walk.id = null;
    toggleKeep(cur.id);
  }

  function endWalk(quiet) {
    if (!walk) return;
    walk = null;
    E().setActive(null);
    E().render();
    if (!quiet) E().focus();
  }

  function onWalkKey(e) {
    if (!walk || e.isComposing) return;
    if (document.querySelector('dialog[open]')) return;
    const k = String(e.key || '').toLowerCase();
    const mod = e.metaKey || e.ctrlKey || e.altKey;
    if (mod) return;
    if (k === 'enter' || k === 'y') { e.preventDefault(); e.stopPropagation(); walkCut(); }
    else if (k === 'backspace' || k === 'n') { e.preventDefault(); e.stopPropagation(); walkKeep(); }
    else if (k === 'escape') { e.preventDefault(); e.stopPropagation(); endWalk(); trimCard(); }
  }

  /* ---------- Clicking a mark on the page ---------- */
  function hideTip() {}

  function onEditorClick(e) {
    const node = e.target.closest && e.target.closest('[data-lab]');
    if (!node) return;
    const m = marks().find((x) => x.id === node.dataset.lab);
    if (!m) return;
    if (m.type === 'trim' || m.type === 'trim-kept') { toggleKeep(m.id); return; }
    setTimeout(() => { if (TDW.Popover) TDW.Popover.hide(); pickMark(m.id); }, 0);
  }

  /* ---------- Module hooks ---------- */
  function onKey(e) {
    const k = String(e.key || '').toLowerCase();
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (k === 'l' || e.code === 'KeyL')) {
      e.preventDefault();
      togglePop();
      return;
    }
    if (k !== 'escape' || document.querySelector('dialog[open]') || e.defaultPrevented) return;
    if (pop) { e.preventDefault(); closePop(true); return; }
    if (card && card.isConnected && !walk) { e.preventDefault(); done(); }
  }

  TDW.Lab = {
    init() {
      btn = el('button', { type: 'button', id: 'lab-btn', class: 'btn-outline btn-sm', 'aria-haspopup': 'true', 'aria-expanded': 'false',
        title: 'Audit the draft: the Lab (' + (isMac ? '⌃⇧L' : 'Ctrl+Shift+L') + ')' }, TDW.UI.icon('spark'), 'Audit');
      btn.addEventListener('click', togglePop);
      document.getElementById('tools').append(btn);
      card = el('section', { id: 'lab-card', class: 'slip lab-card', role: 'status', 'aria-live': 'polite', 'aria-label': 'Audit' });
      document.getElementById('editor').addEventListener('click', onEditorClick);
      document.addEventListener('keydown', onWalkKey, true);
      document.addEventListener('keydown', onKey);
    },
    load() { done(); cache.clear(); cacheText = ''; },
    reload() { done(); },
    onText(text) {
      if (text !== cacheText) { cache.clear(); cacheText = text; }
      hideTip();
      if (!run) return;
      if (run.kind === 'trim') { if (walk) showWalk(); else trimCard(); }
    },
    onMode(m) { if (m !== 'edit') { closePop(false); done(); } },
    open: openPop,
    close: () => closePop(false),
    isOpen: () => !!pop,
    trim: (k) => trim(k),
    level: () => (run && run.kind === 'trim' ? run.level : 0),
    LEVELS, ITEMS
  };
})(typeof self !== 'undefined' ? self : this);
