/* Shared helpers: what the app runs on, element builder, icons, toasts, tooltips, menus, the
   calendar, switches, segmented controls and the spring every pane and sheet moves with. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};

  /* ---------- What the app runs on ----------
     A phone gets phone words and controls, in the browser or from the home screen: taps, not
     clicks or keyboard shortcuts. Apple keyboards say ⌘; everything else says Ctrl. */
  const device = (() => {
    const ua = navigator.userAgent || '';
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches;
    const ipad = /iPad/.test(ua) || (/Mac/.test(platform) && navigator.maxTouchPoints > 1);
    const phone = /iPhone|iPod/.test(ua) || (/Android/.test(ua) && /Mobile/.test(ua)) ||
      (!ipad && coarse && Math.min(screen.width, screen.height) < 600);
    const tablet = !phone && (ipad || /Android/.test(ua) || coarse);
    return { phone, tablet, touch: phone || tablet, apple: /Mac|iPhone|iPad|iPod/.test(platform + ' ' + ua) };
  })();
  document.documentElement.dataset.device = device.phone ? 'phone' : device.tablet ? 'tablet' : 'computer';

  // The phone layout (library as home, page pushed, inspector as a sheet) follows the width,
  // so a narrow window on a computer gets it too.
  const narrowQuery = window.matchMedia('(max-width: 760px)');
  const isNarrow = () => narrowQuery.matches;

  const keys = (mac) => (device.apple ? mac
    : mac.replace(/⌘/g, 'Ctrl+').replace(/⌥/g, 'Alt+').replace(/⇧/g, 'Shift+').replace(/⌃/g, 'Ctrl+').replace(/↩/g, 'Enter'));
  // Shortcuts that are Ctrl on every keyboard ("Ctrl+Shift+M"), written the Mac way on a Mac.
  const ctrlKeys = (k) => (device.apple ? k.replace(/Ctrl\+/g, '⌃').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥') : k);

  // The on-screen keyboard covers the bottom of the page without resizing it: --kb is how much
  // it covers, so the bottom toolbar and toasts sit above it.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const fit = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty('--kb', (device.touch ? covered : 0) + 'px');
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }
  const visibleBottom = () => (device.touch && window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight);

  /* ---------- Icons: 16px, 1.5px strokes, one family ---------- */
  const svg = (inner, vb) => '<svg class="icon" width="16" height="16" viewBox="' + (vb || '0 0 16 16') + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const EYE = '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none"/>';

  TDW.icons = {
    close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    gear: svg('<circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/>'),
    eye: svg(EYE),
    eyeOff: svg(EYE + '<path d="M2.5 13.5l11-11"/>'),
    chevUp: svg('<path d="M4 10l4-4 4 4"/>'),
    chevLeft: svg('<path d="M10 3.5L5.5 8l4.5 4.5"/>'),
    chevRight: svg('<path d="M6 3.5L10.5 8 6 12.5"/>'),
    chevDown: svg('<path d="M4.5 6.5l3.5 3.5 3.5-3.5"/>'),
    trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2c.05.7.6 1.3 1.3 1.3h3.2c.7 0 1.25-.6 1.3-1.3l.6-8.2"/>'),
    plus: svg('<path d="M8 3.5v9M3.5 8h9"/>'),
    compose: svg('<path d="M13 8.5V13a.5.5 0 01-.5.5h-9A.5.5 0 013 13V4a.5.5 0 01.5-.5H8"/><path d="M11.6 2.4l2 2L8 10l-2.6.6L6 8z"/>'),
    library: svg('<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M6 2.75v10.5M3.5 5.5h1M3.5 7.5h1"/>'),
    inspector: svg('<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M10 2.75v10.5M11.6 5.5h1M11.6 7.5h1"/>'),
    pen: svg('<path d="M10.8 2.7l2.5 2.5-7.6 7.6-3.2.7.7-3.2z"/><path d="M9.3 4.2l2.5 2.5"/>'),
    penOff: svg('<path d="M10.8 2.7l2.5 2.5-7.6 7.6-3.2.7.7-3.2z"/><path d="M9.3 4.2l2.5 2.5"/><path d="M2 2l12 12"/>'),
    share: svg('<path d="M8 10V2.5M5 5.2L8 2.3l3 2.9"/><path d="M5.5 7H4.2a.7.7 0 00-.7.7v5.6c0 .4.3.7.7.7h7.6c.4 0 .7-.3.7-.7V7.7a.7.7 0 00-.7-.7h-1.3"/>'),
    search: svg('<circle cx="7" cy="7" r="4.25"/><path d="M10.2 10.2l3.3 3.3"/>'),
    more: svg('<circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/>'),
    external: svg('<path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5"/><path d="M11.5 9.5v3.3a.7.7 0 01-.7.7H3.2a.7.7 0 01-.7-.7V5.2c0-.4.3-.7.7-.7h3.3"/>'),
    note: svg('<path d="M2.75 3.25h10.5v7.5H7.4L4.5 13v-2.25H2.75z"/>'),
    link: svg('<path d="M6.8 9.2l2.4-2.4M7.6 4.9l.9-.9a2.4 2.4 0 013.4 3.4l-.9.9M8.4 11.1l-.9.9a2.4 2.4 0 01-3.4-3.4l.9-.9"/>'),
    spark: svg('<path d="M8 1.8l1.3 3.7 3.7 1.3-3.7 1.3L8 11.8 6.7 8.1 3 6.8l3.7-1.3z"/><path d="M12.6 10.6l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z"/>'),
    alts: svg('<path d="M2.5 5h8.5M8.5 2.5L11 5 8.5 7.5M13.5 11H5M7.5 8.5L5 11l2.5 2.5"/>'),
    check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
    review: svg('<path d="M3 2.75h7.5L13 5.25v8H3z"/><path d="M5.5 7.5h5M5.5 10h3"/>'),
    format: svg('<path d="M2.5 4h11M2.5 8h8M2.5 12h5"/>'),
    sidebarBack: svg('<path d="M10 3.5L5.5 8l4.5 4.5"/>')
  };

  function icon(name) {
    const t = document.createElement('template');
    t.innerHTML = TDW.icons[name] || '';
    return t.content.firstChild;
  }

  // el('button', { class, text, type, onclick, dataset, ... }, ...children). Strings become text nodes.
  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') n[k] = v;
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Spring ----------
     Damping ratio and response (seconds), the way Apple describes them. It always moves from
     the value on screen and keeps its velocity when the target changes, so any motion can be
     grabbed or reversed halfway. */
  function spring(o) {
    let x = o.value || 0, v = 0, target = x, raf = 0, last = 0;
    let response = o.response || 0.36, damping = o.damping == null ? 1 : o.damping;
    const eps = o.eps || 0.0005;
    const update = o.onUpdate || (() => {});
    function step(now) {
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000));
      last = now;
      const k = Math.pow(2 * Math.PI / response, 2);
      const c = 4 * Math.PI * damping / response;
      const n = Math.max(1, Math.ceil(dt * 240));
      const h = dt / n;
      for (let i = 0; i < n; i++) { const a = -k * (x - target) - c * v; v += a * h; x += v * h; }
      if (Math.abs(x - target) < eps && Math.abs(v) < eps * 20) {
        x = target; v = 0; raf = 0; update(x);
        if (o.onRest) o.onRest(x);
        return;
      }
      update(x);
      raf = requestAnimationFrame(step);
    }
    const api = {
      to(t, opts) {
        const p = opts || {};
        target = t;
        if (p.velocity != null) v = p.velocity;
        if (p.response) response = p.response;
        if (p.damping != null) damping = p.damping;
        if (p.instant || reducedMotion()) { api.set(t); if (o.onRest) o.onRest(t); return; }
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
      },
      set(t) { cancelAnimationFrame(raf); raf = 0; x = target = t; v = 0; update(x); },
      get value() { return x; },
      get target() { return target; },
      get moving() { return !!raf; }
    };
    return api;
  }

  /* ---------- Toast: only to confirm what you just did ---------- */
  const topDialog = () => {
    const open = document.querySelectorAll('dialog[open]');
    return open.length ? open[open.length - 1] : null;
  };
  // A modal dialog makes the rest of the page inert, so the toast moves inside it while one is open.
  function rehostToast() {
    const t = document.getElementById('toast');
    if (!t) return;
    const host = (!t.hidden && topDialog()) || document.body;
    if (t.parentNode !== host) host.append(t);
  }

  let toastTimer = 0;
  function hideToast() {
    clearTimeout(toastTimer);
    const t = document.getElementById('toast');
    if (!t) return;
    const done = () => { t.classList.remove('is-leaving'); t.hidden = true; rehostToast(); };
    if (t.hidden || reducedMotion()) { done(); return; }
    t.classList.add('is-leaving');
    toastTimer = setTimeout(done, 160);
  }

  function toast(msg, action) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.classList.remove('is-leaving');
    t.replaceChildren(el('span', { class: 'toast-msg', text: msg }));
    if (action) {
      t.append(el('button', { type: 'button', class: 'toast-btn', text: action.label, onclick: () => { hideToast(); action.run(); } }));
    }
    t.hidden = false;
    rehostToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 6000 : 3200);
  }

  /* ---------- Tooltips: a short name and its shortcut, on hover or keyboard focus ---------- */
  let tipEl = null, tipFor = null, tipTimer = 0, tipWarmUntil = 0;
  function tip(node, text, shortcut) {
    node.dataset.tip = text;
    if (shortcut) node.dataset.tipKeys = shortcut; else delete node.dataset.tipKeys;
    if (!node.getAttribute('aria-label') && !node.textContent.trim()) node.setAttribute('aria-label', text);
    node.removeAttribute('title');
  }
  function showTip(node) {
    if (!node || !node.isConnected || !node.dataset.tip) return;
    if (!tipEl) { tipEl = el('div', { class: 'tooltip', role: 'tooltip', hidden: true }); document.body.append(tipEl); }
    tipEl.replaceChildren(el('span', { text: node.dataset.tip }), node.dataset.tipKeys ? el('kbd', { text: node.dataset.tipKeys }) : null);
    tipEl.hidden = false;
    tipFor = node;
    const r = node.getBoundingClientRect();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 6) top = r.top - h - 6;
    tipEl.style.left = Math.round(Math.max(6, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 6))) + 'px';
    tipEl.style.top = Math.round(top) + 'px';
  }
  function hideTip() {
    clearTimeout(tipTimer);
    if (tipEl && !tipEl.hidden) { tipEl.hidden = true; tipWarmUntil = performance.now() + 400; }
    tipFor = null;
  }
  if (!device.touch) {
    document.addEventListener('pointerover', (e) => {
      const n = e.target.closest && e.target.closest('[data-tip]');
      if (n === tipFor) return;
      hideTip();
      if (!n || openMenu) return;
      tipTimer = setTimeout(() => showTip(n), performance.now() < tipWarmUntil ? 60 : 550);
    });
    document.addEventListener('focusin', (e) => {
      const n = e.target.closest && e.target.closest('[data-tip]');
      if (n && n.matches(':focus-visible')) showTip(n); else hideTip();
    });
    document.addEventListener('pointerdown', hideTip, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); }, true);
    window.addEventListener('scroll', hideTip, true);
  }

  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const plural = (n, one, many) => (n === 1 ? one : many);
  function costNote(savedWords) {
    if (savedWords > 0) return 'saves ' + money(savedWords * 10);
    if (savedWords < 0) return 'costs ' + money(-savedWords * 10) + ' more';
    return 'same cost';
  }
  function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60e3) return 'Just now';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' min ago';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' h ago';
    if (diff < 2 * 86400e3) return 'Yesterday';
    const d = new Date(ts);
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  }

  /* ---------- Segmented control ---------- */
  function segmented(o) {
    const wrap = el('div', { class: 'seg' + (o.class ? ' ' + o.class : ''), role: 'radiogroup', 'aria-label': o.label });
    let current = o.value;
    const btns = o.options.map((opt) => {
      const b = el('button', {
        type: 'button', role: 'radio', class: 'seg-opt', dataset: { value: opt.value },
        'aria-checked': String(opt.value === current), tabindex: opt.value === current ? '0' : '-1'
      }, opt.label);
      if (opt.tip) tip(b, opt.tip, opt.keys);
      b.addEventListener('click', () => pick(opt.value, true));
      return b;
    });
    wrap.append(...btns);
    function pick(v, user) {
      if (v === current) return;
      set(v);
      if (user && o.onChange) o.onChange(v);
    }
    function set(v) {
      current = v;
      for (const b of btns) {
        const on = b.dataset.value === v;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      }
    }
    wrap.addEventListener('keydown', (e) => {
      const i = btns.findIndex((b) => b.dataset.value === current);
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = btns[(i + d + btns.length) % btns.length];
      pick(next.dataset.value, true);
      next.focus();
    });
    wrap.set = set;
    wrap.get = () => current;
    return wrap;
  }

  /* ---------- Switch ---------- */
  function toggle(o) {
    const b = el('button', {
      type: 'button', role: 'switch', class: 'switch' + (o.class ? ' ' + o.class : ''),
      'aria-checked': String(!!o.checked), 'aria-label': o.label || null, id: o.id || null
    }, el('span', { class: 'switch-knob', 'aria-hidden': 'true' }));
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(on));
      if (o.onChange) o.onChange(on);
    });
    b.set = (on) => b.setAttribute('aria-checked', String(!!on));
    return b;
  }

  /* ---------- Menu: a small list anchored to what opened it ---------- */
  let openMenu = null;
  function closeMenu() {
    if (!openMenu) return;
    const m = openMenu;
    openMenu = null;
    m.cleanup();
    if (m.onClose) m.onClose();
    if (m.anchor && m.anchor.setAttribute && m.anchor.hasAttribute('aria-expanded')) m.anchor.setAttribute('aria-expanded', 'false');
    m.node.classList.add('is-leaving');
    setTimeout(() => m.node.remove(), reducedMotion() ? 0 : 110);
    if (m.anchor && m.anchor.isConnected && m.returnFocus) m.anchor.focus({ preventScroll: true });
  }

  // items: [{ label, value, checked, note, danger, disabled, icon }] or { type: 'sep' } or
  // { type: 'head', label }. onPick(item, button) returns true to keep the menu open.
  // extra: a node shown below the list (a form, a calendar). The check column only exists
  // when something in the menu can be checked.
  function menu(anchor, items, onPick, extra, onClose, opts) {
    closeMenu();
    hideTip();
    const host = anchor.closest('dialog') || document.body;
    const checks = items.some((it) => it && it.checked != null);
    const node = el('div', { class: 'menu' + (checks ? ' has-checks' : '') + (opts && opts.class ? ' ' + opts.class : ''), role: 'menu' });
    const buttons = [];
    for (const it of items) {
      if (!it) continue;
      if (it.type === 'sep') { node.append(el('div', { class: 'menu-sep', role: 'separator' })); continue; }
      if (it.type === 'head') { node.append(el('div', { class: 'menu-head', role: 'presentation', text: it.label })); continue; }
      const b = el('button', {
        type: 'button', class: 'menu-item' + (it.danger ? ' is-danger' : ''), disabled: !!it.disabled,
        role: it.checked != null ? 'menuitemcheckbox' : 'menuitem',
        'aria-checked': it.checked != null ? String(!!it.checked) : null
      },
      checks ? el('span', { class: 'menu-check', 'aria-hidden': 'true' }, it.checked ? icon('check') : null) : null,
      it.icon ? el('span', { class: 'menu-icon', 'aria-hidden': 'true' }, icon(it.icon)) : null,
      el('span', { class: 'menu-label', text: it.label }),
      it.note ? el('span', { class: 'menu-note', text: it.note }) : null);
      b.addEventListener('click', () => {
        const keep = onPick(it, b);
        if (keep && it.checked != null) {
          const on = b.getAttribute('aria-checked') === 'true';
          const c = b.querySelector('.menu-check');
          if (c) c.replaceChildren(on ? icon('check') : '');
        }
        if (!keep) closeMenu();
      });
      buttons.push(b);
      node.append(b);
    }
    if (extra) node.append(extra);
    host.append(node);
    if (anchor.hasAttribute && anchor.hasAttribute('aria-expanded')) anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect();
    const w = node.offsetWidth, h = node.offsetHeight;
    const align = opts && opts.align;
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.min(left, window.innerWidth - w - 8);
    let top = r.bottom + 4;
    const vb = visibleBottom();
    if (top + h > vb - 8) top = Math.max(8, r.top - h - 4);
    node.style.left = Math.max(8, left) + 'px';
    node.style.top = top + 'px';
    node.style.transformOrigin = (align === 'end' ? 'right ' : 'left ') + (top < r.top ? 'bottom' : 'top');
    const onDown = (e) => { if (!node.contains(e.target) && e.target !== anchor && !(anchor.contains && anchor.contains(e.target))) closeMenu(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); openMenu.returnFocus = true; closeMenu(); return; }
      const i = buttons.indexOf(document.activeElement);
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && buttons.length && !(document.activeElement && document.activeElement.matches('input, textarea'))) {
        e.preventDefault();
        const live = buttons.filter((b) => !b.disabled);
        const j = live.indexOf(document.activeElement);
        const d = e.key === 'ArrowDown' ? 1 : -1;
        const next = live[(j + d + live.length) % live.length] || live[0];
        if (next) next.focus();
        void i;
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', onDown, true));
    document.addEventListener('keydown', onKey, true);
    const opened = performance.now();
    const onScroll = (e) => { if (!node.contains(e.target) && performance.now() - opened > 400) closeMenu(); };
    window.addEventListener('scroll', onScroll, true);
    openMenu = {
      node, anchor, returnFocus: false, onClose: onClose || null,
      cleanup() {
        document.removeEventListener('pointerdown', onDown, true);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onScroll, true);
      }
    };
    const first = buttons.find((b) => b.getAttribute('aria-checked') === 'true' && !b.disabled) || buttons.find((b) => !b.disabled);
    if (first && !(opts && opts.noFocus)) first.focus({ preventScroll: true });
    return node;
  }

  /* ---------- Calendar: a month of days, like Notion's date picker ---------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  function calendar(o) {
    const today = isoOf(new Date());
    const chosen = o.value || '';
    const start = chosen ? new Date(chosen + 'T12:00:00') : new Date();
    let view = new Date(start.getFullYear(), start.getMonth(), 1);
    let focusIso = chosen || today;
    const title = el('span', { class: 'cal-title', 'aria-live': 'polite' });
    const grid = el('div', { class: 'cal-grid', role: 'grid' });
    const nav = (d) => { view = new Date(view.getFullYear(), view.getMonth() + d, 1); draw(); };
    const node = el('div', { class: 'cal' },
      el('div', { class: 'cal-head' }, title,
        el('div', { class: 'cal-nav' },
          el('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Previous month', onclick: () => nav(-1) }, icon('chevLeft')),
          el('button', { type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': 'Next month', onclick: () => nav(1) }, icon('chevRight')))),
      el('div', { class: 'cal-week', 'aria-hidden': 'true' }, ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => el('span', { text: w }))),
      grid,
      el('div', { class: 'cal-foot' },
        el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Today', onclick: () => o.onPick(today) }),
        chosen ? el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Clear', onclick: () => o.onPick('') }) : null));
    function draw() {
      title.textContent = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const first = new Date(view.getFullYear(), view.getMonth(), 1 - view.getDay());
      const days = [];
      for (let k = 0; k < 42; k++) {
        const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + k);
        const iso = isoOf(d);
        const cls = 'cal-day' + (d.getMonth() !== view.getMonth() ? ' is-out' : '') + (iso === today ? ' is-today' : '') + (iso === chosen ? ' is-chosen' : '');
        days.push(el('button', {
          type: 'button', class: cls, text: String(d.getDate()), tabindex: iso === focusIso ? '0' : '-1',
          'aria-label': d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
          'aria-pressed': iso === chosen ? 'true' : 'false', dataset: { iso }, onclick: () => o.onPick(iso)
        }));
      }
      grid.replaceChildren(...days);
    }
    grid.addEventListener('keydown', (e) => {
      const stepBy = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (!stepBy) return;
      e.preventDefault();
      e.stopPropagation();
      const cur = new Date((document.activeElement.dataset.iso || focusIso) + 'T12:00:00');
      cur.setDate(cur.getDate() + stepBy);
      focusIso = isoOf(cur);
      if (cur.getMonth() !== view.getMonth() || cur.getFullYear() !== view.getFullYear()) view = new Date(cur.getFullYear(), cur.getMonth(), 1);
      draw();
      node.focusDay();
    });
    node.focusDay = () => { const b = grid.querySelector('[tabindex="0"]'); if (b) b.focus({ preventScroll: true }); };
    draw();
    return node;
  }

  // Press feedback on pointer-down, for touch screens too (:active is late or missing on iOS).
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('button, .press');
    if (!b || b.disabled) return;
    b.classList.add('is-pressed');
    const up = () => { b.classList.remove('is-pressed'); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true); };
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  }, true);

  TDW.UI = {
    device, keys, ctrlKeys, visibleBottom, isNarrow, narrowQuery,
    el, icon, toast, hideToast, rehostToast, money, plural, costNote, relTime, reducedMotion,
    segmented, toggle, menu, closeMenu, calendar, spring, tip, hideTip, menuOpen: () => !!openMenu
  };
})();
