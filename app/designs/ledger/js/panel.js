/* The receipt: the balance window, one printed line per paragraph, the totals, Trim priced in
   dollars, and Refunds available (every fix with what it saves). The fix detail itself is
   drawn by popover.js into the refund line it belongs to. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, money, plural, reducedMotion } = TDW.UI;
  const { Engine, Editor, Inline, Formats } = TDW;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);

  const KIND = { spelling: 'spelling', veryHard: 'very hard', hard: 'hard', complex: 'wordy', passive: 'passive', adverb: 'adverb', qualifier: 'weakener' };
  const PLURAL = { spelling: 'Spelling', veryHard: 'Very hard sentences', hard: 'Hard sentences', complex: 'Wordy phrases', passive: 'Passive voice', adverb: 'Adverbs', qualifier: 'Weakeners' };
  const PRESETS = [500, 1000, 2000, 3000, 8000, 15000];

  let fig = null;
  let current = { draft: null, words: 0, a: null };
  let openId = null;
  let openNode = null;
  let itemKeys = [];
  let itemsDraft = null;
  let aiCtrl = null;
  let lastOver = false;

  /* ---------- The guilloché: one symmetric band, behind the balance ---------- */
  function guilloche() {
    const W = 400, H = 120, mid = H / 2;
    const paths = [];
    const N = 14;
    for (let k = 0; k < N; k++) {
      const ph = (k / N) * Math.PI * 2;
      for (const sgn of [1, -1]) {
        let d = '';
        for (let x = 0; x <= W; x += 4) {
          const env = 0.55 + 0.45 * Math.cos((x / W) * Math.PI * 2);
          const yy = mid + sgn * (30 * env + 8) * Math.sin((x / 92) * Math.PI * 2 + ph) * 0.9;
          d += (x ? 'L' : 'M') + x + ' ' + yy.toFixed(1);
        }
        paths.push('<path d="' + d + '"/>');
      }
    }
    const t = document.createElement('template');
    t.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width=".55" aria-hidden="true">' + paths.join('') + '</svg>';
    return t.content.firstChild;
  }

  /* ---------- The balance window (both modes) ---------- */
  function renderBalance(draft, words) {
    if (!draft) return;
    const spent = words * 10;
    const budget = draft.budget;
    const bal = budget - spent;
    const over = bal < 0;
    fig.set(money(Math.abs(bal)), true);
    $('reg-label').textContent = over ? 'Over by' : 'Balance';
    $('reg-fill').style.width = Math.min(spent / budget, 1) * 100 + '%';
    $('register').classList.toggle('is-over', over);
    $('reg-spent').textContent = money(spent);
    $('reg-budget').textContent = money(budget);
    $('reg-stamp').hidden = !over;
    $('reg-main').setAttribute('aria-label', (over ? 'Over budget by ' : 'Balance ') + money(Math.abs(bal)) + ', ' + money(spent) + ' spent of ' + money(budget));
    const pill = $('balance-pill');
    pill.classList.toggle('is-over', over);
    pill.replaceChildren(money(Math.abs(bal)), el('small', { text: over ? 'over' : 'left' }));
    pill.setAttribute('aria-label', (over ? 'Over budget by ' : 'Balance ') + money(Math.abs(bal)));
    if (over && !lastOver && app() && app().state.mode === 'edit') { /* the stamp animates in on its own */ }
    lastOver = over;
  }

  function refund(droppedWords) {
    const r = $('register');
    const old = r.querySelector('.credit-pop');
    const prev = old ? Number(old.dataset.n) || 0 : 0;
    if (old) old.remove();
    const n = prev + droppedWords * 10;
    const pop = el('span', { class: 'credit-pop', 'aria-hidden': 'true', text: '+' + money(n), dataset: { n: String(n) } });
    const f = $('reg-figure');
    pop.style.left = (f.offsetLeft + f.offsetWidth + 10) + 'px';
    pop.style.top = (f.offsetTop + 8) + 'px';
    r.append(pop);
    setTimeout(() => pop.remove(), 1150);
  }

  /* ---------- Budget ---------- */
  function renderPresets() {
    const cur = current.draft ? current.draft.budget : 0;
    $('budget-presets').replaceChildren(...PRESETS.map((v) => el('button', {
      type: 'button', class: 'preset' + (v === cur ? ' is-on' : ''), 'aria-pressed': String(v === cur), text: money(v),
      onclick: () => { app().setBudget(v); closeBudget(true); }
    })));
  }
  function openBudget() {
    const input = $('budget-input');
    input.value = String(current.draft ? current.draft.budget : 2000);
    renderPresets();
    $('budget-form').hidden = false;
    input.focus();
    input.select();
  }
  function closeBudget(focusLink) {
    if ($('budget-form').hidden) return;
    $('budget-form').hidden = true;
    if (focusLink) $('reg-budget').focus();
  }
  function submitBudget(e) {
    e.preventDefault();
    const input = $('budget-input');
    const v = Math.round(Number(input.value) / 10) * 10;
    if (!(v >= 10)) { input.focus(); return; }
    app().setBudget(v);
    closeBudget(true);
  }

  /* ---------- Line items ---------- */
  function lineItems(draft) {
    const text = Editor.getText();
    const masked = app().masked(text).split('\n');
    const lines = text.split('\n');
    const thread = Formats.get(draft.format).thread;
    const out = [];
    let post = 1;
    if (thread && lines.some((l) => Inline.block(l).type === 'hr')) out.push({ i: 0, kind: 'rule', text: 'Post 1', words: 0 });
    lines.forEach((ln, i) => {
      const b = Inline.block(ln);
      if (b.type === 'hr') { if (thread) out.push({ i, kind: 'rule', text: 'Post ' + (++post), words: 0 }); else out.push({ i, kind: 'rule', text: '', words: 0 }); return; }
      if (b.type === 'opaque') { out.push({ i, kind: 'item', text: ln.trim(), words: 0 }); return; }
      const shown = Inline.plain(ln).trim();
      if (!shown) return;
      const w = Engine.countWords(masked[i] || '');
      out.push({ i, kind: /^h[123]$/.test(b.type) ? 'head' : 'item', text: shown, words: w });
    });
    return out;
  }

  function itemRow(it) {
    const btn = el('button', { type: 'button', class: 'item-btn', dataset: { line: String(it.i) } },
      el('span', { class: 'item-text' }), el('span', { class: 'item-words' }), el('span', { class: 'item-cost' }));
    return el('li', { class: 'item' }, btn);
  }

  function fillRow(li, it) {
    li.className = 'item' + (it.kind === 'head' ? ' is-head' : it.kind === 'rule' ? ' is-rule' : '') + (it.kind === 'item' && !it.words ? ' is-zero' : '');
    const btn = li.firstChild;
    btn.dataset.line = String(it.i);
    const [t, w, c] = btn.children;
    t.textContent = it.text;
    w.textContent = it.kind === 'item' ? String(it.words) : '';
    c.textContent = it.kind === 'rule' ? '' : money(it.words * 10);
    btn.title = it.kind === 'rule' ? it.text : it.text.slice(0, 120) + (it.text.length > 120 ? '…' : '');
    btn.setAttribute('aria-label', it.kind === 'rule' ? (it.text || 'Divider') : it.text.slice(0, 60) + ', ' + it.words + ' ' + plural(it.words, 'word', 'words') + ', ' + money(it.words * 10));
  }

  function renderItems(draft, words) {
    const list = $('items');
    const items = words || Editor.getText().trim() ? lineItems(draft) : [];
    const same = itemsDraft === draft;
    const keys = items.map((it) => it.kind + '|' + it.text + '|' + it.words + '|' + it.i);
    const kids = list.children;
    const grew = same && itemKeys.length > 0 && items.length > itemKeys.length;
    items.forEach((it, k) => {
      let li = kids[k];
      if (!li) {
        li = itemRow(it);
        list.append(li);
        fillRow(li, it);
        if (grew && !reducedMotion()) { li.classList.add('is-new'); li.addEventListener('animationend', () => li.classList.remove('is-new'), { once: true }); }
      } else if (itemKeys[k] !== keys[k]) fillRow(li, it);
    });
    while (kids.length > items.length) list.lastChild.remove();
    itemKeys = keys;
    itemsDraft = draft;
    $('items-empty').hidden = items.length > 0;
  }

  function onItemClick(e) {
    const b = e.target.closest('.item-btn');
    if (!b) return;
    const i = Number(b.dataset.line);
    const blk = Editor.block(i);
    if (!blk) return;
    Editor.setCaret(blk.end);
    Editor.scrollToIndex(blk.start, 0.3, true);
    pairLine(i, true);
    setTimeout(() => pairLine(-1), 900);
  }

  let pairedLine = -1;
  function pairLine(i, fromTape) {
    if (pairedLine === i) return;
    const old = pairedLine >= 0 ? Editor.block(pairedLine) : null;
    if (old && old.el) old.el.classList.remove('is-paired');
    for (const li of $('items').querySelectorAll('.item.is-paired')) li.classList.remove('is-paired');
    pairedLine = i;
    if (i < 0) return;
    if (fromTape) { const b = Editor.block(i); if (b && b.el) b.el.classList.add('is-paired'); }
    else {
      const btn = $('items').querySelector('.item-btn[data-line="' + i + '"]');
      if (btn) btn.parentNode.classList.add('is-paired');
    }
  }

  /* ---------- Totals and Trim ---------- */
  function renderTotals(draft, words, a) {
    const t = $('totals');
    if (!words) { t.replaceChildren(); $('trim-row').replaceChildren(); return; }
    const spent = words * 10, bal = draft.budget - spent;
    const row = (k, mid, v, cls) => el('div', { class: 'tot' + (cls ? ' ' + cls : '') }, el('dt', { text: k }), el('span', { class: 'tot-mid', text: mid || '' }), el('dd', { text: v }));
    const chars = TDW.Editor.getText().length;
    const mins = a ? Math.max(1, Math.round(a.readingTimeSec / 60)) : 1;
    t.replaceChildren(
      row('Subtotal', words + ' ' + plural(words, 'word', 'words'), money(spent)),
      row('Budget', '', money(draft.budget)),
      row(bal < 0 ? 'Over by' : 'Balance', '', money(Math.abs(bal)), 'is-balance' + (bal < 0 ? ' is-over' : '')));
    t.title = chars + ' ' + plural(chars, 'character', 'characters') + ', about ' + mins + ' min to read';
    renderTrim(draft, words);
  }

  function renderTrim(draft, words) {
    const box = $('trim-row');
    const L = TDW.Lab && TDW.Lab.LEVELS;
    if (!L || words < 12) { box.replaceChildren(); return; }
    const spent = words * 10;
    const need = spent > draft.budget ? (spent - draft.budget) / spent : 0;
    let budgetPick = -1;
    if (need > 0) budgetPick = L.findIndex((lv) => lv.pct / 100 >= need);
    const on = TDW.Lab.level ? TDW.Lab.level() : 0;
    const btns = L.map((lv, k) => {
      if (!k) return null;
      const cut = Math.max(10, Math.round(spent * lv.pct / 1000) * 10);
      const b = el('button', {
        type: 'button', class: 'lab-level' + (k === on ? ' is-on' : '') + (k === budgetPick ? ' is-budget' : ''), dataset: { level: String(k) },
        title: lv.label + ': the AI marks about ' + lv.pct + '% to cut, and only cuts' + (k === budgetPick ? '. This brings you under budget.' : '.'),
        'aria-label': 'Trim: cut about ' + money(cut) + ', ' + lv.pct + ' percent' + (k === budgetPick ? ', back under budget' : ''),
        onclick: () => TDW.Lab.trim(k)
      }, el('span', { class: 'lab-level-label', text: '−' + money(cut) }), el('span', { class: 'lab-level-pct', text: lv.pct === 50 ? 'half' : lv.pct + '%' }));
      return b;
    });
    box.replaceChildren(el('span', { class: 'trim-k', title: 'Trim (the Lab): the AI fades what it would cut. Nothing goes until you say.', text: 'Trim' }), ...btns);
  }

  /* ---------- Refunds ---------- */
  function lead(t, n) {
    const s = Inline.plain(t.replace(/\n/g, ' ')).trim();
    return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
  }

  function priceOf(i) {
    const w = Engine.countWords(i.text);
    switch (i.type) {
      case 'complex': {
        if (!i.suggestion) return { what: i.text, amt: w * 10 };
        const first = i.suggestion.split(', ')[0];
        const save = w - Engine.countWords(first);
        return save > 0 ? { what: i.text + ' → ' + first, amt: save * 10 } : { what: i.text + ' → ' + first, word: 'swap' };
      }
      case 'adverb': return { what: i.text, amt: 10 };
      case 'qualifier': {
        if (i.suggestion && i.cut) { const alt = i.suggestion.split(', ')[0]; return { what: i.text + ' → ' + alt, amt: Math.max(10, (w - Engine.countWords(alt)) * 10) }; }
        return { what: i.text, amt: w * 10 };
      }
      case 'passive': return { what: i.text, word: 'rewrite' };
      case 'hard': return { what: lead(i.text, 30), word: 'split' };
      case 'veryHard': return { what: lead(i.text, 26), word: 'split or cut' };
      default: return { what: i.text, word: 'fix' };
    }
  }

  function renderRefunds(a, words) {
    const list = $('refund-list');
    const sec = $('refunds');
    sec.hidden = !words;
    if (!words || !a) { list.replaceChildren(); return; }
    const s = app().state.settings;
    const hidden = app().hiddenTypes();
    const issues = a.issues.filter((i) => !hidden.includes(i.type)).sort((x, y) => x.start - y.start);
    let total = 0;
    const rows = issues.map((i) => {
      const p = priceOf(i);
      if (p.amt) total += p.amt;
      const line = el('button', {
        type: 'button', class: 'refund-line', 'aria-expanded': String(i.id === openId),
        'aria-label': p.what + ', ' + KIND[i.type] + (p.amt ? ', saves ' + money(p.amt) : ', ' + p.word)
      },
      el('span', { class: 'refund-sw sw-' + i.type, 'aria-hidden': 'true' }),
      el('span', { class: 'refund-what' }, p.what, el('span', { class: 'refund-kind', text: KIND[i.type] })),
      el('span', { class: 'refund-amt' + (p.amt ? '' : ' is-word'), text: p.amt ? money(p.amt) : p.word }));
      line.addEventListener('click', () => {
        if (openId === i.id) { TDW.Popover.hide(); return; }
        Editor.select(i.start, i.end);
        TDW.Popover.show(i, { from: 'tape' });
      });
      const li = el('li', { class: 'refund' + (i.id === openId ? ' is-open' : ''), dataset: { id: i.id } }, line);
      if (i.id === openId && openNode) li.append(openNode);
      return li;
    });
    if (openId && !issues.some((i) => i.id === openId)) { openId = null; openNode = null; }
    if (!rows.length) rows.push(el('li', { class: 'refund-none', text: s.fixHighlights === false ? '' : 'No fixes. Every word is earning its keep.' }));
    list.replaceChildren(...rows);
    $('refund-total').textContent = total ? money(total) : '';
    const note = $('refunds-hidden');
    if (s.fixHighlights === false) {
      note.replaceChildren('Fix highlights are off. ', el('button', { type: 'button', text: 'Turn them on', onclick: () => { app().updateSettings({ fixHighlights: true }); app().refresh(); } }));
      note.hidden = false;
    } else if (hidden.length) {
      const names = hidden.map((t) => PLURAL[t]);
      note.replaceChildren(names.join(', ') + (names.length === 1 ? ' is' : ' are') + ' hidden. ', el('button', {
        type: 'button', text: 'Show', onclick: () => { for (const t of hidden) app().toggleHighlight(t); app().refresh(); }
      }));
      note.hidden = false;
    } else note.hidden = true;
  }

  // popover.js hands over the detail for one refund; it opens in place in the tape.
  function mountDetail(issue, node) {
    closeIssue(true);
    openId = issue.id;
    openNode = node;
    const li = $('refund-list').querySelector('.refund[data-id="' + CSS.escape(issue.id) + '"]');
    if (!li) return false;
    li.classList.add('is-open');
    li.firstChild.setAttribute('aria-expanded', 'true');
    li.append(node);
    if (TDW.Tape) TDW.Tape.reveal(li);
    return true;
  }
  function closeIssue(quiet) {
    const li = openId ? $('refund-list').querySelector('.refund[data-id="' + CSS.escape(openId) + '"]') : null;
    if (li) { li.classList.remove('is-open'); li.firstChild.setAttribute('aria-expanded', 'false'); }
    if (openNode) openNode.remove();
    openId = null;
    openNode = null;
  }

  /* ---------- Render ---------- */
  function render(a, draft, words) {
    current = { draft, words, a };
    renderBalance(draft, words);
    const g = $('reg-grade');
    if (!words || !a) { g.replaceChildren(); g.removeAttribute('title'); }
    else {
      const label = Engine.gradeLabel(a.grade);
      g.replaceChildren('Grade', el('b', { text: String(a.grade) }));
      g.className = 'reg-grade' + (label === 'Hard' ? ' is-hard' : '');
      g.title = 'Readability: ' + ({ Good: 'easy to read', OK: 'a bit hard', Hard: 'hard to read' })[label] + '. Aim for 9 or lower.';
    }
    renderItems(draft, words);
    renderTotals(draft, words, a);
    renderRefunds(a, words);
    const total = $('refund-total').textContent;
    $('panel-summary').replaceChildren(
      el('span', { text: 'Receipt' }),
      words && a ? el('span', { class: 'gs-k', text: 'Grade ' + a.grade }) : null,
      el('span', null, el('span', { class: 'gs-k', text: total ? 'Refunds ' : '' }), el('span', { class: 'gs-fig', text: total })));
  }

  /* ---------- Check the message (an overlay in the tape) ---------- */
  const VERDICT = { clear: ['Clear', 'good'], mixed: ['Mixed', 'ok'], unclear: ['Unclear', 'bad'] };
  const MATCH = { yes: 'Yes', partly: 'Partly', no: 'No' };
  let msgBody = null;

  function setBusy(busy) { app().state.aiBusy = busy; }
  function stopAI() { if (aiCtrl) { aiCtrl.abort(); aiCtrl = null; } if (app().state.aiBusy) setBusy(false); }
  function closeResults() { stopAI(); if (TDW.Tape.overlay() === 'message') TDW.Tape.closeOverlay('message'); }

  function startMessage() {
    if (TDW.AI.status() === 'none') { app().openSettings('ai'); return; }
    if (!Editor.getText().trim()) return;
    stopAI();
    const ov = TDW.Tape.openOverlay('message', { title: 'Check the message', onClose: () => { stopAI(); msgBody = null; } });
    msgBody = ov.body;
    const area = el('textarea', { id: 'msg-intent', class: 'field', rows: '3', placeholder: 'One line is enough' });
    area.value = (current.draft && current.draft.intent) || '';
    const form = el('form', { class: 'msg-form' },
      el('label', { for: 'msg-intent', text: 'What should a reader take away?' }),
      el('p', { class: 'hint', text: 'Optional. The AI reads the draft like a busy reader and says what lands.' }),
      area, el('div', null, el('button', { type: 'submit', class: 'btn', text: 'Check' })));
    form.addEventListener('submit', (e) => { e.preventDefault(); const intent = area.value.trim(); app().setIntent(intent); runMessage(intent); });
    msgBody.replaceChildren(form);
    area.focus();
  }

  function runMessage(intent) {
    if (!msgBody) return;
    stopAI();
    const ctrl = new AbortController();
    aiCtrl = ctrl;
    setBusy(true);
    msgBody.replaceChildren(el('div', { class: 'ai-loading' }, el('span', { text: 'Reading the whole draft…' }),
      el('button', { type: 'button', class: 'btn-quiet btn-sm', text: 'Stop', onclick: closeResults })));
    TDW.AI.messageCheck({ text: Editor.getText(), intent }, ctrl.signal).then((out) => {
      if (aiCtrl !== ctrl) return;
      aiCtrl = null; setBusy(false);
      renderMessage(out);
    }, (err) => {
      if (aiCtrl !== ctrl) return;
      aiCtrl = null; setBusy(false);
      if (err && err.code === 'cancelled') return;
      if (msgBody) msgBody.replaceChildren(el('div', { class: 'ai-block' }, el('p', { class: 'ai-error', text: TDW.AI.errorMessage(err) }),
        el('button', { type: 'button', class: 'btn-outline btn-sm', text: 'Try again', onclick: () => runMessage(intent) })));
    });
  }

  function sharper(label, text, btnLabel, which) {
    const btn = el('button', { type: 'button', class: 'btn-outline btn-sm', text: btnLabel });
    btn.addEventListener('click', () => {
      const list = Engine.analyze(Editor.getText()).sentenceList;
      const r = which === 'first' ? list[0] : list[list.length - 1];
      if (!r) return;
      app().edit(r.start, r.end, text);
      btn.disabled = true;
    });
    return el('div', { class: 'ai-block' }, el('div', { class: 'ai-k', text: label }), el('p', { class: 'sharper', text }), btn);
  }

  function renderMessage(out) {
    if (!msgBody) return;
    const v = VERDICT[out.verdict];
    const head = el('div', { class: 'ai-block' },
      el('div', { class: 'ai-k', text: 'A reader takes away' }),
      el('p', { class: 'takeaway', text: out.takeaway }),
      v ? el('span', { class: 'verdict ' + v[1], text: v[0] }) : null,
      out.match !== 'none' && MATCH[out.match] ? el('p', null, 'Matches what you meant: ', el('b', { text: MATCH[out.match] })) : null,
      out.why ? el('p', { class: 'hint', text: out.why }) : null);
    const nodes = [head];
    if (out.offMessage.length) {
      nodes.push(el('div', { class: 'ai-block' }, el('div', { class: 'ai-k', text: 'Off message' }),
        el('ul', { class: 'off-list' }, out.offMessage.map((o) => el('li', null,
          el('button', { type: 'button', class: 'off-quote', text: o.quote, onclick: () => { const i = Editor.getText().indexOf(o.quote); if (i >= 0) Editor.select(i, i + o.quote.length); } }),
          o.reason ? el('p', { class: 'off-reason', text: o.reason }) : null)))));
    }
    if (out.strongerOpening) nodes.push(sharper('A sharper opening', out.strongerOpening, 'Use as the opening', 'first'));
    if (out.strongerEnding) nodes.push(sharper('A sharper ending', out.strongerEnding, 'Use as the ending', 'last'));
    msgBody.replaceChildren(...nodes);
  }

  /* ---------- Init ---------- */
  function init() {
    fig = TDW.UI.odometer($('reg-figure'));
    $('register').querySelector('.reg-guilloche').append(guilloche());
    $('reg-main').addEventListener('click', () => { if (app().state.mode !== 'edit') app().setMode('edit'); });
    $('balance-pill').addEventListener('click', () => {
      if (app().state.mode !== 'edit') { app().setMode('edit'); return; }
      const T = TDW.Tape;
      T.setDetent(T.detent() === 'half' || T.detent() === 'full' ? 'peek' : 'half');
    });
    $('reg-budget').addEventListener('click', () => ($('budget-form').hidden ? openBudget() : closeBudget()));
    const form = $('budget-form');
    form.noValidate = true;
    form.addEventListener('submit', submitBudget);
    $('budget-cancel').addEventListener('click', () => closeBudget(true));
    $('btn-sample').addEventListener('click', () => app().insertSample());
    $('items').addEventListener('click', onItemClick);
    $('items').addEventListener('mouseover', (e) => { const b = e.target.closest('.item-btn'); if (b) pairLine(Number(b.dataset.line), true); });
    $('items').addEventListener('mouseleave', () => pairLine(-1));
    Editor.rootEl().addEventListener('mousemove', (e) => {
      if (app().state.mode !== 'edit') return;
      const i = Editor.blockIndexOf(e.target);
      if (i !== pairedLine) pairLine(i, false);
    });
    Editor.rootEl().addEventListener('mouseleave', () => pairLine(-1));
  }

  TDW.Panel = {
    init, render, renderBalance, refund, closeResults, startMessage, closeBudget, mountDetail, closeIssue,
    updateAI() { if (current.draft) renderTrim(current.draft, current.words); },
    levelsChanged() { if (current.draft) renderTrim(current.draft, current.words); },
    isBudgetOpen() { return !$('budget-form').hidden; },
    closeSheet() { if (TDW.Tape.isPhone()) TDW.Tape.setDetent(app().state.mode === 'edit' ? 'peek' : 'closed'); },
    isSheetOpen() { const d = TDW.Tape.detent(); return TDW.Tape.isPhone() && (d === 'half' || d === 'full'); },
    openId: () => openId
  };
})();
