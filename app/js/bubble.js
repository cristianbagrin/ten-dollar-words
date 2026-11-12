/* The bar that floats over a selection: Ask AI, Alternatives, Add a note, Ghost it, Stash, and ⋯
   for formatting, color and Turn into. It shows once you let go of the mouse (or stop extending the selection with the keyboard),
   and steps aside while you type. Esc hides it. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Editor, UI } = TDW;
  const app = () => TDW.App;

  let bar = null;
  let pointerDown = false;
  let timer = 0;
  let dismissedAt = null; // the selection Esc hid it for

  // Five things you do to a passage, as icons; the name and its shortcut show when you rest on
  // one. Formatting is a level down, in ⋯ (and on its shortcuts).
  const MAIN = [
    ['bub-ai', 'spark', 'Ask AI', 'askAI', () => TDW.Notes.compose({ ai: true })],
    ['bub-ab', 'swap', 'Alternatives', 'alts', () => TDW.Alts && TDW.Alts.open()],
    ['bub-note', 'note', 'Add a note', 'note', () => TDW.Notes.compose({ ai: false })],
    ['bub-ghost', 'ghost', 'Ghost it', 'ghost', () => TDW.Menu.toggleGhost()],
    ['bub-stash', 'stash', 'Stash in Overflow', 'stash', () => TDW.Menu.stash()]
  ];

  function button(cls, iconName, label, onClick) {
    const b = UI.el('button', { type: 'button', class: 'bub-btn ' + cls, 'aria-label': label }, UI.icon(iconName));
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
    b.addEventListener('click', (e) => onClick(e, b));
    return b;
  }

  function label() {
    for (const [cls, , name, id] of MAIN) { const b = bar.querySelector('.' + cls); if (b) b.dataset.tip = TDW.Keys.tip(name, id); }
  }

  function build() {
    bar = UI.el('div', { class: 'bubble', role: 'toolbar', 'aria-label': 'Selection', hidden: true });
    for (const [cls, ic, name, , run] of MAIN) bar.append(button(cls, ic, name, () => { hide(); run(); }));
    const more = button('bub-more', 'more', 'More', (e, b) => moreMenu(b));
    more.dataset.tip = 'More';
    bar.append(UI.el('span', { class: 'bub-sep', 'aria-hidden': 'true' }), more);
    bar.addEventListener('pointerdown', (e) => e.preventDefault());
    document.body.append(bar);
    label();
    TDW.Keys.onChange(label);
  }

  function moreMenu(b) {
    const s = Editor.getSelection();
    const K = TDW.Keys;
    UI.menu(b, [
      { label: 'Bold', value: 'bold', keys: K.combo('bold') },
      { label: 'Italic', value: 'italic', keys: K.combo('italic') },
      { label: 'Underline', value: 'underline', keys: K.combo('underline') },
      { label: 'Strikethrough', value: 'strike', keys: K.combo('strike') },
      { label: 'Code', value: 'code', keys: K.combo('code') },
      { label: 'Link', value: 'link', keys: '⌘K' },
      { type: 'sep' },
      { label: 'Color', value: 'color', keys: K.combo('highlight') },
      { label: 'Turn into', value: 'turn' }
    ], (it) => {
      const v = it.value;
      if (v === 'color') setTimeout(() => TDW.Notes.colorMenu(b, s.start, s.end), 0);
      else if (v === 'turn') setTimeout(() => turnMenu(b), 0);
      else if (v === 'link') { hide(); Editor.link(); }
      else { Editor.toggleStyle(v); later(); }
      return false;
    });
  }

  // After a format change the selection is redrawn; put the bar back over it.
  function later() { requestAnimationFrame(() => show(true)); }

  function turnMenu(anchor) {
    const [a, b] = Editor.selLines();
    const cur = Editor.block(a).type;
    const items = TDW.Blocks.TYPES.map((t) => ({ label: t.label, note: t.hint, value: t.type, checked: t.type === cur }));
    UI.menu(anchor, items, (it) => { Editor.turnInto(a, b, it.value); later(); return false; });
  }

  function canShow() {
    if (!bar || pointerDown || app().state.loading) return false;
    if (document.activeElement !== Editor.rootEl()) return false;
    if (Editor.rootEl().contentEditable !== 'true') return false;
    if (Editor.isComposing() || (TDW.Blocks && TDW.Blocks.isSlashOpen())) return false;
    if (document.querySelector('dialog[open]') || (TDW.Alts && TDW.Alts.isOpen()) || (TDW.Notes && TDW.Notes.isCardOpen())) return false;
    const s = Editor.getSelection();
    if (s.end <= s.start) return false;
    if (!Editor.getText().slice(s.start, s.end).trim()) return false;
    if (dismissedAt && dismissedAt.start === s.start && dismissedAt.end === s.end) return false;
    return true;
  }

  function show(force) {
    if (!canShow()) { hide(); return; }
    const s = Editor.getSelection();
    const r1 = Editor.rectAt(s.start);
    const r2 = Editor.rectAt(s.end);
    if (!r1) { hide(); return; }
    const wasHidden = bar.hidden;
    bar.hidden = false;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    const top0 = Math.min(r1.lineTop, r2 ? r2.lineTop : r1.lineTop);
    const touch = UI.device.touch;
    // On a touch screen the phone's own menu sits above the selection, so this goes below.
    let top = touch ? (r2 ? r2.lineTop + r2.lh : r1.lineTop + r1.lh) + 12 : top0 - h - 8;
    const spineB = (document.querySelector('.spine') || { getBoundingClientRect: () => ({ bottom: 0 }) }).getBoundingClientRect().bottom;
    if (top < spineB + 8) top = (r2 ? r2.lineTop + r2.lh : r1.lineTop + r1.lh) + 8;
    const x = r1.lineTop === (r2 && r2.lineTop) ? (r1.left + r2.left) / 2 - w / 2 : r1.left;
    bar.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    bar.style.top = top + 'px';
    bar.classList.toggle('is-below', top > top0);
    if (wasHidden && !force) {
      bar.classList.remove('is-in');
      void bar.offsetWidth;
      bar.classList.add('is-in');
    }
  }

  function hide() { if (bar) bar.hidden = true; }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => show(), ms);
  }

  function wire() {
    build();
    const root = Editor.rootEl();
    root.addEventListener('pointerdown', () => { pointerDown = true; dismissedAt = null; hide(); });
    document.addEventListener('pointerup', () => { if (pointerDown) { pointerDown = false; schedule(UI.device.touch ? 350 : 10); } }, true);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !bar.hidden) { dismissedAt = Editor.getSelection(); hide(); return; }
      if (e.shiftKey && /^Arrow|^Home$|^End$/.test(e.key)) { hide(); schedule(500); return; }
      if (!e.metaKey && !e.ctrlKey) hide();
    });
    document.addEventListener('selectionchange', () => {
      if (pointerDown) return;
      const s = Editor.getSelection();
      if (s.end <= s.start) { hide(); return; }
      if (bar.hidden) schedule(UI.device.touch ? 350 : 120);
      else schedule(30);
    });
    root.addEventListener('blur', () => setTimeout(() => { if (!bar.contains(document.activeElement) && !UI.menuOpen()) hide(); }, 0));
    window.addEventListener('scroll', () => { if (!bar.hidden) show(true); }, { passive: true });
    window.addEventListener('resize', () => hide());
  }

  TDW.Bubble = {
    init() { wire(); },
    load() { hide(); },
    onMode() { hide(); },
    onText() { if (bar && !bar.hidden) requestAnimationFrame(() => show(true)); },
    hide, show
  };
})();
