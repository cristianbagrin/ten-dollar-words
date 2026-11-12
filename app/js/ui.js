/* Shared helpers: what the app runs on, elements, icons, toasts, money and time, the spring,
   menus, switches, the calendar, and how dialogs and sheets come and go. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};

  /* ---------- What the app runs on ----------
     A phone gets phone words and controls, in the browser or from the home screen. Apple
     keyboards say ⌘; everything else says Ctrl. */
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

  // The layout without a margin column: phones, and windows too narrow for page plus margin.
  const narrowQuery = window.matchMedia('(max-width: 1079px)');
  const isNarrow = () => narrowQuery.matches;

  // A shortcut written the Mac way ("⌘⇧S"), the way this keyboard says it ("Ctrl+Shift+S").
  const keys = (mac) => (device.apple ? mac
    : mac.replace(/⌘/g, 'Ctrl+').replace(/⌥/g, 'Alt+').replace(/⇧/g, 'Shift+').replace(/⌃/g, 'Ctrl+').replace(/↩/g, 'Enter'));

  // The on-screen keyboard covers the bottom of the page without resizing it: --kb is how much.
  if (device.touch && window.visualViewport) {
    const vv = window.visualViewport;
    const fit = () => {
      const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty('--kb', covered + 'px');
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }
  const visibleBottom = () => (device.touch && window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight);

  /* ---------- Icons: 16px, 1.5px pencil strokes ---------- */
  const svg = (inner) => '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const EYE = '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="1.8"/>';
  TDW.icons = {
    close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    check: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
    plus: svg('<path d="M8 3.5v9M3.5 8h9"/>'),
    more: svg('<circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/>'),
    chevDown: svg('<path d="M4.5 6.5l3.5 3.5 3.5-3.5"/>'),
    chevUp: svg('<path d="M4.5 9.5L8 6l3.5 3.5"/>'),
    chevLeft: svg('<path d="M10 4l-4 4 4 4"/>'),
    chevRight: svg('<path d="M6 4l4 4-4 4"/>'),
    search: svg('<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>'),
    pencil: svg('<path d="M3 13l.8-3.2 7.4-7.4 2.4 2.4-7.4 7.4z"/><path d="M9.6 4l2.4 2.4"/>'),
    note: svg('<path d="M2.5 3.5h11v7.5H7l-3.5 2.5V11h-1z"/>'),
    tray: svg('<path d="M2.5 9.5L4 3.5h8l1.5 6v3.5h-11z"/><path d="M2.5 9.5H6a2 2 0 004 0h3.5"/>'),
    drafts: svg('<rect x="3.5" y="2.5" width="9" height="11" rx="1.5"/><path d="M6 6h4M6 8.5h4M6 11h2.5"/>'),
    newDoc: svg('<path d="M9 2.5H5a1.5 1.5 0 00-1.5 1.5v8A1.5 1.5 0 005 13.5h6a1.5 1.5 0 001.5-1.5V6"/><path d="M11 1.5v4M9 3.5h4"/>'),
    measure: svg('<path d="M2.5 4h11M2.5 7h11M2.5 10h7.5M2.5 13h9.5"/>'),
    backspace: svg('<path d="M5.5 3.5h8v9h-8L2 8z"/><path d="M8 6.5l3 3M11 6.5l-3 3"/>'),
    flask: svg('<path d="M6 2.5h4M6.5 2.5v4L3.2 12.4a1 1 0 00.9 1.6h7.8a1 1 0 00.9-1.6L9.5 6.5v-4"/><path d="M4.6 10h6.8"/>'),
    scissors: svg('<circle cx="4.5" cy="12" r="1.8"/><circle cx="11.5" cy="12" r="1.8"/><path d="M5.6 10.6L11 2.5M10.4 10.6L5 2.5"/>'),
    dice: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><circle cx="5.6" cy="5.6" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="10.4" cy="10.4" r=".8" fill="currentColor"/>'),
    target: svg('<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.6"/><circle cx="8" cy="8" r=".6" fill="currentColor"/>'),
    swap: svg('<path d="M3.5 5.5h9l-2.5-2.5M12.5 10.5h-9l2.5 2.5"/>'),
    spark: svg('<path d="M8 2l1.2 3.8L13 7l-3.8 1.2L8 12l-1.2-3.8L3 7l3.8-1.2z" fill="currentColor" stroke-width="1"/>'),
    ghost: svg('<path d="M4 13.5V7.2a4 4 0 018 0v6.3l-1.3-1-1.4 1-1.3-1-1.3 1-1.4-1z"/><path d="M6.6 7.2h.01M9.4 7.2h.01" stroke-width="2"/>'),
    stash: svg('<path d="M8 2.5v6.5M5.2 6.3L8 9l2.8-2.7"/><path d="M2.5 9.5v3.5a.5.5 0 00.5.5h10a.5.5 0 00.5-.5V9.5"/>'),
    download: svg('<path d="M8 2.5v8M4.5 7.2L8 10.5l3.5-3.3M3 13.5h10"/>'),
    folder: svg('<path d="M2 4.5V12.5h12V6H8L6.5 4.5z"/>'),
    sliders: svg('<path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7"/><circle cx="10.5" cy="4.5" r="1.6"/><circle cx="5.5" cy="11.5" r="1.6"/>'),
    keyboard: svg('<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4.5 9.5h7"/>'),
    expand: svg('<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>'),
    shrink: svg('<path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5"/>'),
    contrast: svg('<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor" stroke="none"/>'),
    send: svg('<path d="M13.5 2.5L7 9M13.5 2.5l-4 11-2.5-4.5-4.5-2.5z"/>'),
    at: svg('<circle cx="8" cy="8" r="2.6"/><path d="M10.6 5.6v3.2a1.6 1.6 0 003.2 0V8a5.8 5.8 0 10-2.3 4.6"/>'),
    linkedin: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.4 7.2v3.6M5.4 5.2v.01M7.8 10.8V7.2M7.8 8.6c0-1.9 2.9-1.9 2.9 0v2.2"/>'),
    copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2"/>'),
    unlink: svg('<path d="M7.6 4.9l.9-.9a2.4 2.4 0 013.4 3.4l-.9.9M8.4 11.1l-.9.9a2.4 2.4 0 01-3.4-3.4l.9-.9M2.5 2.5l11 11"/>'),
    link: svg('<path d="M6.8 9.2l2.4-2.4M7.6 4.9l.9-.9a2.4 2.4 0 013.4 3.4l-.9.9M8.4 11.1l-.9.9a2.4 2.4 0 01-3.4-3.4l.9-.9"/>'),
    trash: svg('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2c.05.7.6 1.3 1.3 1.3h3.2c.7 0 1.25-.6 1.3-1.3l.6-8.2"/>'),
    eye: svg(EYE),
    eyeOff: svg(EYE + '<path d="M2.5 13.5l11-11"/>'),
    undo: svg('<path d="M5.5 4L2.5 7l3 3"/><path d="M2.5 7h7a3.5 3.5 0 010 7H7"/>'),
    external: svg('<path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5"/><path d="M12 9.5v4H2.5V4h4"/>'),
    user: svg('<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5a5 5 0 0110 0"/>'),
    sound: svg('<path d="M3 6h2.5L9 3v10L5.5 10H3z"/><path d="M11.5 5.5a3.5 3.5 0 010 5"/>'),
    dollar: svg('<path d="M8 2v12M11 4.5H6.8a2.2 2.2 0 000 4.5h2.4a2.2 2.2 0 010 4.5H5"/>'),
    sync: svg('<path d="M13 6.5A5 5 0 004 4.5L2.5 6M3 9.5a5 5 0 009 2l1.5-1.5"/><path d="M2.5 3v3h3M13.5 13v-3h-3"/>'),
    type: svg('<path d="M3 4.5V3h10v1.5M8 3v10M6 13h4"/>'),
    color: svg('<path d="M4.5 11.5L8 3l3.5 8.5M5.6 8.8h4.8"/><path d="M3 14h10" stroke-width="2"/>'),
    strike: svg('<path d="M3 8h10M10.8 5a2.8 2.3 0 00-2.8-1.5c-1.7 0-2.8.9-2.8 2M5 11a2.8 2.3 0 002.9 1.5c1.8 0 3-.9 3-2.2"/>'),
    code: svg('<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>'),
    turn: svg('<path d="M3 3.5h10M3 8h6M3 12.5h10"/><path d="M11 6l2 2-2 2"/>'),
    sidebar: svg('<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/>'),
    arrowDown: svg('<path d="M8 3v10M4.5 9.5L8 13l3.5-3.5"/>'),
    marker: svg('<path d="M10 2.5l3.5 3.5-5.8 5.8-3.9.4.4-3.9z"/><path d="M8.2 4.3l3.5 3.5M2.5 14h11"/>'),
    x: '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M9.3 6.9L14 1.5h-1.1L8.8 6.2 5.5 1.5H1.7l4.9 7.1-4.9 5.9h1.1l4.3-5 3.4 5h3.8L9.3 6.9zm-1.5 1.8l-.5-.7-4-5.6h1.7l3.2 4.5.5.7 4.1 5.9h-1.7L7.8 8.7z"/></svg>'
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

  // Key caps for a shortcut written the Mac way: "⌘E" → <kbd>⌘</kbd><kbd>E</kbd>, or Ctrl+E.
  function kbd(mac) {
    const k = keys(mac);
    // Each modifier is a cap of its own; the key is one cap, however long its name (F12, Space, esc).
    const parts = device.apple ? (k.replace(/\s+/g, '').match(/[⌘⌃⌥⇧]|[^⌘⌃⌥⇧]+/g) || []) : k.split('+').filter(Boolean);
    return el('span', { class: 'keys', 'aria-label': k }, parts.map((p) => el('kbd', { text: p })));
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- The spring: critically damped unless the gesture carried momentum ----------
     response: seconds to (nearly) arrive; damping 1 = no overshoot. Starts from the value it is
     given and the velocity it inherits, so a grabbed sheet never jumps. */
  function spring(o) {
    const response = o.response || 0.32;
    const damping = o.damping == null ? 1 : o.damping;
    const k = Math.pow(2 * Math.PI / response, 2);
    const c = 4 * Math.PI * damping / response;
    let x = o.from, v = o.velocity || 0, last = 0, raf = 0, done = false;
    const to = o.to;
    if (reducedMotion()) { o.onUpdate(to); if (o.onDone) o.onDone(); return { stop() {}, get value() { return to; } }; }
    const step = (now) => {
      if (done) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const n = Math.max(1, Math.ceil(dt / 0.004));
      const h = dt / n;
      for (let i = 0; i < n; i++) { const a = -k * (x - to) - c * v; v += a * h; x += v * h; }
      if (Math.abs(v) < 2 && Math.abs(x - to) < 0.4) { done = true; o.onUpdate(to); if (o.onDone) o.onDone(); return; }
      o.onUpdate(x);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return { stop() { done = true; cancelAnimationFrame(raf); }, get value() { return x; }, get velocity() { return v; } };
  }
  const project = (v) => (v / 1000) * 0.998 / (1 - 0.998); // where a flick at v px/s comes to rest
  const rubber = (over, dim) => (over * dim * 0.55) / (dim + 0.55 * Math.abs(over));

  /* ---------- Toast: confirmations only ---------- */
  const topDialog = () => {
    const open = [...document.querySelectorAll('dialog[open]')].filter((d) => !d.classList.contains('is-leaving'));
    return open.length ? open[open.length - 1] : null;
  };
  function rehostToast() {
    const t = document.getElementById('toast');
    if (!t) return;
    const top = topDialog();
    const host = (!t.hidden && top && top.matches(':modal')) ? top : document.body;
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

  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const plural = (n, one, many) => (n === 1 ? one : many);
  function costNote(savedWords) {
    if (savedWords > 0) return 'saves ' + money(savedWords * 10);
    if (savedWords < 0) return 'costs ' + money(-savedWords * 10) + ' more';
    return 'same cost';
  }
  function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60e3) return 'just now';
    if (diff < 3600e3) return Math.floor(diff / 60e3) + ' min ago';
    if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' h ago';
    if (diff < 2 * 86400e3) return 'yesterday';
    const d = new Date(ts);
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  }

  /* ---------- Segmented control: the thumb slides on the spring ---------- */
  function segmented(o) {
    const wrap = el('div', { class: 'seg' + (o.class ? ' ' + o.class : ''), role: 'radiogroup', 'aria-label': o.label });
    const thumb = el('span', { class: 'seg-thumb', 'aria-hidden': 'true' });
    let current = o.value;
    let at = null, anim = null;
    const btns = o.options.map((opt) => {
      const b = el('button', {
        type: 'button', role: 'radio', class: 'seg-opt', title: opt.title || null,
        dataset: { value: opt.value }, 'aria-checked': String(opt.value === current), tabindex: opt.value === current ? '0' : '-1'
      }, opt.label);
      b.addEventListener('click', () => pick(opt.value, true));
      return b;
    });
    wrap.append(thumb, ...btns);
    function pick(v, user) {
      if (v === current) return;
      set(v, true);
      if (user && o.onChange) o.onChange(v);
    }
    function draw(x, w) { thumb.style.transform = 'translateX(' + x + 'px)'; thumb.style.width = w + 'px'; }
    function place(animate) {
      const b = btns.find((x) => x.dataset.value === current);
      if (!b || !b.offsetWidth) { thumb.style.opacity = b ? '' : '0'; return; }
      const to = { x: b.offsetLeft, w: b.offsetWidth };
      thumb.style.opacity = '';
      if (anim) anim.stop();
      if (animate && at && at.x !== to.x) {
        const from = at;
        anim = spring({ from: 0, to: 1, response: 0.3, onUpdate: (k) => draw(from.x + (to.x - from.x) * k, from.w + (to.w - from.w) * k) });
      } else draw(to.x, to.w);
      at = to;
    }
    function set(v, animate) {
      current = v;
      for (const b of btns) {
        const on = b.dataset.value === v;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      }
      place(animate);
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
    if (window.ResizeObserver) new ResizeObserver(() => place(false)).observe(wrap);
    requestAnimationFrame(() => place(false));
    wrap.set = set;
    wrap.get = () => current;
    return wrap;
  }

  /* ---------- Switch ---------- */
  function toggle(o) {
    const b = el('button', {
      type: 'button', role: 'switch', class: 'switch' + (o.class ? ' ' + o.class : ''),
      'aria-checked': String(!!o.checked), 'aria-label': o.label || null, id: o.id || null, title: o.title || null
    }, el('span', { class: 'switch-knob', 'aria-hidden': 'true' }));
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(on));
      if (o.onChange) o.onChange(on);
    });
    b.set = (on) => b.setAttribute('aria-checked', String(!!on));
    return b;
  }

  /* ---------- Menu: a small list that grows from the button that opened it ----------
     items: [{ label, value, checked, note, keys, icon, danger }], { type: 'sep' } or
     { type: 'head', label }. A check shows only beside the chosen item; there is no empty
     column. onPick(item, button) returns true to keep the menu open (multi-select). */
  let openMenu = null;
  function closeMenu() {
    if (!openMenu) return;
    const m = openMenu;
    openMenu = null;
    m.cleanup();
    if (m.onClose) m.onClose();
    m.node.classList.add('is-leaving');
    setTimeout(() => m.node.remove(), reducedMotion() ? 0 : 100);
    if (m.anchor && m.anchor.isConnected && m.returnFocus) m.anchor.focus({ preventScroll: true });
  }

  function menuRow(it) {
    const b = el('button', {
      type: 'button', class: 'menu-item' + (it.danger ? ' danger' : '') + (it.icon ? ' has-icon' : ''),
      role: it.checked != null ? 'menuitemcheckbox' : 'menuitem',
      'aria-checked': it.checked != null ? String(!!it.checked) : null
    },
    it.icon ? el('span', { class: 'menu-icon' }, icon(it.icon)) : null,
    el('span', { class: 'menu-label', text: it.label }),
    it.note ? el('span', { class: 'menu-note', text: it.note }) : null,
    it.keys ? kbd(it.keys) : null,
    it.checked != null ? el('span', { class: 'menu-check' }, icon('check')) : null);
    return b;
  }

  function placeNear(node, r, align) {
    const w = node.offsetWidth, h = node.offsetHeight;
    const vh = visibleBottom();
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    let below = true;
    if (top + h > vh - 8 && r.top - h - 6 > 8) { top = r.top - h - 6; below = false; }
    node.style.left = left + 'px';
    node.style.top = Math.max(8, top) + 'px';
    const ox = Math.max(0, Math.min(w, (r.left + r.right) / 2 - left));
    node.style.transformOrigin = ox + 'px ' + (below ? '0' : h + 'px');
  }

  function menu(anchor, items, onPick, extra, onClose, opts) {
    closeMenu();
    const host = (anchor.closest && anchor.closest('dialog')) || document.body;
    const node = el('div', { class: 'menu', role: 'menu' });
    const buttons = [];
    for (const it of items) {
      if (!it) continue;
      if (it.type === 'sep') { node.append(el('div', { class: 'menu-sep', role: 'separator' })); continue; }
      if (it.type === 'head') { node.append(el('div', { class: 'menu-head', role: 'presentation', text: it.label })); continue; }
      const b = menuRow(it);
      b.addEventListener('click', () => { if (!onPick(it, b)) closeMenu(); });
      buttons.push(b);
      node.append(b);
    }
    if (extra) node.append(extra);
    host.append(node);
    placeNear(node, anchor.getBoundingClientRect(), opts && opts.align);
    const onDown = (e) => { if (!node.contains(e.target) && e.target !== anchor && !(anchor.contains && anchor.contains(e.target))) closeMenu(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); openMenu.returnFocus = true; closeMenu(); return; }
      const i = buttons.indexOf(document.activeElement);
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && buttons.length) {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        buttons[(i + d + buttons.length) % buttons.length].focus();
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
    const first = buttons.find((b) => b.getAttribute('aria-checked') === 'true') || buttons[0];
    if (first) first.focus({ preventScroll: true });
    return node;
  }

  /* ---------- Calendar: a month of days ---------- */
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
          el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Previous month', onclick: () => nav(-1) }, icon('chevLeft')),
          el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Next month', onclick: () => nav(1) }, icon('chevRight')))),
      el('div', { class: 'cal-week', 'aria-hidden': 'true' }, ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => el('span', { text: w }))),
      grid,
      el('div', { class: 'cal-foot' },
        el('button', { type: 'button', class: 'btn-quiet btn-sm', text: 'Today', onclick: () => o.onPick(today) }),
        chosen ? el('button', { type: 'button', class: 'btn-quiet btn-sm', text: 'Clear', onclick: () => o.onPick('') }) : null));
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
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (!step) return;
      e.preventDefault();
      const cur = new Date((document.activeElement.dataset.iso || focusIso) + 'T12:00:00');
      cur.setDate(cur.getDate() + step);
      focusIso = isoOf(cur);
      if (cur.getMonth() !== view.getMonth() || cur.getFullYear() !== view.getFullYear()) view = new Date(cur.getFullYear(), cur.getMonth(), 1);
      draw();
      node.focusDay();
    });
    node.focusDay = () => { const b = grid.querySelector('[tabindex="0"]'); if (b) b.focus({ preventScroll: true }); };
    draw();
    return node;
  }

  /* ---------- Dialogs and sheets ----------
     present(dlg, { anchor, align, modal }): on a computer a dialog grows from the thing that
     opened it (or the middle of the window) and fades back the same way. In the narrow layout
     it is a bottom sheet: it rises on the spring, follows a drag on its grabber 1:1, rubber-bands
     past the top, and a flick down sends it away with the finger's speed. */
  const asSheet = (dlg) => isNarrow() && !dlg.classList.contains('no-sheet');

  function wireDialog(dlg, onDismiss) {
    if (dlg._wired) return;
    dlg._wired = true;
    dlg._onDismiss = onDismiss || null;
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dismiss(dlg);
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (!openMenu) dismiss(dlg); });
    dlg.addEventListener('close', () => { closeMenu(); rehostToast(); });
    // Sheets: drag the grabber (or the sheet's head) down to put it away.
    let drag = null;
    dlg.addEventListener('pointerdown', (e) => {
      if (!asSheet(dlg) || e.button !== 0) return;
      const handle = e.target.closest && e.target.closest('.grabber, .sheet-drag');
      if (!handle || (e.target.closest('button, input, textarea, select, a') && !e.target.closest('.grabber'))) return;
      if (dlg._anim) dlg._anim.stop();
      const y0 = dlg._y || 0;
      drag = { id: e.pointerId, startY: e.clientY, y0, y: y0, moved: false, hist: [{ y: e.clientY, t: e.timeStamp }], h: dlg.offsetHeight };
      handle.setPointerCapture(e.pointerId);
    });
    dlg.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.abs(dy) < 6) return;
      drag.moved = true;
      let y = drag.y0 + dy;
      if (y < 0) y = rubber(y, drag.h);
      drag.y = y;
      setY(dlg, y);
      drag.hist.push({ y: e.clientY, t: e.timeStamp });
      if (drag.hist.length > 5) drag.hist.shift();
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (!d.moved) return;
      const a = d.hist[0], b = d.hist[d.hist.length - 1];
      const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
      if (d.y + project(v) > d.h * 0.45) dismiss(dlg, v);
      else dlg._anim = spring({ from: d.y, to: 0, velocity: v, damping: v < -300 ? 0.8 : 1, onUpdate: (y) => setY(dlg, y) });
    };
    dlg.addEventListener('pointerup', end);
    dlg.addEventListener('pointercancel', end);
  }

  function setY(dlg, y) {
    dlg._y = y;
    dlg.style.transform = y ? 'translateY(' + y + 'px)' : '';
    const k = Math.max(0, Math.min(1, 1 - y / (dlg.offsetHeight || 1)));
    dlg.style.setProperty('--sheet-k', k.toFixed(3));
  }

  function present(dlg, o) {
    const opts = o || {};
    wireDialog(dlg, opts.onDismiss);
    if (dlg._anim) dlg._anim.stop();
    clearTimeout(dlg._leaveTimer);
    dlg.classList.remove('is-leaving');
    const sheet = asSheet(dlg);
    dlg.classList.toggle('as-sheet', sheet);
    if (!dlg.open) { if (opts.modal === false) dlg.show(); else dlg.showModal(); }
    if (sheet) {
      dlg.style.left = dlg.style.top = '';
      const h = dlg.offsetHeight;
      setY(dlg, h);
      dlg._anim = spring({ from: h, to: 0, response: 0.36, onUpdate: (y) => setY(dlg, y) });
      return;
    }
    dlg.style.transform = '';
    if (opts.anchor) {
      dlg.classList.add('is-anchored');
      const r = opts.anchor.getBoundingClientRect ? opts.anchor.getBoundingClientRect() : opts.anchor;
      placeNear(dlg, r, opts.align);
    } else {
      dlg.classList.remove('is-anchored');
      dlg.style.left = dlg.style.top = '';
    }
    dlg.classList.add('is-entering');
    void dlg.offsetWidth;
    requestAnimationFrame(() => dlg.classList.remove('is-entering'));
  }

  // Put a dialog away the way it came. velocity: a flick's speed, for sheets.
  function dismiss(dlg, velocity) {
    if (!dlg || !dlg.open || dlg.classList.contains('is-leaving')) return;
    closeMenu();
    dlg.classList.add('is-leaving');
    const finish = () => {
      dlg.classList.remove('is-leaving');
      if (dlg.open) dlg.close();
      dlg.style.transform = '';
      dlg._y = 0;
      if (dlg._onDismiss) dlg._onDismiss();
    };
    if (reducedMotion()) { finish(); return; }
    if (dlg.classList.contains('as-sheet')) {
      if (dlg._anim) dlg._anim.stop();
      dlg._anim = spring({ from: dlg._y || 0, to: dlg.offsetHeight + 24, velocity: velocity || 0, response: 0.3, onUpdate: (y) => setY(dlg, y), onDone: finish });
      return;
    }
    dlg._leaveTimer = setTimeout(finish, 110);
  }

  TDW.UI = {
    device, keys, kbd, visibleBottom, isNarrow, narrowQuery,
    el, icon, toast, hideToast, rehostToast, money, plural, costNote, relTime, reducedMotion,
    spring, project, rubber, segmented, toggle, menu, closeMenu, calendar, placeNear,
    present, dismiss, menuOpen: () => !!openMenu
  };
})();
