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

  /* ---------- The Lab tab ----------
     Checks that only mark text and never rewrite it, Trim, the result of the last run, and the
     mark you clicked. The marks show on the page while the Lab tab is in front. */
  const app = () => TDW.App;
  const E = () => TDW.Editor;
  const el = (...a) => TDW.UI.el(...a);

  const ITEMS = [
    { id: 'punctuation', type: 'fix', label: 'Fix punctuation and typos', desc: 'Marks typos and punctuation slips. Click one for its fix; nothing changes until you take it.', local: true, ai: true },
    { id: 'weakest', type: 'weak', label: 'Mark the weakest sentences', desc: 'Up to five sentences that add the least, are vague, or repeat.', ai: true },
    { id: 'long', type: 'long', label: 'Mark sentences that run long', desc: 'Hard and very hard sentences. Instant, no AI needed.', local: true },
    { id: 'convoluted', type: 'convoluted', label: 'Mark convoluted sentences', desc: 'Hard to follow because of how they’re built, even short ones.', ai: true },
    { id: 'tone', type: 'tone', label: 'Mark words that don’t fit the tone', desc: 'Fancy words in plain writing, slang in formal writing.', ai: true },
    { id: 'hedges', type: 'hedge', label: 'Mark hedges and filler', desc: 'Words that soften or pad without adding meaning.', local: true, ai: true },
    { id: 'message', label: 'Check the message', desc: 'What a busy reader takes away, and whether it’s what you meant. Opens in Review.' }
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

  let host = null, cardEl = null, tipEl = null, levelsEl = null;
  let run = null;          // what the marks on the page came from: { kind: 'check', item } | { kind: 'trim', level }
  let info = new Map();    // mark id → { reason, fix }
  let ctrl = null;
  let walk = null;         // { id, at } while walking through cuts
  let level = 0;
  let seq = 0;
  const cache = new Map(); // publishText + level → quotes
  let cacheText = '';

  const nextId = () => 'lab' + (++seq);
  const marks = () => E().getLab();
  const inFront = () => TDW.Inspector.isOpen() && TDW.Inspector.tab() === 'lab' && !TDW.Inspector.pushed();

  function build() {
    host = TDW.Inspector.pane('lab');
    cardEl = el('div', { class: 'lab-card', role: 'status', 'aria-live': 'polite', hidden: true });
    tipEl = el('div', { class: 'lab-tip', hidden: true });
    const list = el('ul', { class: 'lab-list' }, ITEMS.map((it) => el('li', null,
      el('button', { type: 'button', class: 'lab-item', dataset: { item: it.id }, onclick: () => choose(it) },
        el('span', { class: 'lab-item-label' }, it.label, it.ai && !it.local ? el('span', { class: 'tag', text: 'AI' }) : null),
        el('span', { class: 'lab-item-desc', text: it.desc })))));
    levelsEl = el('div', { class: 'lab-levels', role: 'group', 'aria-label': 'Trim' }, LEVELS.map((lv, k) =>
      el('button', { type: 'button', class: 'lab-level', 'aria-pressed': String(k === 0), dataset: { level: String(k) }, onclick: () => trim(k) },
        el('span', { class: 'lab-level-label', text: lv.label }),
        el('span', { class: 'lab-level-pct', text: lv.pct ? '~' + lv.pct + '%' : 'as written' }))));
    host.append(cardEl, tipEl,
      el('section', { class: 'rv-sec' }, el('div', { class: 'rv-label', text: 'Checks' }), list),
      el('section', { class: 'rv-sec' }, el('div', { class: 'rv-row' }, el('span', { class: 'rv-label', text: 'Trim' }), el('span', { class: 'tag', text: 'AI' })),
        el('p', { class: 'hint', text: 'The AI fades what it would cut. It only cuts; it never rewrites. Click a faded passage to keep it.' }), levelsEl));
  }

  function syncLevels() {
    for (const b of levelsEl.querySelectorAll('.lab-level')) b.setAttribute('aria-pressed', String(Number(b.dataset.level) === (run && run.kind === 'trim' ? run.level : 0)));
    for (const b of host.querySelectorAll('.lab-item')) b.classList.toggle('is-on', !!run && run.kind === 'check' && run.item.id === b.dataset.item);
  }

  /* ---------- The result card, at the top of the tab ---------- */
  function showCard(title, line, buttons) {
    cardEl.replaceChildren(
      el('div', { class: 'lab-card-head' }, el('b', { class: 'lab-card-title', text: title }), line ? el('span', { class: 'lab-card-line', text: line[0] }) : null),
      line && line[1] ? el('p', { class: 'hint', text: line[1] }) : null,
      buttons && buttons.length ? el('div', { class: 'row-start' }, buttons.map((b) =>
        el('button', { type: 'button', class: 'btn btn-sm' + (b.primary ? '' : ' btn-outline'), text: b.label, onclick: b.run }))) : null);
    cardEl.hidden = false;
    cardEl.classList.remove('is-busy');
  }
  const hideCard = () => { if (cardEl) cardEl.hidden = true; };
  function busyCard(title, what) {
    showCard(title, [what], [{ label: 'Stop', run: () => { stop(); done(); } }]);
    cardEl.classList.add('is-busy');
  }
  function errorCard(title, err, retry) {
    showCard(title, [TDW.AI.errorMessage(err)], [{ label: 'Try again', primary: true, run: retry }, { label: 'Done', run: done }]);
  }
  function needsKey(title) {
    showCard(title, ['Connect Gemini in Settings to use this one.'], [
      { label: 'Open Settings', primary: true, run: () => { done(); app().openSettings('ai'); } },
      { label: 'Done', run: done }]);
  }

  /* ---------- Running a check ---------- */
  function stop() { if (ctrl) { ctrl.abort(); ctrl = null; } if (cardEl) cardEl.classList.remove('is-busy'); }

  function clearMarks() {
    stop();
    endWalk(true);
    info = new Map();
    run = null;
    level = 0;
    if (E().getLab().some((m) => m.type !== 'note-target')) E().setLab(E().getLab().filter((m) => m.type === 'note-target'));
    hideTip();
    if (levelsEl) syncLevels();
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
      if (item.id === 'hedges' && (i.type === 'qualifier' || i.type === 'complex' || i.type === 'adverb')) out.push({ start: i.start, end: i.end, reason: LOCAL_REASON[i.type] });
      if (item.id === 'punctuation' && i.type === 'spelling') {
        const fixes = TDW.Spell && TDW.Spell.isReady() ? TDW.Spell.suggest(i.text) : [];
        out.push({ start: i.start, end: i.end, reason: 'Not in the dictionary.', fix: fixes[0] || '' });
      }
    }
    return out;
  }

  function choose(item) {
    if (item.id === 'message') { done(); TDW.Panel.startMessage(); return; }
    clearMarks();
    const text = E().getText();
    if (!text.trim()) { showCard(item.label, ['Nothing to check yet.'], [{ label: 'Done', run: done }]); return; }
    const local = item.local ? localMarks(item, app().masked()) : [];
    const useAI = item.ai && TDW.AI.status() !== 'none';
    run = { kind: 'check', item };
    syncLevels();
    if (!useAI) {
      if (!item.local) { needsKey(item.label); run = null; syncLevels(); return; }
      finishCheck(item, local, []);
      return;
    }
    const c = new AbortController();
    ctrl = c;
    if (local.length) setMarks(local, item.type);
    busyCard(item.label, 'Reading the whole draft');
    TDW.AI.lab({ check: item.id, text: app().publishText() }, c.signal).then((out) => {
      if (ctrl !== c) return;
      ctrl = null;
      const placed = Core.place(E().getText(), out.marks, E().getAnnotations().ghosts, local);
      finishCheck(item, local, placed);
    }, (err) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (err && err.code === 'cancelled') return;
      errorCard(item.label, err, () => choose(item));
    });
  }

  function finishCheck(item, local, ai) {
    const all = local.concat(ai).sort((a, b) => a.start - b.start);
    setMarks(all, item.type);
    const n = all.length;
    showCard(item.label, [n ? n + (n === 1 ? ' mark' : ' marks') : 'Nothing to mark', n ? 'Click a mark on the page to see why.' : 'Nothing stood out.'],
      [{ label: 'Done', primary: !n, run: () => { done(); E().focus(); } }]);
  }

  /* ---------- Trim ---------- */
  function trim(k) {
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
    busyCard(title, 'Reading the whole draft');
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
      showCard(lv.label, ['Nothing to cut', 'It’s tight already.'], [{ label: 'Done', primary: true, run: () => { done(); E().focus(); } }]);
      return;
    }
    const saved = (c.before - c.after) * 10;
    showCard(lv.label, [c.before + ' to ' + c.after + ' words, saves ' + TDW.UI.money(saved), 'Faded words would go. Click one to keep it.'], [
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
    if (saved > 0) TDW.UI.toast('Cut ' + saved + (saved === 1 ? ' word' : ' words') + ', saved ' + TDW.UI.money(saved * 10), { label: 'Undo', run: () => E().undo() });
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
    showCard('Walk through', ['Cut ' + k + ' of ' + list.length, 'Return or Y cuts it. Backspace or N keeps it. Esc stops.'], [
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
    if (!walk || e.isComposing || document.querySelector('dialog[open]')) return;
    const k = String(e.key || '').toLowerCase();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (k === 'enter' || k === 'y') { e.preventDefault(); e.stopPropagation(); walkCut(); }
    else if (k === 'backspace' || k === 'n') { e.preventDefault(); e.stopPropagation(); walkKeep(); }
    else if (k === 'escape') { e.preventDefault(); e.stopPropagation(); endWalk(); trimCard(); }
  }

  /* ---------- Clicking a mark: why, in the tab ---------- */
  function hideTip() { if (tipEl) { tipEl.hidden = true; tipEl.replaceChildren(); } }
  function showTip(m) {
    const it = info.get(m.id) || {};
    const quote = TDW.Inline.plain(E().getText().slice(m.start, m.end));
    const kids = [el('div', { class: 'rv-row' }, el('span', { class: 'rv-label', text: 'Selected mark' }),
      el('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Close', onclick: hideTip }, TDW.UI.icon('close'))),
    el('p', { class: 'page-quote fix-quote', text: quote.length > 140 ? quote.slice(0, 137) + '…' : quote }),
    el('p', { class: 'fix-msg', text: it.reason || 'Marked by the Lab.' })];
    if (it.fix && it.fix !== E().getText().slice(m.start, m.end)) {
      kids.push(el('div', { class: 'row-start' }, el('button', {
        type: 'button', class: 'btn btn-sm',
        onclick: () => {
          const cur = marks().find((x) => x.id === m.id);
          hideTip();
          if (!cur) return;
          app().edit(cur.start, cur.end, it.fix, { silent: true });
          E().focus();
        }
      }, 'Fix: ' + it.fix)));
    }
    tipEl.replaceChildren(...kids);
    tipEl.hidden = false;
    E().setActive(m.id);
    requestAnimationFrame(() => tipEl.scrollIntoView({ block: 'nearest' }));
  }

  function onEditorClick(e) {
    if (!inFront()) return;
    const node = e.target.closest && e.target.closest('[data-lab]');
    if (!node) { hideTip(); return; }
    const m = marks().find((x) => x.id === node.dataset.lab);
    if (!m || m.type === 'note-target') return;
    if (m.type === 'trim' || m.type === 'trim-kept') { toggleKeep(m.id); return; }
    showTip(m);
  }

  function onKey(e) {
    const k = String(e.key || '').toLowerCase();
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (k === 'l' || e.code === 'KeyL')) {
      e.preventDefault();
      if (inFront()) app().setMode('write', { keepLibrary: true }); else openLab();
      return;
    }
    if (k !== 'escape' || document.querySelector('dialog[open]') || !inFront() || TDW.UI.menuOpen()) return;
    if (tipEl && !tipEl.hidden) { hideTip(); return; }
    if (cardEl && !cardEl.hidden && !walk && document.activeElement === E().rootEl()) done();
  }

  function openLab() {
    app().openTab('lab');
    requestAnimationFrame(() => { const b = host.querySelector('.lab-item'); if (b && !TDW.UI.device.touch) b.focus({ preventScroll: true }); });
  }

  TDW.Lab = {
    init() {
      build();
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
    onMode(m) { if (m !== 'edit') done(); },
    onTab(t) { if (t !== 'lab') { endWalk(true); hideTip(); } },
    open: openLab,
    close: () => { done(); if (inFront()) TDW.Inspector.select('review'); },
    isOpen: inFront,
    LEVELS, ITEMS
  };
})(typeof self !== 'undefined' ? self : this);
