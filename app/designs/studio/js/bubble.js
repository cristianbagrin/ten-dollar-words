/* The bar that floats over a selection: Ask AI, Alternatives, Note, Bold, Italic, Link, and
   More (turn into, strikethrough, code, color, ghost it, stash, AI alternatives). It shows once
   you let go of the mouse (or stop extending the selection with the keyboard), and steps aside
   while you type. Esc hides it. On a touch screen it sits under the selection, clear of the
   phone's own menu. */
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

  function button(cls, label, tipText, keysHint, content, onClick) {
    const b = UI.el('button', { type: 'button', class: 'bub-btn ' + cls });
    if (content) b.append(...content); else b.textContent = label;
    UI.tip(b, tipText || label, keysHint);
    b.setAttribute('aria-label', label);
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
    b.addEventListener('click', (e) => onClick(e, b));
    return b;
  }
  const glyph = (tag, t) => UI.el(tag, { class: 'bub-glyph', text: t, 'aria-hidden': 'true' });

  function build() {
    bar = UI.el('div', { class: 'bubble', role: 'toolbar', 'aria-label': 'The selection', hidden: true });
    const ai = button('bub-ai', 'Ask AI', 'Ask AI about this', k('⌃J', 'Ctrl+J'), [UI.icon('spark'), UI.el('span', { text: 'Ask AI' })], () => { hide(); TDW.Notes.compose({ ai: true }); });
    const ab = button('bub-ab', 'Alternatives', 'Other versions to try in place', k('⌃⇧A', 'Ctrl+Shift+A'), [UI.icon('alts'), UI.el('span', { text: 'Alternatives' })], () => { hide(); TDW.Alts && TDW.Alts.open(); });
    const N = button('bub-note', 'Note', 'Add a note', k('⌃⇧M', 'Ctrl+Shift+M'), [UI.icon('note')], () => { hide(); TDW.Notes.compose({ ai: false }); });
    const B = button('bub-b', 'Bold', 'Bold', k('⌘B', 'Ctrl+B'), [glyph('b', 'B')], () => { Editor.toggleStyle('bold'); later(); });
    const I = button('bub-i', 'Italic', 'Italic', k('⌘I', 'Ctrl+I'), [glyph('i', 'I')], () => { Editor.toggleStyle('italic'); later(); });
    const L = button('bub-l', 'Link', 'Link', k('⌘K', 'Ctrl+K'), [UI.icon('link')], () => { hide(); Editor.link(); });
    const M = button('bub-more', 'More', 'Turn into, color, ghost it, stash and more', null, [UI.icon('more')], (e, b) => moreMenu(b));
    const sep = () => UI.el('span', { class: 'bub-sep', 'aria-hidden': 'true' });
    bar.append(ai, ab, sep(), N, B, I, L, sep(), M);
    bar.addEventListener('pointerdown', (e) => e.preventDefault());
    document.body.append(bar);
  }

  function moreMenu(anchor) {
    const s = Editor.getSelection();
    const ghosted = Marks.ghostAt(Editor.getAnnotations(), s.start, s.end);
    UI.menu(anchor, [
      { label: 'Turn into', note: turnLabel(), value: 'turn' },
      { label: 'Color', note: k('⌃⇧H', 'Ctrl+Shift+H'), value: 'color' },
      { label: 'Strikethrough', note: k('⌘⇧S', 'Ctrl+Shift+S'), value: 'strike' },
      { label: 'Code', value: 'code' },
      { type: 'sep' },
      { label: ghosted ? 'Revive' : 'Ghost it', note: k('⌃/', 'Ctrl+/'), value: 'ghost' },
      { label: 'Stash in Overflow', note: k('⌃⇧X', 'Ctrl+Shift+X'), value: 'stash' },
      { label: 'Ask the AI for alternatives', note: k('⌃⇧G', 'Ctrl+Shift+G'), value: 'aialts' }
    ], (it) => {
      if (it.value === 'turn') setTimeout(() => turnMenu(anchor), 0);
      else if (it.value === 'color') setTimeout(() => { const x = Editor.getSelection(); TDW.Notes.colorMenu(anchor, x.start, x.end); }, 0);
      else if (it.value === 'strike') { Editor.toggleStyle('strike'); later(); }
      else if (it.value === 'code') { Editor.toggleStyle('code'); later(); }
      else if (it.value === 'ghost') { hide(); TDW.Menu && TDW.Menu.toggleGhost(); }
      else if (it.value === 'stash') { hide(); TDW.Menu && TDW.Menu.stash(); }
      else if (it.value === 'aialts') { hide(); TDW.Alts && TDW.Alts.aiForSelection(); }
      return false;
    }, null, null, { noFocus: false });
  }

  function turnLabel() {
    const [a, b] = Editor.selLines();
    const t = Editor.block(a).type;
    if (b > a && Editor.block(b).type !== t) return 'Mixed';
    return (TDW.Blocks.TYPES.find((x) => x.type === t) || { label: 'Text' }).label;
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
    // Under the selection by default: above it the bar would sit on the line before, or on the toolbar.
    // It goes above only when there is no room below (the sheet or the bottom of the screen).
    const below = (r2 ? r2.lineTop + r2.lh : r1.lineTop + r1.lh) + (touch ? 12 : 6);
    const cover = parseFloat(document.documentElement.style.getPropertyValue('--sheet-cover')) || 0;
    const limit = (window.visualViewport ? window.visualViewport.height : window.innerHeight) - cover - 8;
    let top = below;
    if (below + h > limit && !touch) {
      const above = top0 - h - 6;
      const tb = document.getElementById('toolbar');
      if (above > (tb ? tb.getBoundingClientRect().bottom : 0) + 4) top = above;
    }
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
    hide, show,
    reposition() { if (bar && !bar.hidden) show(true); }
  };
})();
