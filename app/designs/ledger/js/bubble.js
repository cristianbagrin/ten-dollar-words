/* The bar that floats over a selection: Ask AI, Alternatives, Note, then Bold, Italic, Link, and
   More (turn into, strikethrough, code, color, ghost, stash, AI alternatives).
   It shows once you let go of the mouse (or stop extending the selection with the keyboard),
   and steps aside while you type. Esc hides it. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Editor, UI, Marks } = TDW;
  const app = () => TDW.App;
  const IS_MAC = UI.device.apple;
  const k = (mac, pc) => (IS_MAC ? mac : pc);

  let bar = null;
  let pointerDown = false;
  let timer = 0;
  let dismissedAt = null; // the selection Esc hid it for

  const svg = (d, w) => '<svg viewBox="0 0 16 16" width="' + (w || 15) + '" height="' + (w || 15) + '" aria-hidden="true">' + d + '</svg>';
  const ICON = {
    note: svg('<path d="M3 3.5h10v7H7.5L4.5 13v-2.5H3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>'),
    link: svg('<path d="M6.8 9.2l2.4-2.4M7.6 4.9l.9-.9a2.4 2.4 0 013.4 3.4l-.9.9M8.4 11.1l-.9.9a2.4 2.4 0 01-3.4-3.4l.9-.9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
    more: svg('<g fill="currentColor"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></g>')
  };

  function button(cls, label, title, html, onClick) {
    const b = UI.el('button', { type: 'button', class: 'bub-btn ' + cls, 'aria-label': label, title });
    if (html) b.innerHTML = html; else b.textContent = label;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
    b.addEventListener('click', (e) => onClick(e, b));
    return b;
  }

  function build() {
    bar = UI.el('div', { class: 'bubble', role: 'toolbar', 'aria-label': 'Selection', hidden: true });
    const ai = button('bub-ai', 'Ask AI', 'Ask AI about this (' + k('⌃J', 'Ctrl+J') + ')', null, () => { hide(); TDW.Notes.compose({ ai: true }); });
    ai.replaceChildren(UI.icon('spark'), UI.el('span', { class: 'bub-label', text: 'Ask AI' }));
    const ab = button('bub-ab', 'Alternatives', 'Alternatives: other versions to try in place (' + k('⌃⇧A', 'Ctrl+Shift+A') + ')', null, () => { hide(); TDW.Alts && TDW.Alts.open(); });
    ab.replaceChildren(UI.icon('alts'), UI.el('span', { class: 'bub-label', text: 'Alternatives' }));
    const N = button('bub-note', 'Note', 'Add a note (' + k('⌃⇧M', 'Ctrl+Shift+M') + ')', null, () => { hide(); TDW.Notes.compose({ ai: false }); });
    N.replaceChildren(UI.icon('note'), UI.el('span', { class: 'bub-label', text: 'Note' }));
    const B = button('bub-b', 'Bold', 'Bold (' + k('⌘B', 'Ctrl+B') + ')', '<b>B</b>', () => { Editor.toggleStyle('bold'); later(); });
    const I = button('bub-i', 'Italic', 'Italic (' + k('⌘I', 'Ctrl+I') + ')', '<i>i</i>', () => { Editor.toggleStyle('italic'); later(); });
    const L = button('bub-l', 'Link', 'Link (' + k('⌘K', 'Ctrl+K') + ')', null, () => { hide(); Editor.link(); });
    L.replaceChildren(UI.icon('link'));
    const M = button('bub-more', 'More', 'Turn into, color, ghost, stash and more', null, (e, b) => moreMenu(b));
    M.replaceChildren(UI.icon('more'));
    const sep = () => UI.el('span', { class: 'bub-sep', 'aria-hidden': 'true' });
    bar.append(ai, ab, N, sep(), B, I, L, sep(), M);
    bar.addEventListener('pointerdown', (e) => e.preventDefault());
    document.body.append(bar);
  }

  function moreMenu(b) {
    const [a, z] = Editor.selLines();
    const cur = Editor.block(a).type;
    const s = Editor.getSelection();
    const items = [
      { label: 'Turn into…', value: 'turn', note: (TDW.Blocks.TYPES.find((x) => x.type === cur) || { label: 'Text' }).label },
      { label: 'Color…', value: 'color', note: k('⌃⇧H', 'Ctrl+Shift+H') },
      { label: 'Strikethrough', value: 'strike', note: k('⌘⇧S', 'Ctrl+Shift+S') },
      { label: 'Code', value: 'code' },
      { type: 'sep' },
      { label: 'AI alternatives', value: 'aialts', note: k('⌃⇧G', 'Ctrl+Shift+G') },
      { label: 'Ghost it', value: 'ghost', note: k('⌃/', 'Ctrl+/') },
      { label: 'Stash in Overflow', value: 'stash', note: k('⌃⇧X', 'Ctrl+Shift+X') }
    ];
    UI.menu(b, items, (it) => {
      if (it.value === 'turn') {
        setTimeout(() => UI.menu(b, TDW.Blocks.TYPES.map((t) => ({ label: t.label, note: t.hint, value: t.type, checked: t.type === cur })),
          (x) => { Editor.turnInto(a, z, x.value); later(); return false; }), 0);
      } else if (it.value === 'color') setTimeout(() => TDW.Notes.colorMenu(b, s.start, s.end), 0);
      else if (it.value === 'strike') { Editor.toggleStyle('strike'); later(); }
      else if (it.value === 'code') { Editor.toggleStyle('code'); later(); }
      else if (it.value === 'aialts') { hide(); TDW.Alts && TDW.Alts.aiForSelection(); }
      else if (it.value === 'ghost') { hide(); TDW.Menu.toggleGhost(); }
      else if (it.value === 'stash') { hide(); TDW.Menu.stash(); }
      return false;
    });
  }

  // After a format change the selection is redrawn; put the bar back over it.
  function later() { requestAnimationFrame(() => show(true)); }

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
    if (top < 8) top = (r2 ? r2.lineTop + r2.lh : r1.lineTop + r1.lh) + 8;
    const x = r1.lineTop === (r2 && r2.lineTop) ? (r1.left + r2.left) / 2 - w / 2 : r1.left;
    bar.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    bar.style.top = top + 'px';
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
