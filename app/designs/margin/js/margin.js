/* The margin: the one side surface. On a computer it is a column to the right of the text where
   notes sit beside their lines (Review, Notes, Alternatives), Overflow gets a panel, and cards
   (a challenge, a Lab run, Trim, the message check) are pinned at its foot. In the narrow layout
   there is no column: the same content comes up in a bottom sheet, and pinned cards sit in a
   tray at the bottom.

   Views: null (closed), 'review', 'notes', 'overflow', 'alts'. Each module puts its own nodes in
   the layer (data-view="…") and calls place() to line them up; only the current view shows. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { UI, Editor } = TDW;
  const { el, icon } = UI;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  const GAP = 8;          // between notes that would otherwise touch
  const ROW = 20;         // a note's first line, centered on its text line
  const TABS = [['review', 'Review'], ['notes', 'Notes'], ['overflow', 'Overflow']];

  let view = null;
  let prevView = null;
  let layer, head, panel, foot, sub, sheetDlg;
  const tabs = {};
  const counts = { review: 0, notes: 0 };
  const listeners = [];
  const cards = new Map(); // key → node
  let sheetView = null;

  const surfaceTop = () => $('surface').getBoundingClientRect().top;

  /* ---------- Where the column is: published as CSS variables for the fixed parts ---------- */
  function measure() {
    const r = $('surface').getBoundingClientRect();
    root.style.setProperty('--col-l', Math.round(r.left) + 'px');
    root.style.setProperty('--col-r', Math.round(r.right) + 'px');
  }

  /* ---------- Views ---------- */
  const isNarrow = () => UI.isNarrow();

  function setView(v, opts) {
    const o = opts || {};
    if (v === view) { if (o.refresh !== false) emit(); return; }
    if (v === 'alts' && view !== 'alts') prevView = view;
    view = v;
    root.dataset.margin = v || '';
    for (const [k] of TABS) {
      tabs[k].setAttribute('aria-selected', String(k === v));
      tabs[k].tabIndex = k === v || (!TABS.some(([x]) => x === v) && k === 'review') ? 0 : -1;
    }
    head.hidden = !v || isNarrow() || v === 'alts';
    panel.hidden = v !== 'overflow' || isNarrow();
    if (sheetView && sheetView !== v) closeSheet(true);
    emit();
  }

  // After Alternatives, back to whatever the margin showed before.
  function restore() { setView(prevView === 'alts' ? null : prevView); prevView = null; }

  function emit() {
    for (const fn of listeners) try { fn(view); } catch (e) { console.error(e); }
    requestAnimationFrame(measure);
  }

  function setCount(v, n) {
    counts[v] = n;
    const c = tabs[v] && tabs[v].querySelector('.tab-n');
    if (c) c.textContent = n ? String(n) : '';
  }

  function buildHead() {
    const list = el('div', { class: 'mh-tabs', role: 'tablist', 'aria-label': 'Margin' });
    for (const [k, label] of TABS) {
      const t = el('button', { type: 'button', role: 'tab', class: 'mh-tab', dataset: { view: k }, 'aria-selected': 'false' },
        el('span', { text: label }), el('span', { class: 'tab-n' }));
      t.addEventListener('mousedown', (e) => e.preventDefault());
      t.addEventListener('click', () => pickTab(k));
      tabs[k] = t;
      list.append(t);
    }
    list.addEventListener('keydown', (e) => {
      const keysList = TABS.map(([k]) => k);
      const i = keysList.indexOf(document.activeElement && document.activeElement.dataset.view);
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d || i < 0) return;
      e.preventDefault();
      const k = keysList[(i + d + keysList.length) % keysList.length];
      pickTab(k);
      tabs[k].focus();
    });
    const close = el('button', { type: 'button', class: 'btn-icon mh-close', 'aria-label': 'Close the margin', title: 'Close (' + UI.keys('⌘E') + ' ends the review)' }, icon('close'));
    close.addEventListener('mousedown', (e) => e.preventDefault());
    close.addEventListener('click', closeAll);
    sub = el('div', { class: 'mh-sub' });
    head.append(el('div', { class: 'mh-row' }, list, close), sub);
  }

  function pickTab(k) {
    const app = TDW.App;
    if (k === 'review') { if (app.state.mode !== 'edit') app.setMode('edit'); else setView('review'); return; }
    if (k === 'notes' && TDW.Notes) { TDW.Notes.showAll(); return; }
    if (k === 'overflow' && TDW.Overflow) { TDW.Overflow.open(); return; }
  }

  // The ×: the margin closes and the review (if on) ends.
  function closeAll() {
    if (view === 'overflow' && TDW.Overflow) TDW.Overflow.close();
    if (TDW.App.state.mode === 'edit') TDW.App.setMode('write');
    setView(null);
    Editor.focus();
  }

  /* ---------- Placing notes beside their lines ---------- */
  // The top of the line that holds markdown offset m, in the layer's coordinates, so a note's
  // first line sits on the text line's center.
  function lineY(m) {
    const rc = Editor.rectAt(m);
    if (!rc) return null;
    return rc.lineTop - surfaceTop() + (rc.lh - ROW) / 2;
  }

  // items: [{ node, y, h? }] already in the layer. In order of their lines, each goes as high as
  // its line, but never over the one above it. An open note floats over the others instead
  // of pushing them, so nothing jumps while you read it.
  function place(items) {
    const list = items.filter((it) => it.y != null && it.node.isConnected).sort((a, b) => a.y - b.y);
    let bottom = -Infinity;
    for (const it of list) {
      const h = it.h != null ? it.h : it.node.offsetHeight;
      it.top = Math.max(it.y, bottom + GAP);
      bottom = it.top + h;
    }
    for (const it of list) moveTo(it.node, it.top);
    for (const it of items) if (it.y == null) it.node.style.visibility = 'hidden';
  }

  function moveTo(node, top) {
    node.style.visibility = '';
    const y = Math.round(top);
    if (node._top === y) return;
    const first = node._top == null;
    node._top = y;
    node.style.setProperty('--y', y + 'px');
    if (first) {
      node.classList.add('is-new');
      requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('is-new')));
    }
  }

  /* ---------- Pinned cards ----------
     pin(key, { title, meta, body, actions: [{ label, run, primary }], tone, onToggle }) shows or
     updates a card at the margin's foot (the bottom tray in the narrow layout). */
  function pin(key, o) {
    let c = cards.get(key);
    if (!c) {
      c = el('section', { class: 'pcard', dataset: { key }, 'aria-label': o.label || o.title || key });
      cards.set(key, c);
      foot.append(c);
      c.classList.add('is-new');
      requestAnimationFrame(() => requestAnimationFrame(() => c.classList.remove('is-new')));
    }
    c.className = 'pcard' + (o.tone ? ' tone-' + o.tone : '') + (o.collapsed ? ' is-collapsed' : '') + (o.busy ? ' is-busy' : '');
    const headBtn = el('button', { type: 'button', class: 'pcard-head', 'aria-expanded': String(!o.collapsed) },
      el('span', { class: 'pcard-title', text: o.title || '' }),
      o.meta ? el('span', { class: 'pcard-meta', text: o.meta }) : null,
      el('span', { class: 'pcard-chev', 'aria-hidden': 'true' }, icon('chevDown')));
    headBtn.addEventListener('click', () => { if (o.onToggle) o.onToggle(); });
    const keepFocus = c.contains(document.activeElement) && document.activeElement.matches('input, textarea') ? document.activeElement : null;
    const kids = [headBtn];
    if (o.body) kids.push(el('div', { class: 'pcard-body' }, o.body));
    if (o.actions && o.actions.length) {
      kids.push(el('div', { class: 'pcard-actions' }, o.actions.map((a) => el('button', {
        type: 'button', class: a.primary ? 'btn btn-sm' : 'btn-quiet btn-sm', text: a.label, disabled: !!a.disabled, title: a.title || null, onclick: a.run
      }))));
    }
    if (keepFocus && o.body && o.body.contains(keepFocus)) { /* the body node carries its own input */ }
    c.replaceChildren(...kids);
    if (keepFocus && c.contains(keepFocus)) keepFocus.focus({ preventScroll: true });
    root.classList.toggle('has-cards', cards.size > 0);
    return c;
  }

  function unpin(key) {
    const c = cards.get(key);
    if (!c) return;
    cards.delete(key);
    root.classList.toggle('has-cards', cards.size > 0);
    if (UI.reducedMotion()) { c.remove(); return; }
    c.classList.add('is-leaving');
    setTimeout(() => c.remove(), 180);
  }

  /* ---------- The sheet: the margin's content in the narrow layout ---------- */
  function buildSheet() {
    sheetDlg = $('margin-sheet');
    sheetDlg.append(el('div', { class: 'grabber', 'aria-hidden': 'true' }),
      el('div', { class: 'ms-head sheet-drag' }, el('h2', { class: 'ms-title' }),
        el('button', { type: 'button', class: 'btn-icon ms-close', 'aria-label': 'Close', onclick: () => UI.dismiss(sheetDlg) }, icon('close'))),
      el('div', { class: 'ms-body' }));
  }

  // body: a node to show; it stays the caller's (it's handed back by onClose).
  function openSheet(v, title, body, o) {
    const opts = o || {};
    if (sheetDlg.open && sheetView !== v) closeSheet(true);
    sheetView = v;
    sheetDlg._closeCb = opts.onClose || null;
    sheetDlg.querySelector('.ms-title').textContent = title;
    sheetDlg.querySelector('.ms-body').replaceChildren(body);
    sheetDlg.classList.toggle('is-tall', !!opts.tall);
    sheetDlg.dataset.view = v;
    UI.present(sheetDlg, { modal: opts.modal !== false, onDismiss: () => { const cb = sheetDlg._closeCb; sheetDlg._closeCb = null; sheetView = null; if (cb) cb(); } });
  }

  function closeSheet(now) {
    if (!sheetDlg || !sheetDlg.open) return;
    if (now) {
      const cb = sheetDlg._closeCb;
      sheetDlg._closeCb = null;
      sheetView = null;
      sheetDlg.close();
      if (cb) cb();
    } else UI.dismiss(sheetDlg);
  }

  function init() {
    layer = $('margin');
    head = $('margin-head');
    panel = $('margin-panel');
    foot = $('margin-foot');
    buildHead();
    buildSheet();
    measure();
    if (window.ResizeObserver) new ResizeObserver(() => { measure(); emit(); }).observe($('surface'));
    window.addEventListener('resize', measure);
    UI.narrowQuery.addEventListener('change', () => {
      if (sheetDlg.open) closeSheet(true);
      head.hidden = !view || isNarrow() || view === 'alts';
      panel.hidden = view !== 'overflow' || isNarrow();
      if (isNarrow() && view === 'overflow') setView(null);
      emit();
    });
  }

  TDW.Margin = {
    init,
    onLayout() { measure(); emit(); },
    view: () => view,
    setView, restore, setCount, onChange(fn) { listeners.push(fn); },
    layer: () => layer, panel: () => panel, sub: () => sub,
    lineY, place, pin, unpin, hasCard: (k) => cards.has(k),
    openSheet, closeSheet, sheetOpen: (v) => !!sheetDlg && sheetDlg.open && (!v || sheetView === v),
    sheetBody: () => sheetDlg.querySelector('.ms-body'),
    isNarrow, closeAll, measure
  };
})();
