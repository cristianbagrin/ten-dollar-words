/* The selected fix. Nothing opens over the text: clicking a highlight (or a fix row) selects
   that fix in the Review tab, where it opens under its row with the words it's about, what to
   do, the quick fixes and the AI. ‹ › step through the fixes of that kind. The module keeps the
   old name and API (TDW.Popover.show / showAt / hide / isOpen) so the rest of the app is the same. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, money, plural, costNote, toast } = TDW.UI;
  const { Engine, Editor } = TDW;
  const app = () => TDW.App;

  const INFO = {
    spelling: ['Spelling', 'Not in the dictionary. Did you mean:'],
    veryHard: ['Very hard to read', 'Readers will lose the thread. Split it or cut it.'],
    hard: ['Hard to read', 'Shorten it or split it in two.'],
    complex: ['Wordy', 'A simpler word says it:'],
    passive: ['Passive voice', 'Say who did what.'],
    adverb: ['Adverb', 'Cut it, or pick a stronger verb.'],
    qualifier: ['Weakener', 'Say it like you mean it.']
  };
  const INTENSIFIERS = new Set(TDW.Data.INTENSIFIERS);
  const NEXT_WORD = /^[ \t ]+([A-Za-z'’-]+)/;
  const isSentence = (t) => t === 'hard' || t === 'veryHard';

  let current = null;   // the issue shown
  let box = null;       // its detail node
  let ctrl = null;

  function stopAI() { if (ctrl) { ctrl.abort(); ctrl = null; } }

  function hide() {
    stopAI();
    if (box) { box.hidden = true; box.replaceChildren(); if (box.parentNode) box.parentNode.classList.remove('is-open'); }
    box = null;
    if (current) Editor.setActive(null);
    current = null;
  }

  function sentenceOf(index) {
    const a = app().state.analysis;
    return (a && a.sentenceList.find((r) => r.start <= index && index < r.end)) || null;
  }
  const sentenceStartOf = (index) => { const s = sentenceOf(index); return s ? s.start : -1; };
  const stillThere = (issue) => Editor.getText().slice(issue.start, issue.end) === issue.text;

  function cutRange(issue, start, end) {
    if (!stillThere(issue)) { hide(); return; }
    hide();
    app().cut(start, end, sentenceStartOf(start));
  }
  function swap(issue, word) {
    if (!stillThere(issue)) { hide(); return; }
    hide();
    app().edit(issue.start, issue.end, word);
  }

  const cutButton = (issue, amount) =>
    el('button', { type: 'button', class: 'btn btn-sm', onclick: () => cutRange(issue, issue.start, issue.end) }, 'Cut it', el('span', { class: 'btn-note', text: 'saves ' + money(amount) }));

  // A word chip with what it does to the money: "exhausted, saves $10".
  const chip = (word, savedWords, onclick, note) =>
    el('button', { type: 'button', class: 'chip', title: note || null, onclick }, el('span', { class: 'chip-word', text: word }),
      el('span', { class: 'chip-note', text: costNote(savedWords) }));

  const needKey = () => el('p', { class: 'hint' }, 'Connect Gemini in ', el('button', { type: 'button', class: 'link-btn', text: 'Settings', onclick: () => app().openSettings('ai') }), ' for this.');

  function aiButton(issue, slot) {
    const off = TDW.AI.status() === 'none';
    slot.append(el('button', { type: 'button', class: 'btn btn-outline btn-sm', disabled: off, onclick: () => runAI(issue, slot) },
      icon('spark'), issue.type === 'passive' ? 'Rewrite with AI' : 'Simplify with AI'));
    if (off) slot.append(needKey());
  }

  // "More options" / "A stronger word": the AI's swaps for a weak phrase, as alternatives.
  function strongerSlot(target, label) {
    const slot = el('div', { class: 'fix-ai' });
    const idle = () => {
      stopAI();
      const off = TDW.AI.status() === 'none';
      slot.replaceChildren(el('button', { type: 'button', class: 'btn btn-outline btn-sm', disabled: off, onclick: run }, icon('spark'), label));
      if (off) slot.append(needKey());
    };
    const showError = (err) => {
      slot.replaceChildren(el('p', { class: 'ai-error', text: TDW.AI.errorMessage(err) }),
        el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Try again', onclick: run }));
    };
    function run() {
      stopAI();
      const c = new AbortController();
      ctrl = c;
      slot.replaceChildren(el('span', { class: 'busy-dots', text: 'Thinking' }), el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Stop', onclick: idle }));
      const s = sentenceOf(target.start);
      const sentence = s ? Editor.getText().slice(s.start, s.end) : target.phrase;
      TDW.AI.stronger({ phrase: target.phrase, sentence }, c.signal).then((out) => {
        if (ctrl !== c) return;
        ctrl = null;
        if (!out.options.length) { showError({ code: 'bad_json' }); return; }
        if (offerAlts(target.start, target.end, 'word', out.options.map((o) => Editor.matchCase(target.phrase, o.text)), target.phrase)) return;
        const words = Engine.countWords(target.phrase);
        slot.replaceChildren(el('div', { class: 'fix-chips' }, out.options.map((o) => {
          const word = Editor.matchCase(target.phrase, o.text);
          return chip(word, words - Engine.countWords(word), () => applyPhrase(target, word), o.note);
        })));
      }, (err) => {
        if (ctrl !== c) return;
        ctrl = null;
        if (!err || err.code !== 'cancelled') showError(err);
      });
    }
    idle();
    return slot;
  }

  // AI options become alternatives you read in place (the original stays as option 0).
  function offerAlts(start, end, kind, texts, original) {
    const A = TDW.Alts;
    if (!A || typeof A.offer !== 'function' || !texts.length) return false;
    const text = Editor.getText();
    if (text.slice(start, end) !== original) {
      const i = text.indexOf(original);
      if (i < 0) { toast('That sentence changed. Run it again.'); return true; }
      start = i;
      end = i + original.length;
    }
    hide();
    A.offer({ start, end, kind, options: texts, by: 'ai' });
    return true;
  }

  function applyPhrase(target, word) {
    if (Editor.getText().slice(target.start, target.end) !== target.phrase) { toast('That sentence changed. Run it again.'); return; }
    hide();
    app().edit(target.start, target.end, word);
  }

  // Fills the actions. Returns the message when it differs from the kind's own.
  function fillActions(issue, acts) {
    const t = issue.type;
    const words = Engine.countWords(issue.text);
    const chips = el('div', { class: 'fix-chips' });
    if (t === 'spelling') {
      const fixes = TDW.Spell.isReady() ? TDW.Spell.suggest(issue.text) : [];
      for (const fix of fixes) chips.append(chip(fix, words - Engine.countWords(fix), () => swap(issue, fix)));
      if (fixes.length) acts.append(chips);
      acts.append(el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Add to dictionary', onclick: () => app().addWord(issue.text) }));
      return fixes.length ? null : 'Not in the dictionary, and nothing close is.';
    }
    if (t === 'adverb') { acts.append(cutButton(issue, 10)); return null; }
    if (t === 'qualifier' && issue.suggestion && issue.cut) {
      for (const alt of issue.suggestion.split(', ')) {
        const word = Editor.matchCase(issue.text, alt);
        chips.append(chip(word, words - Engine.countWords(alt), () => swap(issue, word)));
      }
      acts.append(chips);
      const weak = issue.text.slice(0, issue.cut.end - issue.cut.start);
      acts.append(el('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: () => cutRange(issue, issue.cut.start, issue.cut.end) },
        'Cut ‘' + weak + '’', el('span', { class: 'btn-note', text: 'saves ' + money(Engine.countWords(weak) * 10) })));
      acts.append(strongerSlot({ start: issue.start, end: issue.end, phrase: issue.text }, 'More options'));
      return 'Try one strong word:';
    }
    if (t === 'qualifier') {
      acts.append(cutButton(issue, words * 10));
      const text = Editor.getText();
      const next = INTENSIFIERS.has(issue.text.toLowerCase()) && NEXT_WORD.exec(text.slice(issue.end));
      if (next) {
        const end = issue.end + next[0].length;
        acts.append(strongerSlot({ start: issue.start, end, phrase: text.slice(issue.start, end) }, 'A stronger word'));
      }
      return null;
    }
    if (t === 'complex' && !issue.suggestion) { acts.append(cutButton(issue, words * 10)); return 'Cut it.'; }
    if (t === 'complex') {
      for (const alt of issue.suggestion.split(', ')) {
        const word = Editor.matchCase(issue.text, alt);
        chips.append(chip(word, words - Engine.countWords(alt), () => swap(issue, word)));
      }
      acts.append(chips);
      return null;
    }
    aiButton(issue, acts);
    return null;
  }

  function useOption(target, newText) {
    const text = Editor.getText();
    let start = target.start, end = target.end;
    if (text.slice(start, end) !== target.original) {
      const i = text.indexOf(target.original);
      if (i < 0) { toast('That sentence changed. Run it again.'); return; }
      start = i;
      end = i + target.original.length;
    }
    hide();
    app().edit(start, end, newText);
  }

  function renderOptions(slot, options, target) {
    const before = Engine.countWords(target.original);
    slot.replaceChildren(el('ul', { class: 'opt-list' }, options.map((o) => {
      const n = Engine.countWords(o.text);
      return el('li', { class: 'opt' },
        el('p', { class: 'page-quote', text: o.text }),
        el('div', { class: 'opt-foot' },
          el('span', { class: 'hint', text: n + ' ' + plural(n, 'word', 'words') + ', ' + costNote(before - n) }),
          el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Use this', onclick: () => useOption(target, o.text) })));
    })));
  }

  function runAI(issue, slot) {
    const text = Editor.getText();
    const range = issue.type === 'passive' ? sentenceOf(issue.start) || issue : issue;
    const original = text.slice(range.start, range.end);
    const ls = text.lastIndexOf('\n', range.start - 1) + 1;
    let le = text.indexOf('\n', range.end);
    if (le < 0) le = text.length;
    const paragraph = text.slice(ls, le);
    stopAI();
    const c = new AbortController();
    ctrl = c;
    const restore = () => { stopAI(); slot.replaceChildren(); aiButton(issue, slot); };
    slot.replaceChildren(el('span', { class: 'busy-dots', text: 'Thinking' }), el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Stop', onclick: restore }));
    const call = issue.type === 'passive'
      ? TDW.AI.activeVoice({ sentence: original, paragraph, phrase: issue.text }, c.signal)
      : TDW.AI.simplify({ sentence: original, paragraph }, c.signal);
    const showError = (err) => {
      slot.replaceChildren(el('p', { class: 'ai-error', text: TDW.AI.errorMessage(err) }),
        el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Try again', onclick: () => runAI(issue, slot) }));
    };
    call.then((out) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (out.options.length && offerAlts(range.start, range.end, 'sentence', out.options.map((o) => o.text), original)) return;
      if (out.options.length) renderOptions(slot, out.options, { start: range.start, end: range.end, original });
      else showError({ code: 'bad_json' });
    }, (err) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (!err || err.code !== 'cancelled') showError(err);
    });
  }

  function show(issue, pos) {
    stopAI();
    const row = TDW.Panel.rowFor(issue.type);
    if (!row) return;
    if (box && box !== row.detail) { box.hidden = true; box.replaceChildren(); box.parentNode.classList.remove('is-open'); }
    current = issue;
    box = row.detail;
    const a = app().state.analysis;
    const same = a ? a.issues.filter((i) => i.type === issue.type) : [issue];
    let index = pos && pos.index != null ? pos.index : same.findIndex((i) => i.id === issue.id);
    if (index < 0) index = 0;
    app().state.cycle = { type: issue.type, index };
    const total = same.length;
    const [title, msg] = INFO[issue.type];
    const acts = el('div', { class: 'fix-actions' });
    let message = fillActions(issue, acts) || msg;
    if ((issue.type === 'passive' || issue.type === 'adverb') && a) message += ' Aim for ' + a.targets[issue.type] + ' or fewer in this draft.';
    const quote = TDW.Inline.plain(issue.text);
    const step = (d) => el('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': d < 0 ? 'Previous ' + title.toLowerCase() : 'Next ' + title.toLowerCase(), disabled: total < 2,
      onclick: () => TDW.Panel.jumpTo(issue.type, d) }, icon(d < 0 ? 'chevLeft' : 'chevRight'));
    box.replaceChildren(
      el('div', { class: 'fix-head' },
        el('span', { class: 'fix-title', text: title }),
        el('span', { class: 'fix-step' }, el('span', { class: 'fix-pos', text: (index + 1) + ' of ' + total }), step(-1), step(1))),
      isSentence(issue.type) ? null : el('p', { class: 'page-quote fix-quote', text: quote.length > 140 ? quote.slice(0, 137) + '…' : quote }),
      el('p', { class: 'fix-msg', text: message }),
      acts);
    box.hidden = false;
    row.li.classList.add('is-open');
    Editor.setActive(issue.id);
    requestAnimationFrame(() => { if (box) box.parentNode.scrollIntoView({ block: 'nearest', behavior: TDW.UI.reducedMotion() ? 'auto' : 'smooth' }); });
  }

  // The caret landed in some marked text: the smallest fix there.
  function showAt(index) {
    const a = app().state.analysis;
    if (!a || !TDW.Inspector.isOpen() || TDW.Inspector.tab() !== 'review' || TDW.Inspector.pushed()) { hide(); return; }
    const hidden = app().hiddenTypes();
    const inside = (i) => !hidden.includes(i.type) && i.start <= index && index <= i.end;
    let best = null;
    for (const i of a.issues) {
      if (isSentence(i.type) || !inside(i)) continue;
      if (!best || i.end - i.start < best.end - best.start) best = i;
    }
    if (!best) best = a.issues.find((i) => isSentence(i.type) && inside(i)) || null;
    if (!best) { hide(); return; }
    if (current && current.id === best.id && box && !box.hidden) return;
    show(best);
  }

  TDW.Popover = {
    init() {},
    show, showAt, hide,
    isOpen() { return !!box && !box.hidden; }
  };
})();
