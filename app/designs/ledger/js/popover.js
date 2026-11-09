/* The fix behind each refund: quick fixes and AI rewrites. Ledger never opens it over the
   text: it unfolds inside its refund line on the tape (Panel.mountDetail). */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, money, plural, costNote, toast } = TDW.UI;
  const { Engine, Editor } = TDW;
  const app = () => TDW.App;

  const INFO = {
    spelling: ['Spelling', 'Did you mean:'],
    veryHard: ['Very hard to read', 'Readers will lose the thread. Split it or cut it.'],
    hard: ['Hard to read', 'Shorten it or split it in two.'],
    complex: ['Wordy', 'Try:'],
    passive: ['Passive voice', 'Say who did what.'],
    adverb: ['Adverb', 'Cut it, or pick a stronger verb.'],
    qualifier: ['Weakener', 'Say it like you mean it.']
  };
  const INTENSIFIERS = new Set(TDW.Data.INTENSIFIERS);
  const NEXT_WORD = /^[ \t ]+([A-Za-z'’-]+)/;
  const isSentence = (t) => t === 'hard' || t === 'veryHard';

  let pop = null;          // the open detail node (inside the tape)
  let current = null;
  let ctrl = null;
  let typedAt = 0;

  function stopAI() {
    if (ctrl) { ctrl.abort(); ctrl = null; }
  }

  function position() {
    if (pop && pop.isConnected && TDW.Tape) TDW.Tape.reveal(pop.parentNode);
  }

  function hide() {
    stopAI();
    const was = !!current;
    current = null;
    pop = null;
    if (TDW.Panel && TDW.Panel.closeIssue) TDW.Panel.closeIssue();
    if (was) Editor.setActive(null);
  }

  function sentenceOf(index) {
    const a = app().state.analysis;
    return (a && a.sentenceList.find((r) => r.start <= index && index < r.end)) || null;
  }

  function sentenceStartOf(index) {
    const s = sentenceOf(index);
    return s ? s.start : -1;
  }

  const stillThere = (issue) => Editor.getText().slice(issue.start, issue.end) === issue.text;

  // Delete [start, end) cleanly (one space, sentence stays capitalized).
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

  // The money a change makes or costs, as the receipt prints it.
  const credit = (savedWords) => el('span', {
    class: 'chip-note' + (savedWords < 0 ? ' is-cost' : savedWords === 0 ? ' is-even' : ''),
    text: savedWords > 0 ? '+' + money(savedWords * 10) : savedWords < 0 ? '−' + money(-savedWords * 10) : 'same price'
  });

  const cutButton = (issue, amount) =>
    el('button', { type: 'button', class: 'btn credit', 'aria-label': 'Cut it, refund ' + money(amount), onclick: () => cutRange(issue, issue.start, issue.end) },
      'Cut it', el('span', { class: 'btn-fig', text: '+' + money(amount) }));

  // A word chip with its money effect: "exhausted +$10".
  const chip = (word, savedWords, onclick, note) =>
    el('button', { type: 'button', class: 'chip', title: note || null, onclick, 'aria-label': word + ', ' + costNote(savedWords) }, word, credit(savedWords));

  function aiButton(issue, box) {
    const off = TDW.AI.status() === 'none';
    box.append(el('button', {
      type: 'button', class: 'btn', disabled: off,
      text: issue.type === 'passive' ? 'Rewrite it with AI' : 'Simplify it with AI',
      onclick: () => runAI(issue, box)
    }));
    if (off) box.append(el('p', { class: 'pop-note' }, 'Needs a Gemini key. ', el('button', { type: 'button', class: 'link', text: 'Add one in Settings', onclick: () => app().openSettings('ai') })));
  }

  // "More options (AI)" / "Stronger word (AI)": AI swaps for a weak phrase, shown as chips.
  function strongerSlot(target, label) {
    const slot = el('div', { class: 'pop-ai' });
    const idle = () => {
      stopAI();
      const off = TDW.AI.status() === 'none';
      slot.replaceChildren(el('button', { type: 'button', class: 'btn-outline', disabled: off, text: label, onclick: run }));
      if (off) slot.append(el('p', { class: 'pop-note', text: 'Connect Gemini in Settings' }));
      position();
    };
    const showError = (err) => {
      slot.replaceChildren(el('p', { class: 'pop-note ai-error', text: TDW.AI.errorMessage(err) }),
        el('button', { type: 'button', class: 'btn-outline', text: 'Try again', onclick: run }));
      position();
    };
    function run() {
      stopAI();
      const c = new AbortController();
      ctrl = c;
      slot.replaceChildren(el('span', { class: 'pop-msg', text: 'Thinking…' }),
        el('button', { type: 'button', class: 'btn-quiet', text: 'Stop', onclick: idle }));
      position();
      const s = sentenceOf(target.start);
      const sentence = s ? Editor.getText().slice(s.start, s.end) : target.phrase;
      TDW.AI.stronger({ phrase: target.phrase, sentence }, c.signal).then((out) => {
        if (ctrl !== c) return;
        ctrl = null;
        if (!out.options.length) { showError({ code: 'bad_json' }); return; }
        if (offerAlts(target.start, target.end, 'word', out.options.map((o) => Editor.matchCase(target.phrase, o.text)), target.phrase)) return;
        const words = Engine.countWords(target.phrase);
        slot.replaceChildren(el('div', { class: 'pop-actions' }, out.options.map((o) => {
          const word = Editor.matchCase(target.phrase, o.text);
          return chip(word, words - Engine.countWords(word), () => applyPhrase(target, word), o.note);
        })));
        position();
      }, (err) => {
        if (ctrl !== c) return;
        ctrl = null;
        if (!err || err.code !== 'cancelled') showError(err);
      });
    }
    idle();
    return slot;
  }

  // AI options become alternatives you read in place (original stays as option 0), when the
  // alternatives panel is loaded. Returns false when it isn't, so the old chips show instead.
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

  // Fills the action row. Returns the message when it differs from the default.
  function fillActions(issue, box) {
    const t = issue.type;
    const words = Engine.countWords(issue.text);
    if (t === 'spelling') {
      const fixes = TDW.Spell.isReady() ? TDW.Spell.suggest(issue.text) : [];
      for (const fix of fixes) box.append(chip(fix, words - Engine.countWords(fix), () => swap(issue, fix)));
      box.append(el('button', { type: 'button', class: 'btn-quiet', text: 'Add to dictionary', onclick: () => app().addWord(issue.text) }));
      return fixes.length ? null : 'No suggestions.';
    }
    if (t === 'adverb') { box.append(cutButton(issue, 10)); return null; }
    if (t === 'qualifier' && issue.suggestion && issue.cut) {
      for (const alt of issue.suggestion.split(', ')) {
        const word = Editor.matchCase(issue.text, alt);
        box.append(chip(word, words - Engine.countWords(alt), () => swap(issue, word)));
      }
      const weak = issue.text.slice(0, issue.cut.end - issue.cut.start);
      box.append(el('button', {
        type: 'button', class: 'chip', onclick: () => cutRange(issue, issue.cut.start, issue.cut.end)
      }, 'Cut ‘' + weak + '’', credit(Engine.countWords(weak))));
      box.append(strongerSlot({ start: issue.start, end: issue.end, phrase: issue.text }, 'More options (AI)'));
      return 'Try one strong word:';
    }
    if (t === 'qualifier') {
      box.append(cutButton(issue, words * 10));
      const text = Editor.getText();
      const next = INTENSIFIERS.has(issue.text.toLowerCase()) && NEXT_WORD.exec(text.slice(issue.end));
      if (next) {
        const end = issue.end + next[0].length;
        box.append(strongerSlot({ start: issue.start, end, phrase: text.slice(issue.start, end) }, 'Stronger word (AI)'));
      }
      return null;
    }
    if (t === 'complex' && !issue.suggestion) { box.append(cutButton(issue, words * 10)); return 'Cut it.'; }
    if (t === 'complex') {
      for (const alt of issue.suggestion.split(', ')) {
        const word = Editor.matchCase(issue.text, alt);
        box.append(chip(word, words - Engine.countWords(alt), () => swap(issue, word)));
      }
      return null;
    }
    aiButton(issue, box);
    return null;
  }

  function useOption(target, newText) {
    const text = Editor.getText();
    let start = target.start;
    let end = target.end;
    if (text.slice(start, end) !== target.original) {
      const i = text.indexOf(target.original);
      if (i < 0) { toast('That sentence changed. Run it again.'); return; }
      start = i;
      end = i + target.original.length;
    }
    hide();
    app().edit(start, end, newText);
  }

  function renderOptions(box, options, target) {
    const before = Engine.countWords(target.original);
    box.replaceChildren(el('ul', { class: 'opt-list' }, options.map((o) => {
      const n = Engine.countWords(o.text);
      return el('li', { class: 'opt' },
        el('p', { class: 'opt-text', text: o.text }),
        el('div', { class: 'opt-foot' },
          el('span', { class: 'opt-meta' }, n + ' ' + plural(n, 'word', 'words') + ', ', credit(before - n)),
          el('button', { type: 'button', class: 'btn-outline btn-sm', text: 'Use this', onclick: () => useOption(target, o.text) })));
    })));
    position();
  }

  function runAI(issue, box) {
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
    const restore = () => { stopAI(); box.replaceChildren(); aiButton(issue, box); position(); };
    box.replaceChildren(el('span', { class: 'pop-msg', text: 'Thinking…' }),
      el('button', { type: 'button', class: 'btn-quiet', text: 'Stop', onclick: restore }));
    position();

    const call = issue.type === 'passive'
      ? TDW.AI.activeVoice({ sentence: original, paragraph, phrase: issue.text }, c.signal)
      : TDW.AI.simplify({ sentence: original, paragraph }, c.signal);
    const showError = (err) => {
      box.replaceChildren(el('p', { class: 'pop-note ai-error', text: TDW.AI.errorMessage(err) }),
        el('button', { type: 'button', class: 'btn-outline', text: 'Try again', onclick: () => runAI(issue, box) }));
      position();
    };
    call.then((out) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (out.options.length && offerAlts(range.start, range.end, 'sentence', out.options.map((o) => o.text), original)) return;
      if (out.options.length) renderOptions(box, out.options, { start: range.start, end: range.end, original });
      else showError({ code: 'bad_json' });
    }, (err) => {
      if (ctrl !== c) return;
      ctrl = null;
      if (!err || err.code !== 'cancelled') showError(err);
    });
  }

  const HIDE = { spelling: 'Hide spelling', veryHard: 'Hide very hard sentences', hard: 'Hide hard sentences', complex: 'Hide wordy phrases', passive: 'Hide passive voice', adverb: 'Hide adverbs', qualifier: 'Hide weakeners' };

  function show(issue) {
    if (app().state.mode !== 'edit') return;
    stopAI();
    current = issue;
    const [title, msg] = INFO[issue.type];
    const actions = el('div', { class: 'pop-actions' });
    const message = fillActions(issue, actions) || msg;
    const foot = el('div', { class: 'pop-foot' },
      el('button', { type: 'button', class: 'btn-quiet btn-sm', text: HIDE[issue.type], title: 'Hide this kind of fix on the page and the tape', onclick: () => { hide(); app().toggleHighlight(issue.type); app().refresh(); } }));
    pop = el('div', { class: 'refund-detail', role: 'group', 'aria-label': title },
      el('p', { class: 'pop-msg', text: message }), actions, foot);
    Editor.setActive(issue.id);
    if (!TDW.Panel.mountDetail(issue, pop)) { pop = null; current = null; return; }
  }

  function showAt(index) {
    if (performance.now() - typedAt < 700) return; // typing inside a mark doesn't open it
    const a = app().state.analysis;
    if (!a) { hide(); return; }
    const hidden = app().hiddenTypes();
    const inside = (i) => !hidden.includes(i.type) && i.start <= index && index <= i.end;
    let best = null;
    for (const i of a.issues) {
      if (isSentence(i.type) || !inside(i)) continue;
      if (!best || i.end - i.start < best.end - best.start) best = i;
    }
    if (!best) best = a.issues.find((i) => isSentence(i.type) && inside(i)) || null;
    if (!best) { hide(); return; }
    if (current && current.id === best.id && pop) { position(); return; }
    show(best);
  }

  TDW.Popover = {
    init() {
      Editor.rootEl().addEventListener('beforeinput', () => { typedAt = performance.now(); });
    },
    show,
    showAt,
    hide,
    isOpen() { return !!current; }
  };
})();
