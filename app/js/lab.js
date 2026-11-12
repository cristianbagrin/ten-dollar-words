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

  /* ---------- The Lab, reporting in the margin ----------
     Its checks run from the command palette. Their marks sit on the text in dashed pencil and
     each gets a note in the margin with the reason (Review draws them); a card at the margin's
     foot says what ran and ends it. Trim strikes in red what it would cut; its card says what
     you'd save, and you make the cuts, walk through them, or keep everything. */
  const app = () => TDW.App;
  const E = () => TDW.Editor;
  const M = () => TDW.Margin;
  const money = (n) => TDW.UI.money(n);

  const ITEMS = [
    { id: 'punctuation', type: 'fix', label: 'Fix punctuation and typos', desc: 'Marks slips; each note offers its one fix.', local: true, ai: true },
    { id: 'weakest', type: 'weak', label: 'Mark the weakest sentences', desc: 'Up to five that add the least, are vague, or repeat.', ai: true },
    { id: 'long', type: 'long', label: 'Mark sentences that run long', desc: 'Hard and very hard sentences. No AI needed.', local: true },
    { id: 'convoluted', type: 'convoluted', label: 'Mark convoluted sentences', desc: 'Hard to follow because of how they are built.', ai: true },
    { id: 'tone', type: 'tone', label: 'Mark words that don’t fit the tone', desc: 'Words that break the voice.', ai: true },
    { id: 'hedges', type: 'hedge', label: 'Mark hedges and filler', desc: 'Words that soften or pad without meaning.', local: true, ai: true },
    { id: 'message', label: 'Check the message', desc: 'What a busy reader takes away.' }
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
    qualifier: 'Softens without adding meaning.', complex: 'A wordy phrase: a plainer one says it.', adverb: 'An adverb: a stronger verb may do.'
  };

  let run = null;          // { kind: 'check', item } | { kind: 'trim', level }, while marks or a request are live
  let info = new Map();    // mark id → { reason, fix }
  let ctrl = null;
  let walk = null;         // { id, at } while walking through cuts
  let seq = 0;
  let busy = false;
  const cache = new Map(); // level + publishText → quotes
  let cacheText = '';

  const nextId = () => 'lab' + (++seq);
  const marks = () => E().getLab();

  /* ---------- The card ---------- */
  function card(o) { M().pin('lab', Object.assign({ tone: run && run.kind === 'trim' ? 'red' : 'blue' }, o)); }
  function hideCard() { M().unpin('lab'); }

  function stop() { if (ctrl) { ctrl.abort(); ctrl = null; } busy = false; }

  function clearMarks() {
    stop();
    if (TDW.Fx) TDW.Fx.scan(false);
    endWalk(true);
    info = new Map();
    run = null;
    if (E().getLab().length) E().setLab([]);
  }

  // Back to the review as it was.
  function done() {
    clearMarks();
    hideCard();
    if (app().state.mode === 'edit') app().refresh();
    if (TDW.Review) TDW.Review.redraw();
  }

  function begin(r) {
    clearMarks();
    run = r;
    if (app().state.mode !== 'edit') app().setMode('edit');
    else app().refresh();
    if (TDW.Margin && !M().isNarrow() && M().view() !== 'review') M().setView('review');
  }

  function needsKey(title) {
    card({ title, meta: '', body: TDW.UI.el('p', { class: 'lab-why', text: 'This one needs a Gemini key.' }), actions: [
      { label: 'Add a key', primary: true, run: () => { done(); app().openSettings('ai'); } },
      { label: 'Close', run: done }] });
  }

  function errorCard(title, err, retry) {
    busy = false;
    card({ title, body: TDW.UI.el('p', { class: 'rn-error', text: TDW.AI.errorMessage(err) }), actions: [{ label: 'Try again', primary: true, run: retry }, { label: 'Close', run: done }] });
  }

  function setMarks(list, kind) {
    info = new Map();
    E().setLab(list.map((m) => {
      const id = nextId();
      info.set(id, { reason: m.reason || '', fix: m.fix || '' });
      return { start: m.start, end: m.end, type: m.type || kind, id };
    }));
    if (TDW.Review) TDW.Review.redraw();
  }

  /* ---------- Checks ---------- */
  function localMarks(item, text) {
    const a = app().analyze(text);
    const out = [];
    for (const i of a.issues) {
      if (item.id === 'long' && (i.type === 'hard' || i.type === 'veryHard')) out.push({ start: i.start, end: i.end, reason: LOCAL_REASON[i.type] });
      if (item.id === 'hedges' && (i.type === 'qualifier' || i.type === 'complex' || i.type === 'adverb')) out.push({ start: i.start, end: i.end, reason: LOCAL_REASON[i.type] });
      if (item.id === 'punctuation' && i.type === 'spelling') {
        const fixes = TDW.Spell && TDW.Spell.isReady() ? TDW.Spell.suggest(i.text) : [];
        out.push({ start: i.start, end: i.end, reason: 'Not in the dictionary.', fix: fixes[0] || '' });
      }
    }
    return out;
  }

  function check(id) {
    const item = ITEMS.find((x) => x.id === id);
    if (!item) return;
    if (item.id === 'message') { if (app().state.mode !== 'edit') app().setMode('edit'); TDW.Review.startMessage(); return; }
    if (!E().getText().trim()) { TDW.UI.toast('Nothing to check yet.'); return; }
    const local = item.local ? localMarks(item, app().masked()) : [];
    const useAI = item.ai && (TDW.AI.status() !== 'none' || TDW.mockAI);
    begin({ kind: 'check', item });
    if (!useAI) {
      if (!item.local) { needsKey(item.label); return; }
      finishCheck(item, local, []);
      return;
    }
    const c = new AbortController();
    ctrl = c;
    busy = true;
    if (local.length) setMarks(local, item.type);
    card({ title: item.label, meta: 'Reading…', busy: true, body: TDW.UI.el('p', { class: 'rn-busy' }, TDW.UI.el('span', { class: 'dots', 'aria-hidden': 'true' }), 'Reading the whole draft'), actions: [{ label: 'Stop', run: done }] });
    TDW.AI.lab({ check: item.id, text: app().publishText() }, c.signal).then((out) => {
      if (ctrl !== c) return;
      ctrl = null;
      busy = false;
      const placed = Core.place(E().getText(), out.marks, E().getAnnotations().ghosts, local);
      finishCheck(item, local, placed);
    }, (err) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (err && err.code === 'cancelled') return;
      errorCard(item.label, err, () => check(item.id));
    });
  }

  function finishCheck(item, local, ai) {
    const all = local.concat(ai).sort((a, b) => a.start - b.start);
    setMarks(all, item.type);
    checkCard();
  }

  function checkCard() {
    if (!run || run.kind !== 'check') return;
    const n = marks().length;
    card({ title: run.item.label, meta: n ? n + (n === 1 ? ' mark' : ' marks') : '',
      body: TDW.UI.el('p', { class: 'lab-why', text: n ? '' : 'Nothing stood out.' }),
      actions: [{ label: 'Done', primary: true, run: () => { done(); E().focus(); } }] });
  }

  /* ---------- Trim ---------- */
  function trim(k) {
    if (!k) { done(); return; }
    const lv = LEVELS[k];
    if (!E().getText().trim()) { TDW.UI.toast('Nothing to trim yet.'); return; }
    begin({ kind: 'trim', level: k });
    if (TDW.AI.status() === 'none' && !TDW.mockAI) { needsKey(lv.label); return; }
    const pub = app().publishText();
    const key = lv.pct + '\u0000' + pub;
    if (cache.has(key)) { showCuts(k, cache.get(key)); return; }
    if (TDW.Fx) TDW.Fx.scan(true);
    const c = new AbortController();
    ctrl = c;
    busy = true;
    card({ title: lv.label, meta: 'Reading…', busy: true, body: TDW.UI.el('p', { class: 'rn-busy' }, TDW.UI.el('span', { class: 'dots', 'aria-hidden': 'true' }), 'Finding about ' + lv.pct + '% to cut'), actions: [{ label: 'Stop', run: done }] });
    TDW.AI.trim({ text: pub, percent: lv.pct }, c.signal).then((out) => {
      if (ctrl !== c) return;
      ctrl = null;
      busy = false;
      const quotes = out.cuts.map((q) => ({ quote: q }));
      cache.set(key, quotes);
      showCuts(k, quotes);
    }, (err) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (TDW.Fx) TDW.Fx.scan(false);
      if (err && err.code === 'cancelled') return;
      errorCard(lv.label, err, () => trim(k));
    });
  }

  function showCuts(k, quotes) {
    run = { kind: 'trim', level: k };
    const placed = Core.place(E().getText(), quotes, E().getAnnotations().ghosts, []);
    setMarks(placed.map((p) => ({ start: p.start, end: p.end, type: 'trim' })), 'trim');
    trimCard();
    if (TDW.Fx) TDW.Fx.zap();
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
    const el = TDW.UI.el;
    if (!marks().some((m) => m.type === 'trim' || m.type === 'trim-kept')) {
      card({ title: lv.label, body: el('p', { class: 'lab-why', text: 'Nothing to cut. It’s tight already.' }), actions: [{ label: 'Done', primary: true, run: () => { done(); E().focus(); } }] });
      return;
    }
    const saved = (c.before - c.after) * 10;
    card({ title: lv.label, meta: c.cuts.length + (c.cuts.length === 1 ? ' cut' : ' cuts'),
      body: el('div', null,
        el('p', { class: 'trim-line' }, el('span', { class: 'trim-words', text: c.before + ' → ' + c.after + ' words' }), el('span', { class: 'trim-saved', text: money(saved) + ' saved' })),
        el('p', { class: 'lab-why', text: 'Struck words would go. Click one to keep it.' })),
      actions: [
        { label: 'Make the cuts', primary: true, run: makeCuts, disabled: !c.cuts.length },
        { label: 'Walk through', run: startWalk, disabled: !c.cuts.length },
        { label: 'Keep all', run: () => { done(); E().focus(); } }
      ] });
  }

  function cutNow(list) {
    if (!list.length) return 0;
    const before = app().state.words;
    const shot = TDW.Fx ? TDW.Fx.capture(list) : null;
    const out = Core.applyCuts(E().getText(), E().getAnnotations(), list, { Marks: TDW.Marks, Engine: TDW.Engine, Inline: TDW.Inline });
    const keep = new Set(list.map((m) => m.id));
    E().change({ text: out.text, ann: out.ann, kind: 'edit' });
    E().setLab(E().getLab().filter((m) => !keep.has(m.id)));
    const saved = before - app().state.words;
    if (saved > 0) { if (shot) TDW.Fx.cut(shot, saved); TDW.Sound.play('coin'); }
    return saved;
  }

  function makeCuts() {
    const list = marks().filter((m) => m.type === 'trim');
    endWalk(true);
    const saved = cutNow(list);
    done();
    E().focus();
    if (saved > 0) TDW.UI.toast('Cut ' + saved + (saved === 1 ? ' word, ' : ' words, ') + money(saved * 10) + ' saved', { label: 'Undo', run: () => E().undo() });
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
    const cur = list.find((m) => m.id === walk.id) || list.find((m) => m.start >= walk.at) || null;
    if (!cur) { endWalk(); trimCard(); return; }
    walk = { id: cur.id, at: cur.start };
    E().setActive(cur.id);
    E().render();
    E().scrollToIndex(cur.start, 0.4, true);
    const k = list.indexOf(cur) + 1;
    const el = TDW.UI.el;
    card({ title: 'Walk through', meta: k + ' of ' + list.length,
      body: el('p', { class: 'lab-why' }, 'Return or Y cuts it. Backspace or N keeps it. Esc stops.'),
      actions: [{ label: 'Cut', primary: true, run: walkCut }, { label: 'Keep', run: walkKeep }, { label: 'Stop', run: () => { endWalk(); trimCard(); } }] });
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
    if (!walk || e.isComposing || document.querySelector('dialog[open]:modal')) return;
    const k = String(e.key || '').toLowerCase();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'enter' || k === 'y') { e.preventDefault(); e.stopPropagation(); walkCut(); }
    else if (k === 'backspace' || k === 'n') { e.preventDefault(); e.stopPropagation(); walkKeep(); }
    else if (k === 'escape') { e.preventDefault(); e.stopPropagation(); endWalk(); trimCard(); }
  }

  /* ---------- For the margin notes ---------- */
  function notes() {
    if (!run || run.kind !== 'check') return [];
    const t = E().getText();
    return marks().filter((m) => m.type !== 'trim' && m.type !== 'trim-kept' && m.type !== 'note-target')
      .map((m) => Object.assign({ text: t.slice(m.start, m.end) }, m, info.get(m.id) || {}));
  }

  function applyFix(id) {
    const m = marks().find((x) => x.id === id);
    const it = info.get(id);
    if (!m || !it || !it.fix) return;
    app().edit(m.start, m.end, it.fix, { silent: true });
    E().focus();
    checkCard();
  }

  function dismiss(id) {
    E().setLab(marks().filter((m) => m.id !== id));
    if (TDW.Review) TDW.Review.redraw();
    checkCard();
  }

  function onEditorClick(e) {
    const node = e.target.closest && e.target.closest('[data-lab]');
    if (!node) return;
    const m = marks().find((x) => x.id === node.dataset.lab);
    if (m && (m.type === 'trim' || m.type === 'trim-kept')) toggleKeep(m.id);
  }

  TDW.Lab = {
    init() {
      E().rootEl().addEventListener('click', onEditorClick);
      document.addEventListener('keydown', onWalkKey, true);
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || document.querySelector('dialog[open]:modal') || !run || walk || TDW.UI.menuOpen()) return;
        if (TDW.Review && TDW.Review.isOpen()) return;
        done();
      });
    },
    load() { if (run) done(); cache.clear(); cacheText = ''; },
    reload() { if (run) done(); },
    onText(text) {
      if (text !== cacheText) { cache.clear(); cacheText = text; }
      if (!run) return;
      if (run.kind === 'trim') { if (walk) showWalk(); else trimCard(); }
      else checkCard();
    },
    onMode(m) { if (m !== 'edit' && run) { clearMarks(); hideCard(); } },
    open: () => TDW.Palette.open({ page: 'lab' }),
    close: () => { if (TDW.Palette.isOpen()) TDW.Palette.close(); },
    isOpen: () => TDW.Palette.isOpen(),
    run: check, trim, done,
    isRunning: () => !!run,
    notes, applyFix, dismiss,
    LEVELS, ITEMS
  };
})(typeof self !== 'undefined' ? self : this);
