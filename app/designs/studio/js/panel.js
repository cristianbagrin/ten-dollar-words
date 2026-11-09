/* The money and the Review tab. The money shows everywhere: the toolbar chip and the rule under
   the toolbar (its hairline fills with plum as you spend). The Review tab holds the spend in
   detail, the readability grade, the fixes (one row per kind, a swatch that looks like its
   highlight, a count in its own column, an eye), the selected fix, and the AI message check. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, money, plural, reducedMotion, menu, closeMenu, tip } = TDW.UI;
  const { Engine, Editor } = TDW;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);

  const ORDER = ['spelling', 'veryHard', 'hard', 'complex', 'passive', 'adverb', 'qualifier'];
  const NAMES = {
    spelling: 'Spelling', veryHard: 'Very hard sentences', hard: 'Hard sentences', complex: 'Wordy phrases',
    passive: 'Passive voice', adverb: 'Adverbs', qualifier: 'Weakeners'
  };
  const VERDICT = { clear: ['Clear', 'good'], mixed: ['Mixed', 'ok'], unclear: ['Unclear', 'bad'] };
  const MATCH = { yes: 'Yes', partly: 'Partly', no: 'No' };
  const GRADE_CLASS = { Good: 'good', OK: 'ok', Hard: 'bad' };
  // Words × $10: an X post, a short and a typical LinkedIn post, a long post or thread, a
  // newsletter, a long essay.
  const PRESETS = [[500, 'An X post'], [1000, 'A short LinkedIn post'], [2000, 'A LinkedIn post'], [3000, 'A long post or a thread'], [8000, 'A newsletter'], [15000, 'A long essay']];

  const rows = {};
  let shownSpent = null;
  let tweenRaf = 0;
  let aiCtrl = null;
  let current = { draft: null, words: 0, analysis: null };
  let budgetOpen = false;

  /* ---------- Fix rows ---------- */
  // The longer sentence each row stands for, read out with its count and shown when selected.
  function sentence(type, n, a) {
    const total = a ? a.sentences : 0;
    const t = a ? a.targets : { adverb: 0, passive: 0 };
    switch (type) {
      case 'spelling': return n === 1 ? '1 word isn’t in the dictionary.' : n + ' words aren’t in the dictionary.';
      case 'veryHard': return n + ' of ' + total + ' sentences ' + (n === 1 ? 'is' : 'are') + ' very hard to read.';
      case 'hard': return n + ' of ' + total + ' sentences ' + (n === 1 ? 'is' : 'are') + ' hard to read.';
      case 'complex': return n === 1 ? '1 phrase has a simpler option.' : n + ' phrases have simpler options.';
      case 'passive': return n + (n === 1 ? ' use' : ' uses') + ' of passive voice. Aim for ' + t.passive + ' or fewer.';
      case 'adverb': return n + (n === 1 ? ' adverb' : ' adverbs') + '. Aim for ' + t.adverb + ' or fewer.';
      default: return n === 1 ? '1 weakener. Cut it to sound sure.' : n + ' weakeners. Cut them to sound sure.';
    }
  }

  function buildRows() {
    const list = $('issue-list');
    for (const type of ORDER) {
      const count = el('span', { class: 'issue-count' });
      const jump = el('button', { type: 'button', class: 'issue-jump', onclick: () => jumpTo(type) },
        el('span', { class: 'kind-swatch ks-' + type, 'aria-hidden': 'true' }),
        el('span', { class: 'issue-name', text: NAMES[type] }), count);
      const eye = el('button', { type: 'button', class: 'icon-btn icon-btn-sm issue-eye', onclick: () => { app().toggleHighlight(type); updateEye(type); } });
      const detail = el('div', { class: 'issue-detail', hidden: true });
      const li = el('li', { class: 'issue-row', dataset: { type } }, el('div', { class: 'issue-line' }, jump, eye), detail);
      rows[type] = { li, jump, count, eye, detail, on: null };
      list.append(li);
    }
  }

  function updateEye(type) {
    const on = app().state.settings.highlights[type] !== false && app().state.settings.fixHighlights !== false;
    const r = rows[type];
    if (r.on === on) return;
    r.on = on;
    r.eye.setAttribute('aria-pressed', String(on));
    r.eye.setAttribute('aria-label', (on ? 'Hide ' : 'Show ') + NAMES[type].toLowerCase() + ' on the page');
    r.eye.replaceChildren(icon(on ? 'eye' : 'eyeOff'));
    r.li.classList.toggle('is-hidden', !on);
  }

  // The next fix of this kind after the caret; again for the one after that.
  function jumpTo(type, dir) {
    const a = app().state.analysis;
    if (!a) return;
    const list = a.issues.filter((i) => i.type === type);
    if (!list.length) return;
    const cyc = app().state.cycle;
    let index;
    if (dir && cyc.type === type) index = (cyc.index + dir + list.length) % list.length;
    else if (cyc.type === type && TDW.Popover.isOpen()) index = (cyc.index + 1) % list.length;
    else { const caret = Editor.caretIndex(); index = list.findIndex((i) => i.start > caret); if (index < 0) index = 0; }
    const issue = list[index];
    app().state.cycle = { type, index };
    if (app().state.settings.highlights[type] === false) app().toggleHighlight(type);
    Editor.select(issue.start, issue.end);
    TDW.Popover.show(issue, { index, total: list.length });
  }

  /* ---------- The money: chip, rule, register ---------- */
  function tweenTo(to) {
    const node = $('reg-spent');
    cancelAnimationFrame(tweenRaf);
    if (shownSpent === null || shownSpent === to || reducedMotion()) {
      shownSpent = to;
      node.textContent = to.toLocaleString('en-US');
      return;
    }
    const from = shownSpent;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 240);
      shownSpent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      node.textContent = shownSpent.toLocaleString('en-US');
      if (k < 1) tweenRaf = requestAnimationFrame(step);
    };
    tweenRaf = requestAnimationFrame(step);
  }

  function renderMoney(draft, words) {
    if (!draft) return;
    current.draft = draft;
    current.words = words;
    const spent = words * 10;
    const budget = draft.budget;
    const over = spent > budget;
    const frac = budget ? Math.min(spent / budget, 1) : 0;
    const root = document.documentElement;
    root.style.setProperty('--spend', frac.toFixed(4));
    root.classList.toggle('is-over', over);
    const chip = $('spend-chip');
    chip.replaceChildren(el('span', { class: 'chip-spent', text: money(spent) }), el('span', { class: 'chip-budget', text: 'of ' + money(budget) }));
    chip.setAttribute('aria-label', 'Spent ' + money(spent) + ' of a ' + money(budget) + ' budget' + (over ? ', over budget' : '') + '. Change the budget');
    tip(chip, over ? 'Over budget by ' + money(spent - budget) : money(budget - spent) + ' left');
    $('pb-review') && $('pb-review').style.setProperty('--spend', frac.toFixed(4));
    // The register in the Review tab.
    tweenTo(spent);
    $('register').classList.toggle('is-over', over);
    $('reg-stamp').hidden = !over;
    $('reg-budget').textContent = money(budget);
  }

  function renderStats(a, words) {
    const chars = app().publishText().replace(/\s+/g, ' ').trim().length;
    const min = a ? Math.max(1, Math.round(a.readingTimeSec / 60)) : 0;
    const stat = (k, v) => [el('dt', { text: k }), el('dd', { text: v })];
    $('reg-stats').replaceChildren(...stat('Words', words.toLocaleString('en-US')), ...stat('Characters', chars.toLocaleString('en-US')),
      ...stat('Reading', words ? min + ' min' : '—'));
  }

  // A word or two disappeared: the chip shows what came back, briefly.
  let refundEl = null, refundTotal = 0, lastDropAt = 0;
  function refund(droppedWords) {
    const now = Date.now();
    refundTotal = (refundEl && now - lastDropAt < 700 ? refundTotal : 0) + droppedWords * 10;
    lastDropAt = now;
    if (refundEl) refundEl.remove();
    const chip = $('spend-chip');
    const node = el('span', { class: 'refund', 'aria-hidden': 'true', text: '−' + money(refundTotal) });
    chip.append(node);
    refundEl = node;
    setTimeout(() => { node.remove(); if (refundEl === node) refundEl = null; }, 900);
  }

  /* ---------- Budget: a small menu under the chip ---------- */
  function openBudget(anchor) {
    const d = current.draft || app().state.draft;
    if (!d) return;
    const input = el('input', { type: 'number', min: '10', step: '10', inputmode: 'numeric', class: 'money-field', 'aria-label': 'Other budget in dollars', value: String(d.budget) });
    const form = el('form', { class: 'budget-form' },
      el('label', { class: 'budget-label', text: 'Other amount' }),
      el('div', { class: 'budget-row' }, el('span', { class: 'money-input' }, el('span', { text: '$', 'aria-hidden': 'true' }), input),
        el('button', { type: 'submit', class: 'btn btn-sm', text: 'Set' })));
    form.noValidate = true;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Math.round(Number(input.value) / 10) * 10;
      if (!(v >= 10)) { input.focus(); return; }
      closeMenu();
      app().setBudget(v);
    });
    budgetOpen = true;
    menu(anchor || $('spend-chip'), [{ type: 'head', label: 'Budget for this draft' }].concat(PRESETS.map(([v, note]) => ({ label: money(v), note, value: v, checked: v === d.budget }))),
      (it) => { app().setBudget(it.value); return false; }, form, () => { budgetOpen = false; }, { class: 'budget-menu', align: anchor && anchor.id === 'spend-chip' ? 'end' : null });
  }

  /* ---------- Render ---------- */
  function updateAI() {
    const none = TDW.AI.status() === 'none';
    $('ai-note').replaceChildren(...(none ? ['Connect Gemini in ', el('button', { type: 'button', class: 'link-btn', text: 'Settings', onclick: () => app().openSettings('ai') }), ' to use AI help.'] : []));
    $('ai-note').hidden = !none;
    $('ai-message').disabled = none || app().state.aiBusy || !Editor.getText().trim();
  }

  function render(a, draft, words) {
    current.analysis = a;
    renderMoney(draft, words);
    renderStats(a, words);
    const grade = $('grade-num');
    const pill = $('grade-pill');
    if (!words || !a) {
      grade.textContent = '—';
      pill.hidden = true;
    } else {
      const label = Engine.gradeLabel(a.grade);
      grade.textContent = 'Grade ' + a.grade;
      pill.textContent = label;
      pill.className = 'pill ' + GRADE_CLASS[label];
      pill.hidden = false;
    }
    $('issue-list').hidden = !words;
    $('issues-empty').hidden = !!words;
    let total = 0;
    for (const type of ORDER) {
      const n = a ? a.counts[type] : 0;
      total += n;
      const r = rows[type];
      r.count.textContent = n ? String(n) : '0';
      r.li.classList.toggle('is-zero', n === 0);
      r.jump.setAttribute('aria-disabled', String(n === 0));
      r.jump.setAttribute('aria-label', NAMES[type] + ': ' + (n ? sentence(type, n, a) : 'none'));
      r.sentence = n ? sentence(type, n, a) : '';
      updateEye(type);
    }
    TDW.Inspector.setBadge('review', words && total ? String(total) : '');
    updateAI();
  }

  /* ---------- AI results ---------- */
  const HIDE_FOR_RESULTS = ['register', 'readability', 'issues', 'ai-desk'];
  const show = (...nodes) => $('ai-body').replaceChildren(...nodes);

  function setBusy(busy) { app().state.aiBusy = busy; updateAI(); }
  function stopAI() { if (aiCtrl) { aiCtrl.abort(); aiCtrl = null; } if (app().state.aiBusy) setBusy(false); }

  function openResults() {
    for (const id of HIDE_FOR_RESULTS) $(id).hidden = true;
    $('ai-results').hidden = false;
  }
  function closeResults() {
    stopAI();
    if ($('ai-results').hidden) return;
    $('ai-results').hidden = true;
    for (const id of HIDE_FOR_RESULTS) $(id).hidden = false;
    $('ai-body').replaceChildren();
  }

  function runAI(call, onDone, retry) {
    stopAI();
    const ctrl = new AbortController();
    aiCtrl = ctrl;
    setBusy(true);
    show(el('div', { class: 'ai-loading' }, el('span', { class: 'busy-dots', text: 'Reading the draft' }),
      el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Stop', onclick: closeResults })));
    call(ctrl.signal).then((out) => {
      if (aiCtrl !== ctrl) return;
      aiCtrl = null;
      setBusy(false);
      onDone(out);
    }, (err) => {
      if (aiCtrl !== ctrl) return;
      aiCtrl = null;
      setBusy(false);
      if (err && err.code === 'cancelled') return;
      show(el('div', { class: 'ai-block' }, el('p', { class: 'ai-error', text: TDW.AI.errorMessage(err) }),
        el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Try again', onclick: retry })));
    });
  }

  function startMessage() {
    if (TDW.AI.status() === 'none') { app().openSettings('ai'); return; }
    if (!Editor.getText().trim()) return;
    app().openTab('review');
    stopAI();
    openResults();
    const area = el('textarea', { id: 'msg-intent', class: 'field', rows: '3', placeholder: 'One line on what you want readers to do or remember' });
    area.value = (current.draft && current.draft.intent) || '';
    const form = el('form', { class: 'msg-form' },
      el('label', { for: 'msg-intent', class: 'rv-label', text: 'What should readers take away?' }),
      area,
      el('div', { class: 'row-start' }, el('button', { type: 'submit', class: 'btn', text: 'Check the message' }),
        el('span', { class: 'hint', text: 'Optional' })));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const intent = area.value.trim();
      app().setIntent(intent);
      runMessage(intent);
    });
    show(form);
    area.focus();
  }

  function runMessage(intent) {
    runAI((signal) => TDW.AI.messageCheck({ text: Editor.getText(), intent }, signal), renderMessage, () => runMessage(intent));
  }

  function sharper(label, text, btnLabel, which) {
    const btn = el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: btnLabel });
    btn.addEventListener('click', () => {
      const list = Engine.analyze(Editor.getText()).sentenceList;
      const r = which === 'first' ? list[0] : list[list.length - 1];
      if (!r) return;
      app().edit(r.start, r.end, text);
      btn.disabled = true;
      btn.textContent = 'Used';
    });
    return el('div', { class: 'ai-block' }, el('div', { class: 'rv-label', text: label }), el('p', { class: 'page-quote', text }), btn);
  }

  function renderMessage(out) {
    const head = el('div', { class: 'ai-block' },
      el('div', { class: 'rv-row' }, el('span', { class: 'rv-label', text: 'Readers will take away' }),
        VERDICT[out.verdict] ? el('span', { class: 'pill ' + VERDICT[out.verdict][1], text: VERDICT[out.verdict][0] }) : null),
      el('p', { class: 'page-quote takeaway', text: out.takeaway }));
    if (out.match !== 'none' && MATCH[out.match]) head.append(el('p', null, 'Matches what you meant: ', el('b', { text: MATCH[out.match] })));
    if (out.why) head.append(el('p', { class: 'hint', text: out.why }));
    const nodes = [head];
    if (out.offMessage.length) {
      nodes.push(el('div', { class: 'ai-block' }, el('div', { class: 'rv-label', text: 'Off message' }),
        el('ul', { class: 'off-list' }, out.offMessage.map((o) => el('li', null,
          el('button', {
            type: 'button', class: 'off-quote page-quote', text: o.quote,
            onclick: () => { const i = Editor.getText().indexOf(o.quote); if (i >= 0) Editor.select(i, i + o.quote.length); }
          }),
          o.reason ? el('p', { class: 'hint', text: o.reason }) : null)))));
    }
    if (out.strongerOpening) nodes.push(sharper('A sharper opening', out.strongerOpening, 'Use as the opening', 'first'));
    if (out.strongerEnding) nodes.push(sharper('A sharper ending', out.strongerEnding, 'Use as the ending', 'last'));
    show(...nodes);
  }

  /* ---------- Init ---------- */
  function init() {
    buildRows();
    $('btn-sample').addEventListener('click', () => app().insertSample());
    $('ai-message').addEventListener('click', startMessage);
    $('ai-back').append(icon('chevLeft'), 'Review');
    $('ai-back').addEventListener('click', closeResults);
    $('reg-budget').addEventListener('click', (e) => openBudget(e.currentTarget));
    $('spend-chip').addEventListener('click', (e) => openBudget(e.currentTarget));
  }

  TDW.Panel = {
    init, render, renderMoney, refund, updateAI, closeResults, startMessage, openBudget, jumpTo,
    rowFor: (type) => rows[type] || null,
    NAMES,
    closeBudget() { if (budgetOpen) closeMenu(); },
    isBudgetOpen: () => budgetOpen
  };
})();
