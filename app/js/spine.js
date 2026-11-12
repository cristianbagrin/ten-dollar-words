/* The spine: a slim line that never hides. Left, the draft's title (the drafts switcher) and its
   Notion stage; right, what the words have cost in red pencil (click: the tally and budget), a
   sync dot when Notion is connected, and ⋯ for the command palette. It recedes while you type. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { UI, Store, Sync, Engine, Editor, Inline } = TDW;
  const { el, icon, money, plural } = UI;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);

  const PRESETS = [500, 1000, 2000, 3000, 8000, 15000];
  const PRESET_NOTE = { 500: 'an X post', 1000: 'a short LinkedIn post', 2000: 'a LinkedIn post', 3000: 'a long post or thread', 8000: 'a newsletter', 15000: 'an essay' };
  const SYNC_TEXT = { syncing: 'Syncing with Notion', synced: 'Synced with Notion', offline: 'Offline: changes wait', error: 'Notion sync stopped', 'other-tab': 'Syncing in another tab' };
  const COLORS = { gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };

  let shown = null, tween = null, nbBtn = null, saveErr = false, refundEl = null, refundSum = 0, refundAt = 0;

  /* ---------- Counts ---------- */
  const charsOf = (md) => md.split('\n').map((l) => Inline.plain(l)).join('\n').replace(/\n+/g, '\n').trim().length;

  function tally() {
    const d = app().state.draft;
    const words = app().state.words;
    const text = app().publishText();
    const a = app().state.analysis || null;
    const chars = charsOf(text);
    const sec = Math.round(words / 238 * 60);
    return { words, chars, spent: words * 10, budget: d ? d.budget : 0, read: sec < 60 ? (words ? 'under a minute' : '0 min') : Math.round(sec / 60) + ' min', grade: words && a ? a.grade : null };
  }

  function countLine(t) {
    return t.words.toLocaleString() + ' ' + plural(t.words, 'word', 'words') + ', ' + t.chars.toLocaleString() + ' ' + plural(t.chars, 'character', 'characters') + ', ' + t.read + ' to read';
  }

  /* ---------- The stage: the draft's first status or select property ---------- */
  function stageOf(d) {
    const c = Sync.config();
    if (!c || !c.schema || !d || d.localOnly) return null;
    const names = Object.keys(c.schema);
    const name = names.find((n) => c.schema[n].type === 'status') || names.find((n) => c.schema[n].type === 'select');
    if (!name) return null;
    const v = d.props && d.props[name];
    if (!v || typeof v !== 'string') return null;
    return { name, value: v, color: (c.schema[name].colors || {})[v] || 'gray' };
  }

  /* ---------- Drawing ---------- */
  function drawAmount(n) {
    $('spine-spend').querySelector('.spend-amt').textContent = money(n);
  }

  function render() {
    const d = app().state.draft;
    if (!d) return;
    const title = Store.displayTitle(d);
    const empty = !d.text.trim() && !d.title.trim();
    const t = $('spine-title').querySelector('.spine-title-text');
    t.textContent = empty ? 'Untitled' : title;
    $('spine-title').classList.toggle('is-untitled', empty);
    $('spine-title').setAttribute('aria-label', 'Drafts. Open: ' + (empty ? 'Untitled' : title));
    document.title = (empty ? 'Untitled' : title) + ' - Ten Dollar Words';

    const st = stageOf(d);
    const stage = $('spine-stage');
    stage.hidden = !st;
    if (st) {
      stage.replaceChildren(el('span', { class: 'stage-dot', style: 'background:' + (COLORS[st.color] || COLORS.gray) }), el('span', { text: st.value }));
      stage.dataset.tip = st.name + '. Click to change';
      stage.dataset.prop = st.name;
      stage.setAttribute('aria-label', st.name + ': ' + st.value + '. Change');
    }
    nbBtn.hidden = !app().backspaceOff(d);

    const tl = tally();
    const spend = $('spine-spend');
    const over = tl.spent > tl.budget;
    const warn = !over && tl.budget > 0 && tl.spent >= tl.budget * 0.9;
    spend.classList.toggle('is-over', over);
    spend.classList.toggle('is-warn', warn);
    spend.querySelector('.spend-of').textContent = ' of ' + money(tl.budget);
    let ov = spend.querySelector('.spend-over');
    if (!ov) { ov = el('span', { class: 'spend-over' }); spend.querySelector('.spend-of').after(ov); }
    ov.hidden = !over;
    ov.textContent = over ? money(tl.spent - tl.budget) + ' over' : '';
    spend.setAttribute('aria-label', 'Spent ' + money(tl.spent) + (over ? ', over the ' : ' of a ') + money(tl.budget) + ' budget. ' + countLine(tl) + '.');
    spend.title = countLine(tl);
    if (shown === null || UI.reducedMotion()) { shown = tl.spent; drawAmount(shown); }
    else if (shown !== tl.spent) {
      if (tween) tween.stop();
      const from = shown;
      tween = UI.spring({ from, to: tl.spent, response: 0.28, onUpdate: (v) => drawAmount(Math.round(v / 10) * 10) });
      shown = tl.spent;
    }
    if ($('tally').open) drawTally();
  }

  function renderSync() {
    const b = $('spine-sync');
    const s = Sync.status();
    if (TDW.Drafts) TDW.Drafts.renderSync();
    // The drafts sidebar has the sync button; here a dot shows only when sync needs you.
    const show = Sync.isConnected() && (s.state === 'error' || s.state === 'offline');
    b.hidden = !show;
    if (!show) return;
    b.dataset.state = s.state || 'synced';
    const label = (SYNC_TEXT[s.state] || 'Notion') + (s.at ? ', last sync ' + UI.relTime(s.at) : '');
    b.setAttribute('aria-label', label);
    b.title = label;
  }

  // Words just cut: the saving rises off the amount and fades.
  function refund(words) {
    if (app().state.mode !== 'edit' || UI.reducedMotion()) return;
    const now = Date.now();
    refundSum = (refundEl && now - refundAt < 700 ? refundSum : 0) + words * 10;
    refundAt = now;
    if (refundEl) refundEl.remove();
    const chip = el('span', { class: 'refund', 'aria-hidden': 'true', text: '−' + money(refundSum) });
    $('spine-spend').append(chip);
    refundEl = chip;
    setTimeout(() => { chip.remove(); if (refundEl === chip) refundEl = null; }, 900);
  }

  function setSaveError(on) {
    saveErr = !!on;
    $('spine').classList.toggle('has-save-error', saveErr);
  }

  function nudgeBackspace() {
    if (!nbBtn || nbBtn.hidden) return;
    nbBtn.classList.remove('is-nudged');
    void nbBtn.offsetWidth;
    nbBtn.classList.add('is-nudged');
  }

  /* ---------- The tally: spend, counts, grade and budget ---------- */
  function drawTally() {
    const dlg = $('tally');
    const tl = tally();
    const over = tl.spent > tl.budget;
    const pct = tl.budget ? Math.min(1, tl.spent / tl.budget) : 0;
    const lens = app().state.mode === 'edit';
    const custom = el('input', { type: 'number', min: '10', step: '10', inputmode: 'numeric', 'aria-label': 'Budget in dollars', value: String(tl.budget) });
    const form = el('form', { class: 'tally-custom' }, el('span', { class: 'money-input' }, el('span', { text: '$' }), custom),
      el('button', { type: 'submit', class: 'btn-outline btn-sm', text: 'Set' }));
    form.noValidate = true;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Math.round(Number(custom.value) / 10) * 10;
      if (!(v >= 10)) { custom.focus(); return; }
      app().setBudget(v, true);
    });
    const stat = (k, v) => el('div', { class: 'tally-stat' }, el('dt', { text: k }), el('dd', { text: v }));
    const grade = tl.grade == null ? '—' : tl.grade + ' ' + ({ Good: 'easy', OK: 'fair', Hard: 'hard' }[Engine.gradeLabel(tl.grade)] || '');
    dlg.replaceChildren(
      el('div', { class: 'tally-head' },
        el('div', { class: 'tally-amt' + (over ? ' is-over' : tl.budget > 0 && tl.spent >= tl.budget * 0.9 ? ' is-warn' : '') }, el('span', { class: 'tally-spent', text: money(tl.spent) }),
          el('span', { class: 'tally-of', text: over ? money(tl.spent - tl.budget) + ' over the ' + money(tl.budget) + ' budget' : 'of ' + money(tl.budget) + ', ' + money(tl.budget - tl.spent) + ' left' })),
        el('div', { class: 'tally-meter', 'aria-hidden': 'true' }, el('span', { style: 'width:' + (pct * 100).toFixed(1) + '%' }))),
      el('dl', { class: 'tally-stats' }, stat('Words', tl.words.toLocaleString()), stat('Characters', tl.chars.toLocaleString()), stat('Reading', tl.read), stat('Grade', grade)),
      el('div', { class: 'tally-budget' },
        el('div', { class: 'tally-label', text: 'Budget for this draft' }),
        el('div', { class: 'presets', role: 'group', 'aria-label': 'Budgets' }, PRESETS.map((v) => el('button', {
          type: 'button', class: 'preset' + (v === tl.budget ? ' is-on' : ''), 'aria-pressed': String(v === tl.budget), text: money(v),
          title: (v / 10) + ' words, ' + PRESET_NOTE[v], onclick: () => app().setBudget(v, true)
        }))),
        form),
      el('button', { type: 'button', class: 'tally-review', onclick: () => { UI.dismiss(dlg); app().toggleLens(); } },
        icon('pencil'), el('span', { text: lens ? 'Stop reviewing' : 'Review this draft' }), TDW.Keys.combo('review') ? UI.kbd(TDW.Keys.combo('review')) : null));
  }

  function openTally() {
    const dlg = $('tally');
    if (dlg.open) { UI.dismiss(dlg); return; }
    drawTally();
    UI.present(dlg, { anchor: $('spine-spend'), align: 'end', onDismiss: () => Editor.focus() });
    const on = dlg.querySelector('.preset.is-on') || dlg.querySelector('.tally-review');
    if (on && !UI.isNarrow()) on.focus({ preventScroll: true });
  }

  const plainName = (t) => String(t || '').replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '').replace(/\s+/g, ' ').trim();

  function syncMenu() {
    const s = Sync.status();
    const c = Sync.config();
    const items = [
      { type: 'head', label: (SYNC_TEXT[s.state] || 'Notion') + (c ? ': ' + plainName(c.dbTitle) : '') },
      s.message ? { type: 'head', label: s.message } : null,
      { label: s.at ? 'Last sync ' + UI.relTime(s.at) : 'Not synced yet', value: 'none', icon: 'sync' },
      { type: 'sep' },
      { label: 'Notion settings', value: 'settings', icon: 'sliders' }
    ];
    UI.menu($('spine-sync'), items, (it) => { if (it.value === 'settings') TDW.Dialogs.openSettings('notion'); return it.value === 'none'; }, null, null, { align: 'end' });
  }

  function init() {
    $('spine-title').append(icon('chevDown'));
    $('spine-more').append(icon('more'));
    const tips = () => { $('spine-more').dataset.tip = TDW.Keys.tip('Commands', 'palette'); $('spine-title').dataset.tip = TDW.Keys.tip('Drafts', 'drafts'); };
    $('spine-more').classList.add('tip-end');
    tips();
    TDW.Keys.onChange(tips);
    nbBtn = el('button', { type: 'button', class: 'spine-nb', hidden: true, 'aria-label': 'No backspace is on. Turn it off', 'data-tip': 'No backspace' }, icon('backspace'));
    nbBtn.addEventListener('click', () => app().setBackspaceOff(false));
    $('spine-stage').after(nbBtn);
    for (const b of [$('spine-title'), $('spine-spend'), $('spine-more'), $('spine-sync'), nbBtn]) b.addEventListener('mousedown', (e) => e.preventDefault());
    $('spine-title').addEventListener('click', () => TDW.Drafts.toggle());
    $('spine-stage').addEventListener('mousedown', (e) => e.preventDefault());
    $('spine-stage').addEventListener('click', () => { const d = app().state.draft; if (d && $('spine-stage').dataset.prop) TDW.Drafts.editProp($('spine-stage'), d, $('spine-stage').dataset.prop); });
    $('spine-spend').addEventListener('click', openTally);
    $('spine-more').addEventListener('click', () => TDW.Palette && TDW.Palette.toggle());
    $('spine-sync').addEventListener('click', syncMenu);
    // A thin line under the spine only once the page has scrolled under it.
    const onScroll = () => $('spine').classList.toggle('is-scrolled', window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  TDW.Spine = { init, render, renderSync, refund, setSaveError, nudgeBackspace, openTally, tally, countLine, charsOf };
})();
