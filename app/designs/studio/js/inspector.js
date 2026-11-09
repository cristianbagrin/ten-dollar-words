/* The inspector: one tab per tool (Review, Lab, Challenge, Overflow, Notes, Draft), and a view
   that can be pushed over the tabs (Alternatives). On a computer it slides in from the right
   and the page re-centers; on a phone it is a sheet from the bottom with two detents that you
   drag, flick or tap. The app decides when it opens (TDW.App.setMode / openTab); this module
   only draws and moves it. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, spring, isNarrow, reducedMotion, tip, keys, ctrlKeys } = TDW.UI;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  const TABS = [
    { id: 'review', label: 'Review' },
    { id: 'lab', label: 'Lab', keys: () => ctrlKeys('Ctrl+Shift+L') },
    { id: 'challenge', label: 'Challenge' },
    { id: 'overflow', label: 'Overflow', keys: () => ctrlKeys('Ctrl+Shift+O') },
    { id: 'notes', label: 'Notes', keys: () => ctrlKeys('Ctrl+Shift+M') },
    { id: 'draft', label: 'Draft' }
  ];

  let hooks = {};
  let open = false;
  let current = 'review';
  let pushed = null;        // { name, title, back }
  const btns = {};
  const badges = {};
  let paneSpring = null;    // computer: 0 closed .. 1 open
  let sheetSpring = null;   // phone: translateY in px
  let detent = 'half';
  let navHead = null, navTitle = null, doneBtn = null;

  const pane = (name) => $('tab-' + name);
  // What's in front, for the page's styles: Lab marks show only with the Lab, and so on.
  const syncTab = () => { root.dataset.tab = open ? (pushed ? pushed.name : current) : ''; };

  /* ---------- Tabs ---------- */
  function build() {
    const strip = $('insp-tabs');
    for (const t of TABS) {
      const b = el('button', {
        type: 'button', role: 'tab', id: 'tabbtn-' + t.id, class: 'insp-tab', 'aria-controls': 'tab-' + t.id,
        'aria-selected': String(t.id === current), tabindex: t.id === current ? '0' : '-1', dataset: { tab: t.id }
      }, el('span', { class: 'insp-tab-label', text: t.label }));
      badges[t.id] = el('span', { class: 'insp-badge', hidden: true });
      b.append(badges[t.id]);
      if (t.keys) tip(b, t.label, t.keys());
      b.addEventListener('click', () => { select(t.id, { user: true }); });
      btns[t.id] = b;
      strip.append(b);
    }
    strip.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const i = TABS.findIndex((t) => t.id === current);
      const next = TABS[(i + d + TABS.length) % TABS.length].id;
      select(next, { user: true });
      btns[next].focus();
    });
    // A pushed view (Alternatives) gets a back button and a title in place of the tabs.
    navTitle = el('span', { class: 'insp-nav-title' });
    const back = el('button', { type: 'button', class: 'insp-nav-back', onclick: () => { if (pushed && pushed.back) pushed.back(); else pop(); } },
      icon('chevLeft'), el('span', { class: 'insp-nav-back-label', text: 'Back' }));
    navHead = el('div', { class: 'insp-nav', hidden: true }, back, navTitle);
    strip.after(navHead);
    // Phone: Done closes the sheet.
    doneBtn = el('button', { type: 'button', class: 'insp-done', text: 'Done', onclick: () => hooks.onClose && hooks.onClose() });
    $('panel-handle').after(doneBtn);
  }

  function select(id, opts) {
    if (!btns[id]) return;
    const o = opts || {};
    if (pushed && !o.keepPushed) pop(true);
    const changed = id !== current;
    current = id;
    for (const t of TABS) {
      const on = t.id === id;
      btns[t.id].setAttribute('aria-selected', String(on));
      btns[t.id].tabIndex = on ? 0 : -1;
      const p = pane(t.id);
      if (!pushed) p.hidden = !on;
    }
    if (changed && !pushed) fadeIn(pane(id));
    syncTab();
    if (btns[id].parentNode.scrollWidth > btns[id].parentNode.clientWidth) btns[id].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (changed || o.user) { if (hooks.onTab) hooks.onTab(id, !!o.user); }
  }

  function fadeIn(p) {
    if (!p || reducedMotion()) return;
    p.classList.remove('is-entering');
    void p.offsetWidth;
    p.classList.add('is-entering');
  }

  // Push a view over the tabs; back (or pop) returns to the tab that was showing.
  function push(name, title, back) {
    pushed = { name, title, back: back || null };
    navTitle.textContent = title;
    navHead.hidden = false;
    $('insp-tabs').hidden = true;
    for (const t of TABS) pane(t.id).hidden = true;
    const p = pane(name);
    p.hidden = false;
    fadeIn(p);
    root.classList.add('insp-pushed');
    syncTab();
    if (hooks.onTab) hooks.onTab(current, false);
  }

  function pop(silent) {
    if (!pushed) return;
    const p = pane(pushed.name);
    if (p) p.hidden = true;
    pushed = null;
    navHead.hidden = true;
    $('insp-tabs').hidden = false;
    root.classList.remove('insp-pushed');
    for (const t of TABS) pane(t.id).hidden = t.id !== current;
    syncTab();
    if (!silent) fadeIn(pane(current));
    if (hooks.onTab) hooks.onTab(current, false);
  }

  function setBadge(id, text) {
    const b = badges[id];
    if (!b) return;
    b.textContent = text || '';
    b.hidden = !text;
  }

  /* ---------- Computer: slide in from the right ---------- */
  function setPaneValue(v) {
    root.style.setProperty('--insp', String(Math.max(0, Math.min(1.02, v))));
    if (hooks.onMove) hooks.onMove();
  }

  /* ---------- Phone: a sheet with a half and a full detent ---------- */
  const sheetH = () => $('inspector').offsetHeight || window.innerHeight * 0.92;
  function detentY(d) {
    const h = sheetH();
    const vh = window.innerHeight;
    if (d === 'closed') return h + 24;
    if (d === 'full') return Math.max(0, h - vh * 0.9);
    return Math.max(0, h - Math.round(vh * 0.5));
  }
  function setSheetY(y) {
    $('inspector').style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
    // The page keeps its text clear of the sheet.
    const covered = Math.max(0, sheetH() - y);
    root.style.setProperty('--sheet-cover', Math.round(covered) + 'px');
    if (hooks.onMove) hooks.onMove();
  }
  function setDetent(d, opts) {
    detent = d === 'full' ? 'full' : 'half';
    root.dataset.detent = detent;
    if (open && isNarrow()) sheetSpring.to(detentY(detent), opts);
  }

  function wireSheet() {
    const head = $('panel-handle');
    const zones = [head, $('insp-tabs'), navHead];
    let drag = null;
    let swallow = false;
    const rubber = (over, dim) => (over * dim * 0.55) / (dim + 0.55 * Math.abs(over));
    const project = (v) => (v / 1000) * 0.998 / (1 - 0.998);
    const down = (e) => {
      if (!isNarrow() || !open || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.target.closest('.insp-done')) return;
      drag = { id: e.pointerId, y0: e.clientY, from: sheetSpring.value, moved: false, hist: [{ y: e.clientY, t: e.timeStamp }], node: e.currentTarget };
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dy) < 8) return;
        drag.moved = true;
        try { drag.node.setPointerCapture(e.pointerId); } catch (_) { /* gone */ }
        root.classList.add('is-sheet-dragging');
      }
      const top = detentY('full'), bottom = detentY('closed');
      let y = drag.from + dy;
      if (y < top) y = top - rubber(top - y, 300);
      sheetSpring.set(Math.min(y, bottom + 40));
      drag.hist.push({ y: e.clientY, t: e.timeStamp });
      if (drag.hist.length > 6) drag.hist.shift();
    };
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      root.classList.remove('is-sheet-dragging');
      if (!d.moved) return;
      swallow = true;
      setTimeout(() => { swallow = false; }, 0);
      const a = d.hist[0], b = d.hist[d.hist.length - 1];
      const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
      const landing = sheetSpring.value + project(v);
      const stops = [['full', detentY('full')], ['half', detentY('half')], ['closed', detentY('closed')]];
      let best = stops[0];
      for (const s of stops) if (Math.abs(s[1] - landing) < Math.abs(best[1] - landing)) best = s;
      if (best[0] === 'closed') { if (hooks.onClose) hooks.onClose({ velocity: v }); return; }
      detent = best[0];
      root.dataset.detent = detent;
      sheetSpring.to(best[1], { velocity: v, damping: 0.86, response: 0.38 });
    };
    for (const z of zones) {
      z.addEventListener('pointerdown', down);
      z.addEventListener('pointermove', move);
      z.addEventListener('pointerup', end);
      z.addEventListener('pointercancel', end);
      z.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; } }, true);
    }
    // A tap on the grabber moves between the two detents.
    head.addEventListener('click', () => { if (isNarrow() && open) setDetent(detent === 'half' ? 'full' : 'half', { damping: 1 }); });
  }

  /* ---------- Opening and closing ---------- */
  function show(tab, opts) {
    const o = opts || {};
    if (tab) select(tab, { keepPushed: o.keepPushed });
    if (open && !o.force) { if (isNarrow() && o.detent) setDetent(o.detent); return; }
    open = true;
    root.classList.add('insp-open');
    syncTab();
    $('inspector').setAttribute('aria-hidden', 'false');
    $('inspector').inert = false;
    if (isNarrow()) {
      detent = o.detent || 'half';
      root.dataset.detent = detent;
      if (!sheetSpring.moving && sheetSpring.value < detentY('half') - 1 && sheetSpring.value > 0) { /* mid-flight: keep going */ }
      sheetSpring.to(detentY(detent), { damping: 1, response: 0.4 });
    } else {
      paneSpring.to(1, { instant: o.instant });
    }
    updateToggles();
  }

  function hide(opts) {
    const o = opts || {};
    if (!open && !o.force) return;
    open = false;
    root.classList.remove('insp-open');
    syncTab();
    $('inspector').setAttribute('aria-hidden', 'true');
    if ($('inspector').contains(document.activeElement)) TDW.Editor.focus();
    $('inspector').inert = true;
    if (isNarrow()) {
      sheetSpring.to(detentY('closed'), { velocity: o.velocity, damping: 1, response: 0.36 });
    } else {
      paneSpring.to(0, { instant: o.instant });
    }
    updateToggles();
  }

  function updateToggles() {
    const b = $('btn-insp');
    if (b) {
      b.setAttribute('aria-pressed', String(open));
      tip(b, open ? 'Hide the inspector' : 'Show the inspector', keys('⌘⌥I'));
    }
    const r = $('pb-review');
    if (r) r.setAttribute('aria-pressed', String(open));
  }

  // The layout changed between phone and computer: put the inspector where it belongs.
  function relayout() {
    if (isNarrow()) {
      root.style.setProperty('--insp', '0');
      paneSpring.set(0);
      sheetSpring.set(open ? detentY(detent) : detentY('closed'));
    } else {
      $('inspector').style.transform = '';
      root.style.setProperty('--sheet-cover', '0px');
      paneSpring.set(open ? 1 : 0);
    }
  }

  function init(h) {
    hooks = h || {};
    build();
    paneSpring = spring({ value: 0, response: 0.36, damping: 1, onUpdate: setPaneValue });
    sheetSpring = spring({ value: 2000, response: 0.4, damping: 1, eps: 0.5, onUpdate: setSheetY });
    wireSheet();
    $('inspector').setAttribute('aria-hidden', 'true');
    $('inspector').inert = true;
    relayout();
    TDW.UI.narrowQuery.addEventListener('change', relayout);
    window.addEventListener('resize', () => { if (isNarrow() && open && !sheetSpring.moving) sheetSpring.set(detentY(detent)); });
    // Escape inside the inspector goes back to the page.
    $('inspector').addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || TDW.UI.menuOpen()) return;
      if (e.target.matches('textarea, input') && e.target.value && !e.target.closest('#tab-overflow')) return;
      e.preventDefault();
      if (pushed && pushed.back) { pushed.back(); return; }
      if (pushed) { pop(); return; }
      TDW.Editor.focus();
    });
  }

  TDW.Inspector = {
    TABS, init, pane, show, hide, select, push, pop, setBadge, setDetent, relayout,
    isOpen: () => open,
    tab: () => current,
    pushed: () => (pushed ? pushed.name : null),
    detent: () => detent
  };
})();
