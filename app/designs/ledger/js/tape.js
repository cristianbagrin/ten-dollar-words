/* The register tape: one column for the money and every tool. It owns the frame, not the
   contents: which tab shows (Receipt, Notes, Overflow), the overlay that takes the tape over
   for a while (alternatives, the audit, the challenge list, the message check), whether it is
   rolled up (Write mode) or fed out, and on a phone, the bottom sheet with its detents.
   Rolled up = Write mode with the Receipt tab and no overlay; anything else feeds it out. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { UI } = TDW;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const phoneMQ = window.matchMedia('(max-width: 899px)');
  const VIEWS = ['receipt', 'notes', 'overflow'];

  const tape = $('tape');
  const grip = $('panel-handle');
  const main = $('tape-main');
  const pinned = $('tape-pinned');
  const ovHost = $('tape-overlay');
  const scroller = $('tape-scroll');
  const tabs = [...document.querySelectorAll('.tape-tab')];

  let view = 'receipt';
  let overlay = null;      // { name, onClose }
  let detent = 'closed';   // phone: closed | peek | half | full
  let anim = null;
  let y = null;            // phone: the sheet's translateY in px, as drawn

  const isPhone = () => phoneMQ.matches;
  const mode = () => root.dataset.mode || 'write';
  const wantOpen = () => mode() === 'edit' || view !== 'receipt' || !!overlay;

  /* ---------- Computer: rolled up or fed out ---------- */
  function measurePin() {
    tape.style.setProperty('--pin-h', pinned.offsetHeight + 'px');
  }

  function sync() {
    const open = wantOpen();
    root.dataset.tape = open ? 'open' : 'folded';
    tabs.forEach((b) => {
      const on = b.dataset.view === view;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    for (const s of document.querySelectorAll('.tape-view')) s.hidden = s.dataset.view !== view;
    main.inert = !open && !isPhone();
    measurePin();
    if (isPhone()) {
      const busy = view !== 'receipt' || !!overlay;
      let want = detent;
      if (!open) want = pinned.childElementCount ? 'peek' : 'closed';
      else if (busy && (detent === 'closed' || detent === 'peek')) want = 'half';
      else if (!busy && detent === 'closed') want = 'peek';
      setDetent(want);
    } else {
      root.dataset.sheet = 'none';
    }
  }

  function setView(v, opts) {
    if (!VIEWS.includes(v)) return;
    if (v === 'receipt' && mode() === 'write' && !(opts && opts.fold)) {
      // The receipt is the Edit view: asking for it in Write mode means Edit.
      view = 'receipt';
      if (TDW.App) TDW.App.setMode('edit'); else sync();
      return;
    }
    view = v;
    sync();
    if (isPhone() && v !== 'receipt' && (detent === 'closed' || detent === 'peek')) setDetent('half');
    if (TDW.Tape && TDW.Tape.onView) TDW.Tape.onView(v);
  }

  /* ---------- Overlays ---------- */
  function openOverlay(name, o) {
    if (overlay) closeOverlay(null, true);
    const close = UI.el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Close', title: 'Close (Esc)' }, UI.icon('close'));
    close.addEventListener('click', () => closeOverlay(name));
    const head = UI.el('div', { class: 'ov-head' }, o.back ? o.back : null, UI.el('h3', { class: 'ov-title', text: o.title || '' }), o.extra || null, close);
    const body = UI.el('div', { class: 'ov-body' });
    const foot = o.foot ? UI.el('div', { class: 'ov-foot' }, o.foot) : null;
    ovHost.replaceChildren(head, body, foot || '');
    ovHost.hidden = false;
    ovHost.dataset.name = name;
    overlay = { name, onClose: o.onClose || null };
    sync();
    if (isPhone() && (detent === 'closed' || detent === 'peek')) setDetent('half');
    return { head, body, foot, title: head.querySelector('.ov-title'), el: ovHost };
  }

  // silent: replaced by another overlay, so nothing else changes yet.
  function closeOverlay(name, silent) {
    if (!overlay || (name && overlay.name !== name)) return false;
    const o = overlay;
    overlay = null;
    ovHost.hidden = true;
    ovHost.replaceChildren();
    delete ovHost.dataset.name;
    if (o.onClose) { try { o.onClose(); } catch (e) { console.error(e); } }
    if (!silent) sync();
    return true;
  }

  /* ---------- Phone: the sheet ---------- */
  const sheetH = () => tape.offsetHeight || window.innerHeight * 0.88;
  const safeBottom = () => parseFloat(getComputedStyle(root).getPropertyValue('--sab')) || 0;
  function targetY(d) {
    const h = sheetH();
    if (d === 'closed') return h + 8;
    if (d === 'peek') return h - 64 - safeBottom();
    if (d === 'half') return Math.max(0, h - Math.round(window.innerHeight * 0.42));
    return 0;
  }
  function draw(v) {
    y = v;
    tape.style.setProperty('--sheet-y', Math.round(v * 10) / 10 + 'px');
  }
  function setDetent(d, velocity, bounce) {
    if (!isPhone()) return;
    const was = detent;
    detent = d;
    root.dataset.sheet = d;
    grip.setAttribute('aria-expanded', String(d === 'half' || d === 'full'));
    grip.setAttribute('aria-label', d === 'half' || d === 'full' ? 'Lower the tape' : 'Raise the tape');
    const to = targetY(d);
    if (y == null || (was === d && !anim && Math.abs(y - to) < 1)) { if (y == null || Math.abs(y - to) >= 1) draw(to); return; }
    if (anim) anim.stop();
    anim = UI.spring({
      from: y, to, velocity: velocity || 0, response: 0.36, damping: bounce ? 0.82 : 1,
      onUpdate: draw, onDone: () => { anim = null; }
    });
  }

  // The sheet follows the finger from where it is, and lands where the flick was heading.
  function wireDrag() {
    let drag = null;
    let swallow = false;
    const rubber = (over, dim) => (over * dim * 0.55) / (dim + 0.55 * Math.abs(over));
    const project = (v) => (v / 1000) * 0.998 / (1 - 0.998);
    grip.addEventListener('pointerdown', (e) => {
      if (!isPhone() || e.button !== 0) return;
      if (anim) { anim.stop(); anim = null; }
      drag = { id: e.pointerId, y0: e.clientY, from: y == null ? targetY(detent) : y, moved: false, hist: [{ y: e.clientY, t: e.timeStamp }] };
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(dy) < 8) return;
      drag.moved = true;
      let v = drag.from + dy;
      const lo = 0, hi = targetY('peek');
      if (v < lo) v = lo - rubber(lo - v, sheetH());
      else if (v > hi) v = hi + rubber(v - hi, sheetH());
      draw(v);
      drag.hist.push({ y: e.clientY, t: e.timeStamp });
      if (drag.hist.length > 6) drag.hist.shift();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      swallow = true;
      setTimeout(() => { swallow = false; }, 0);
      const a = d.hist[0], b = d.hist[d.hist.length - 1];
      const vel = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
      const land = y + project(vel);
      const stops = ['full', 'half', 'peek'];
      if (mode() === 'write' && !pinned.childElementCount) stops.push('closed');
      let best = stops[0], dist = Infinity;
      for (const s of stops) { const dd = Math.abs(targetY(s) - land); if (dd < dist) { dist = dd; best = s; } }
      if (best === 'closed') { fold(); setDetent('closed', vel, true); return; }
      setDetent(best, vel, Math.abs(vel) > 300);
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('click', (e) => {
      if (swallow) { e.stopImmediatePropagation(); return; }
      if (detent === 'half' || detent === 'full') {
        if (mode() === 'write' && !pinned.childElementCount) { fold(); return; }
        setDetent('peek');
      } else setDetent('half');
    });
  }

  /* ---------- Everyone else's handles ---------- */
  function fold() {
    closeOverlay(null, true);
    view = 'receipt';
    sync();
  }

  // Put a node in sight inside the tape (and lift the phone sheet to see it).
  function reveal(node, opts) {
    if (isPhone() && (detent === 'closed' || detent === 'peek')) setDetent('half');
    if (!node || !node.isConnected) return;
    const box = node.closest('.ov-body') || scroller;
    const r = node.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top + 8 || r.bottom > b.bottom - 8) {
      const top = box.scrollTop + (r.top - b.top) - (opts && opts.center ? (b.height - r.height) / 2 : 24);
      box.scrollTo({ top: Math.max(0, top), behavior: UI.reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function escape() {
    if (overlay) { closeOverlay(); return true; }
    if (view !== 'receipt') { view = 'receipt'; sync(); return true; }
    if (isPhone() && (detent === 'half' || detent === 'full')) { setDetent(mode() === 'edit' || pinned.childElementCount ? 'peek' : 'closed'); return true; }
    return false;
  }

  function init() {
    tabs.forEach((b) => {
      b.addEventListener('click', () => setView(b.dataset.view));
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const i = (tabs.indexOf(b) + d + tabs.length) % tabs.length;
        tabs[i].focus();
        setView(tabs[i].dataset.view);
      });
    });
    $('tape-fold').append(UI.icon('close'));
    $('tape-fold').addEventListener('click', () => { fold(); if (TDW.Editor) TDW.Editor.focus(); });
    if (window.ResizeObserver) new ResizeObserver(measurePin).observe(pinned);
    wireDrag();
    phoneMQ.addEventListener('change', () => { y = null; detent = 'closed'; sync(); });
    window.addEventListener('resize', () => { if (isPhone() && !anim) draw(targetY(detent)); });
    root.style.setProperty('--sab', 'env(safe-area-inset-bottom, 0px)');
    sync();
  }

  TDW.Tape = {
    init, sync, setView, fold, reveal, escape, openOverlay, closeOverlay, measurePin,
    view: () => view,
    overlay: () => (overlay ? overlay.name : null),
    isOpen: wantOpen,
    isPhone,
    detent: () => detent,
    setDetent,
    onMode() { if (isPhone() && mode() === 'write' && view === 'receipt' && !overlay) detent = pinned.childElementCount ? 'peek' : 'closed'; sync(); }
  };
  init();
})();
