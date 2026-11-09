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
    { id: 'punctuation', type: 'fix', label: 'Fix punctuation and typos', desc: 'Marks typos and punctuation slips. Click one to see its fix; nothing changes until you take it.', local: true, ai: true },
    { id: 'weakest', type: 'weak', label: 'Mark the weakest sentences', desc: 'Up to five sentences that add the least, are vague, or repeat.', ai: true },
    { id: 'long', type: 'long', label: 'Mark sentences that run long', desc: 'Hard and very hard sentences. Instant, no AI needed.', local: true },
    { id: 'convoluted', type: 'convoluted', label: 'Mark convoluted sentences', desc: 'Sentences that are hard to follow because of how they are built, even short ones.', ai: true },
    { id: 'tone', type: 'tone', label: 'Mark words that don’t fit the tone', desc: 'Fancy words in plain writing, slang in formal writing: words that break the voice.', ai: true },
    { id: 'hedges', type: 'hedge', label: 'Mark hedges and filler', desc: 'Words that soften or pad without adding meaning.', local: true, ai: true },
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

  let pop, card, tip, btn;
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

  /* ---------- Popup ---------- */
  function buildPop() {
    pop = el('div', { id: 'lab-pop', class: 'lab-pop', role: 'dialog', 'aria-label': 'The Lab', hidden: true });
    const descBtn = el('button', { type: 'button', class: 'lab-what', text: 'what each idea does', 'aria-pressed': 'false' });
    descBtn.addEventListener('click', () => {
      const on = !pop.classList.contains('show-desc');
      pop.classList.toggle('show-desc', on);
      descBtn.setAttribute('aria-pressed', String(on));
    });
    const list = el('ul', { class: 'lab-list' }, ITEMS.map((it) => el('li', null,
      el('button', { type: 'button', class: 'lab-item', 'data-item': it.id, title: it.desc, onclick: () => choose(it) },
        el('span', { class: 'lab-item-label', text: it.label }),
        el('span', { class: 'lab-item-desc', text: it.desc })))));
    const row = el('div', { class: 'lab-levels', role: 'group', 'aria-label': 'Trim' }, LEVELS.map((lv, k) =>
      el('button', { type: 'button', class: 'lab-level' + (k === 0 ? ' is-on' : ''), 'data-level': String(k), onclick: () => trim(k) },
        el('span', { class: 'lab-level-label', text: lv.label }),
        lv.pct ? el('span', { class: 'lab-level-pct', text: '~' + lv.pct + '%' }) : null)));
    pop.append(el('div', { class: 'lab-head' }, el('span', { class: 'lab-title', text: 'The Lab guide…' }), descBtn), list, row);
    document.body.append(pop);
  }

  function openPop() {
    if (app().state.mode !== 'edit') app().setMode('edit');
    hideTip();
    card.classList.add('is-under'); // the popup takes the card's place while it's open
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    syncLevels();
    const first = pop.querySelector('.lab-item');
    if (first) first.focus({ preventScroll: true });
  }
  function closePop(refocus) {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    card.classList.remove('is-under');
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) E().focus();
  }
  const togglePop = () => (pop.hidden ? openPop() : closePop(true));

  function syncLevels() {
    for (const b of pop.querySelectorAll('.lab-level')) b.classList.toggle('is-on', Number(b.dataset.level) === (run && run.kind === 'trim' ? run.level : 0));
  }

  /* ---------- Card ---------- */
  function showCard(title, line, buttons) {
    card.replaceChildren(
      el('div', { class: 'lab-card-head' }, el('b', { class: 'lab-card-title', text: title }), line ? el('span', { class: 'lab-card-line', text: line[0] }) : null),
      line && line[1] ? el('p', { class: 'lab-card-note', text: line[1] }) : null,
      buttons && buttons.length ? el('div', { class: 'lab-card-actions' }, buttons.map((b) =>
        el('button', { type: 'button', class: 'lab-card-btn' + (b.primary ? ' is-primary' : ''), text: b.label, onclick: b.run }))) : null);
    card.hidden = false;
  }
  const hideCard = () => { if (card) card.hidden = true; };

  function busyCard(title, what) {
    showCard(title, [what], [{ label: 'Stop', run: () => { stop(); done(); } }]);
    card.classList.add('is-busy');
  }

  function errorCard(title, err, retry) {
    card.classList.remove('is-busy');
    showCard(title, [TDW.AI.errorMessage(err)], [{ label: 'Try again', primary: true, run: retry }, { label: 'Done', run: done }]);
  }

  function needsKey(title) {
    showCard(title, ['Connect Gemini in Settings to use this one.'], [
      { label: 'Open Settings', primary: true, run: () => { done(); app().openSettings('ai'); } },
      { label: 'Done', run: done }]);
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
    if (pop) syncLevels();
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
    showCard(item.label, [n ? n + (n === 1 ? ' mark' : ' marks') : 'Nothing to mark', n ? 'Click a mark to see why.' : 'Nothing stood out.'],
      [{ label: 'Done', primary: !n, run: () => { done(); E().focus(); } }]);
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
    showCard(lv.label, [c.before + ' → ' + c.after + ' words · −' + pct + '%', 'Faded words would go. Click one to keep it.'], [
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
    if (saved > 0) TDW.UI.toast('Cut ' + saved + (saved === 1 ? ' word' : ' words') + '. ' + TDW.UI.keys('⌘Z') + ' brings them back.');
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
    showCard('Walk through', ['Cut ' + k + ' of ' + list.length, 'Return cuts it · Backspace keeps it · Esc stops'], [
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

  /* ---------- Clicking a mark ---------- */
  function hideTip() { if (tip) tip.hidden = true; }

  function showTip(m, anchor) {
    const it = info.get(m.id) || {};
    const kids = [el('p', { class: 'lab-tip-why', text: it.reason || 'Marked by the Lab.' })];
    if (it.fix && it.fix !== E().getText().slice(m.start, m.end)) {
      kids.push(el('button', {
        type: 'button', class: 'lab-tip-fix', text: 'Fix: ' + it.fix,
        onclick: () => {
          const cur = marks().find((x) => x.id === m.id);
          hideTip();
          if (!cur) return;
          app().edit(cur.start, cur.end, it.fix, { silent: true });
          E().focus();
        }
      }));
    }
    tip.replaceChildren(...kids);
    tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 32);
    tip.style.maxWidth = w + 'px';
    const left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16));
    tip.style.left = left + 'px';
    tip.style.top = (r.bottom + 6) + 'px';
    const th = tip.getBoundingClientRect().height;
    if (r.bottom + 6 + th > window.innerHeight - 8) tip.style.top = Math.max(8, r.top - th - 6) + 'px';
  }

  function onEditorClick(e) {
    const node = e.target.closest && e.target.closest('[data-lab]');
    if (!node) { hideTip(); return; }
    const m = marks().find((x) => x.id === node.dataset.lab);
    if (!m) return;
    if (m.type === 'trim' || m.type === 'trim-kept') { toggleKeep(m.id); return; }
    setTimeout(() => { if (TDW.Popover) TDW.Popover.hide(); showTip(m, node); }, 0);
  }

  /* ---------- Module hooks ---------- */
  function onKey(e) {
    const k = String(e.key || '').toLowerCase();
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (k === 'l' || e.code === 'KeyL')) {
      e.preventDefault();
      togglePop();
      return;
    }
    if (k !== 'escape' || document.querySelector('dialog[open]')) return;
    if (pop && !pop.hidden) { closePop(true); return; }
    if (tip && !tip.hidden) { hideTip(); return; }
    if (card && !card.hidden && !walk) { done(); }
  }

  TDW.Lab = {
    init() {
      const slot = document.getElementById('dock-center');
      btn = el('button', { type: 'button', id: 'lab-btn', class: 'lab-btn', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', text: 'LAB',
        title: 'The Lab (' + (isMac ? '⌃⇧L' : 'Ctrl+Shift+L') + ')' });
      btn.addEventListener('click', togglePop);
      if (slot) slot.append(btn); else document.body.append(btn);
      buildPop();
      card = el('div', { id: 'lab-card', class: 'lab-card', role: 'status', 'aria-live': 'polite', hidden: true });
      tip = el('div', { id: 'lab-tip', class: 'lab-tip', role: 'tooltip', hidden: true });
      document.body.append(card, tip);
      document.getElementById('editor').addEventListener('click', onEditorClick);
      document.addEventListener('keydown', onWalkKey, true);
      document.addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', (e) => {
        if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== btn) closePop(false);
        if (tip && !tip.hidden && !tip.contains(e.target) && !(e.target.closest && e.target.closest('[data-lab]'))) hideTip();
      });
      window.addEventListener('scroll', hideTip, { passive: true });
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
    isOpen: () => !!pop && !pop.hidden,
    LEVELS, ITEMS
  };
})(typeof self !== 'undefined' ? self : this);
