/* Blocks, the way Notion does them. Every line of the draft is a block:
   - Hover a block and a "+" and a grip (⋮⋮) appear in the left margin. "+" adds a block under
     it and opens the "/" menu (Alt+click adds one above). Drag the grip to move the block
     (or the selected blocks); click it for the block menu: Turn into, Color, Ask AI,
     Alternatives, Note, Duplicate, Move up/down, Delete.
   - Type "/" at the start of a block or after a space for the command menu. Keep typing to
     filter ("/h2", "/todo", "/red"), ↑/↓ to choose, Return or Tab to run, Esc to close.
   - ⌘⇧↑/↓ moves the block, ⌘D duplicates it (in editor.js). */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Editor, UI, Marks } = TDW;
  const app = () => TDW.App;
  const IS_MAC = UI.device.apple;
  const mod = (k) => (IS_MAC ? '⌘' + k : 'Ctrl+' + k);

  // What a block can be turned into. key: what you type after "/" (with the label and aliases).
  const TYPES = [
    { type: 'p', label: 'Text', icon: 'Aa', hint: 'Plain text', alias: 'text paragraph plain body' },
    { type: 'h1', label: 'Heading 1', icon: 'H1', hint: '#', alias: 'h1 heading title big' },
    { type: 'h2', label: 'Heading 2', icon: 'H2', hint: '##', alias: 'h2 heading subtitle medium' },
    { type: 'h3', label: 'Heading 3', icon: 'H3', hint: '###', alias: 'h3 heading small' },
    { type: 'li', label: 'Bulleted list', icon: '•', hint: '-', alias: 'bullet ul unordered list dash' },
    { type: 'ol', label: 'Numbered list', icon: '1.', hint: '1.', alias: 'numbered ol ordered list number' },
    { type: 'todo', label: 'To-do list', icon: '☐', hint: '[]', alias: 'todo to-do checkbox task check' },
    { type: 'quote', label: 'Quote', icon: '❝', hint: '>', alias: 'quote blockquote citation' },
    { type: 'hr', label: 'Divider', icon: '—', hint: '---', alias: 'divider hr line rule separator' }
  ];
  const typeOf = (t) => TYPES.find((x) => x.type === t) || TYPES[0];

  let handle = null, plus = null, grip = null, dropLine = null;
  let hoverLine = -1;
  let drag = null; // { a, b, startY, active }

  const root = () => Editor.rootEl();
  const editable = () => !app().state.loading && root().contentEditable === 'true';

  /* ---------- The handle in the margin ---------- */

  function build() {
    handle = UI.el('div', { class: 'blk-handle', hidden: true, 'aria-hidden': 'false' });
    plus = UI.el('button', { type: 'button', class: 'blk-btn blk-plus', 'aria-label': 'Add a block below', title: 'Click to add below\n' + (IS_MAC ? '⌥' : 'Alt') + '-click to add above' });
    plus.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    grip = UI.el('button', { type: 'button', class: 'blk-btn blk-grip', 'aria-label': 'Drag to move, click for the block menu', title: 'Drag to move\nClick to open the menu' });
    grip.innerHTML = '<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3.5" r="1.25"/><circle cx="7" cy="3.5" r="1.25"/><circle cx="3" cy="8" r="1.25"/><circle cx="7" cy="8" r="1.25"/><circle cx="3" cy="12.5" r="1.25"/><circle cx="7" cy="12.5" r="1.25"/></g></svg>';
    handle.append(plus, grip);
    dropLine = UI.el('div', { class: 'blk-drop', hidden: true, 'aria-hidden': 'true' });
    document.body.append(handle, dropLine);

    for (const b of [plus, grip]) b.addEventListener('mousedown', (e) => e.preventDefault());
    plus.addEventListener('click', (e) => {
      const i = hoverLine;
      if (i < 0 || !editable()) return;
      if (e.altKey) addAbove(i); else addBelow(i);
    });
    grip.addEventListener('pointerdown', onGripDown);
  }

  function lineAtY(y) {
    const kids = root().children;
    if (!kids.length) return -1;
    let best = -1;
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (y < r.top - 6) break;
      best = i;
      if (y <= r.bottom + 6) return i;
    }
    return best;
  }

  function placeHandle(i) {
    const b = i >= 0 ? Editor.block(i) : null;
    if (!b || !b.el || drag) { if (!drag) handle.hidden = true; return; }
    hoverLine = i;
    const r = b.el.getBoundingClientRect();
    const cs = getComputedStyle(b.el);
    const lh = parseFloat(cs.lineHeight) || 24;
    const sheet = document.getElementById('sheet').getBoundingClientRect();
    handle.hidden = false;
    handle.style.left = (sheet.left - 66) + 'px';
    handle.style.top = (r.top + Math.min(lh, r.height) / 2 - 12) + 'px';
    handle.classList.toggle('is-sep', b.type === 'hr');
  }

  function onMove(e) {
    if (drag || !editable() || UI.device.touch) return;
    if (document.documentElement.classList.contains('alts-open')) { handle.hidden = true; return; }
    const sheet = document.getElementById('sheet').getBoundingClientRect();
    const inX = e.clientX > sheet.left - 70 && e.clientX < sheet.right + 30;
    if (!inX || handle.contains(e.target) && !handle.hidden) { if (!inX) hide(); return; }
    const kids = root().children;
    if (!kids.length) return hide();
    const first = kids[0].getBoundingClientRect(), last = kids[kids.length - 1].getBoundingClientRect();
    if (e.clientY < first.top - 10 || e.clientY > last.bottom + 10) return hide();
    placeHandle(lineAtY(e.clientY));
  }
  function hide() { if (handle && !drag) { handle.hidden = true; hoverLine = -1; } }

  /* ---------- Adding ---------- */

  function addBelow(i) {
    const b = Editor.block(i);
    // An empty text block is used as it is, like Notion.
    if (b && b.type === 'p' && !b.vis) { Editor.setCaret(b.start); }
    else Editor.insertBlockAfter(i, 'p');
    openSlash(true);
  }
  function addAbove(i) {
    if (i === 0) {
      Editor.setCaret(0);
      Editor.insertMd('\n');
      Editor.setCaret(0);
    } else {
      Editor.insertBlockAfter(i - 1, 'p');
    }
    openSlash(true);
  }

  /* ---------- Dragging ---------- */

  function onGripDown(e) {
    if (e.button !== 0 || !editable() || hoverLine < 0) return;
    e.preventDefault();
    let [a, b] = Editor.selLines();
    const s = Editor.getSelection();
    if (s.end <= s.start || hoverLine < a || hoverLine > b) { a = b = hoverLine; }
    drag = { a, b, startY: e.clientY, active: false, to: -1 };
    grip.setPointerCapture(e.pointerId);
    grip.addEventListener('pointermove', onDragMove);
    grip.addEventListener('pointerup', onDragEnd, { once: true });
    grip.addEventListener('pointercancel', onDragCancel, { once: true });
  }

  function onDragMove(e) {
    if (!drag) return;
    if (!drag.active && Math.abs(e.clientY - drag.startY) < 4) return;
    if (!drag.active) {
      drag.active = true;
      TDW.Bubble && TDW.Bubble.hide();
      document.documentElement.classList.add('is-dragging-block');
      for (let i = drag.a; i <= drag.b; i++) { const el = Editor.block(i).el; if (el) el.classList.add('is-dragged'); }
      UI.closeMenu();
    }
    const kids = root().children;
    // The gap nearest the pointer: before line g.
    let g = kids.length;
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { g = i; break; }
    }
    drag.gap = g;
    const valid = g < drag.a || g > drag.b + 1;
    const sheet = document.getElementById('sheet').getBoundingClientRect();
    let y;
    if (g < kids.length) y = kids[g].getBoundingClientRect().top - 4;
    else y = kids[kids.length - 1].getBoundingClientRect().bottom + 2;
    dropLine.hidden = !valid;
    dropLine.style.left = sheet.left + 'px';
    dropLine.style.width = sheet.width + 'px';
    dropLine.style.top = y + 'px';
    // Scroll near the edges.
    const vh = window.innerHeight;
    if (e.clientY < 60) window.scrollBy(0, -12);
    else if (e.clientY > vh - 60) window.scrollBy(0, 12);
  }

  function endDrag() {
    grip.removeEventListener('pointermove', onDragMove);
    document.documentElement.classList.remove('is-dragging-block');
    for (const el of root().querySelectorAll('.is-dragged')) el.classList.remove('is-dragged');
    dropLine.hidden = true;
  }

  function onDragEnd() {
    const d = drag;
    endDrag();
    drag = null;
    if (!d) return;
    if (!d.active) { openBlockMenu(d.a, d.b); return; }
    const g = d.gap;
    if (g == null || (g >= d.a && g <= d.b + 1)) return;
    const to = g < d.a ? g : g - (d.b - d.a + 1);
    Editor.moveBlocks(d.a, d.b, to);
    TDW.Sound && TDW.Sound.play && TDW.Sound.play('key');
  }
  function onDragCancel() { endDrag(); drag = null; }

  /* ---------- The block menu ---------- */

  function blockRange(a, b) {
    const A = Editor.block(a), B = Editor.block(b);
    const s = A.start + (A.md.length - A.md.replace(/^(#{1,3} |- |\d+\. |\[[ xX]\] |> )/, '').length);
    return { start: s, end: B.end };
  }

  function openBlockMenu(a, b) {
    const A = Editor.block(a);
    if (!A) return;
    const many = b > a;
    const items = [
      { type: 'head', label: many ? (b - a + 1) + ' blocks' : typeOf(A.type).label },
      { label: 'Turn into', note: '›', value: 'turn' },
      { label: 'Color', note: '›', value: 'color' },
      { type: 'sep' },
      { label: 'Ask AI', note: '✦', value: 'ai' },
      !many ? { label: 'Alternatives for this paragraph', value: 'alts' } : null,
      { label: 'Add a note', value: 'note' },
      { type: 'sep' },
      { label: 'Duplicate', note: mod('D'), value: 'dup' },
      { label: 'Move up', note: IS_MAC ? '⌘⇧↑' : 'Ctrl+Shift+↑', value: 'up' },
      { label: 'Move down', note: IS_MAC ? '⌘⇧↓' : 'Ctrl+Shift+↓', value: 'down' },
      { label: 'Delete', value: 'del', danger: true }
    ].filter(Boolean);
    UI.menu(grip, items, (it) => {
      const v = it.value;
      if (v === 'turn') { setTimeout(() => turnMenu(a, b), 0); return false; }
      if (v === 'color') { setTimeout(() => colorMenu(a, b), 0); return false; }
      if (v === 'dup') { Editor.setCaret(Editor.block(a).start); Editor.duplicateBlocks(a, b); }
      else if (v === 'up') { Editor.moveBlocks(a, b, Math.max(0, a - 1)); }
      else if (v === 'down') { Editor.moveBlocks(a, b, a + 1); }
      else if (v === 'del') Editor.deleteBlocks(a, b);
      else if (v === 'alts') { const r = blockRange(a, a); Editor.select(r.start, r.end); TDW.Alts && TDW.Alts.open('paragraph'); }
      else if (v === 'ai') { const r = blockRange(a, b); Editor.select(r.start, r.end); TDW.Notes && TDW.Notes.compose({ ai: true }); }
      else if (v === 'note') { const r = blockRange(a, b); Editor.select(r.start, r.end); TDW.Notes && TDW.Notes.compose({ ai: false }); }
      return false;
    });
  }

  function turnMenu(a, b) {
    const cur = Editor.block(a).type;
    const items = TYPES.map((t) => ({ label: t.label, note: t.hint, value: t.type, checked: t.type === cur }));
    UI.menu(grip, items, (it) => { Editor.turnInto(a, b, it.value); return false; });
  }

  function colorMenu(a, b) {
    const r = blockRange(a, b);
    TDW.Notes && TDW.Notes.colorMenu(grip, r.start, r.end);
  }

  /* ---------- The "/" menu ---------- */

  let slash = null; // { line, col, node, items, index, query, empty }

  function commands() {
    const list = TYPES.map((t) => ({ kind: 'type', type: t.type, label: t.label, icon: t.icon, hint: t.hint, words: (t.label + ' ' + t.alias).toLowerCase(), group: 'Basic blocks' }));
    list.push({ kind: 'ai', label: 'Ask AI', icon: '✦', hint: 'about this block', words: 'ask ai write rewrite help claude gemini talk', group: 'AI' });
    list.push({ kind: 'alts', label: 'Alternatives', icon: 'A/B', hint: 'other versions', words: 'alternatives alts ab a/b versions variations options', group: 'AI' });
    list.push({ kind: 'note', label: 'Note', icon: '✎', hint: 'for future you', words: 'note comment todo reminder memo', group: 'Notes' });
    for (const c of (TDW.Notes && TDW.Notes.palette()) || []) {
      list.push({ kind: 'color', color: c.value, label: c.label, icon: 'A', swatch: c.value, words: (c.label + ' color colour highlight').toLowerCase(), group: 'Color', hidden: true });
    }
    return list;
  }

  function match(list, q) {
    if (!q) return list.filter((x) => !x.hidden);
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = [];
    for (const x of list) {
      const own = x.words.split(/[\s/-]+/);
      // Every word typed starts one of the command's words ("/bul", "/h2", "/red back").
      if (!words.every((w) => own.some((o) => o.startsWith(w)) || x.words.replace(/\s+/g, '').startsWith(w))) continue;
      const score = x.label.toLowerCase().startsWith(words[0]) ? 0 : x.words.split(' ').some((w) => w.startsWith(words[0])) ? 1 : 2;
      scored.push([score, x]);
    }
    scored.sort((p, q2) => p[0] - q2[0]);
    return scored.map((p) => p[1]);
  }

  // After "+": the menu opens on the empty block without a "/".
  function openSlash(fromPlus, atLine, atCol) {
    closeSlash();
    const line = atLine != null ? atLine : Editor.caretLine();
    const col = atCol != null ? atCol : fromPlus ? Editor.caretCol() : Editor.caretCol() - 1;
    slash = { line, col, index: 0, query: '', fromPlus: !!fromPlus, node: null, items: [] };
    drawSlash();
  }

  function closeSlash() {
    if (!slash) return;
    if (slash.node) slash.node.remove();
    slash = null;
  }

  function slashQuery() {
    const b = Editor.block(slash.line);
    if (!b || Editor.caretLine() !== slash.line) return null;
    const c = Editor.caretCol();
    if (slash.fromPlus) {
      if (c < slash.col) return null;
      return b.vis.slice(slash.col, c);
    }
    if (b.vis[slash.col] !== '/' || c <= slash.col) return null;
    return b.vis.slice(slash.col + 1, c);
  }

  function drawSlash() {
    if (!slash) return;
    const q = slashQuery();
    if (q == null || q.length > 24 || /\s\s/.test(q)) { closeSlash(); return; }
    const found = match(commands(), q.trim());
    // Nothing matches and you typed a space after it: you meant a "/", not a command.
    if (!found.length && /\s$/.test(q)) { closeSlash(); return; }
    if (q !== slash.query) slash.index = 0;
    slash.query = q;
    slash.items = found;
    if (!slash.node) {
      slash.node = UI.el('div', { class: 'slash-menu', role: 'listbox', 'aria-label': 'Commands' });
      slash.node.addEventListener('mousedown', (e) => e.preventDefault());
      document.body.append(slash.node);
    }
    const kids = [];
    let group = '';
    found.slice(0, 40).forEach((x, k) => {
      if (x.group !== group && !q.trim()) { group = x.group; kids.push(UI.el('div', { class: 'slash-group', text: group })); }
      const row = UI.el('button', { type: 'button', role: 'option', class: 'slash-item' + (k === slash.index ? ' is-on' : ''), 'aria-selected': String(k === slash.index) },
        UI.el('span', { class: 'slash-icon' + (x.swatch ? ' sw sw-' + x.swatch : ''), text: x.icon }),
        UI.el('span', { class: 'slash-text' }, UI.el('span', { class: 'slash-label', text: x.label }), x.hint ? UI.el('span', { class: 'slash-hint', text: x.hint }) : null));
      row.addEventListener('mousemove', () => { if (slash && slash.index !== k) { slash.index = k; markSlash(); } });
      row.addEventListener('click', () => runSlash(k));
      kids.push(row);
    });
    if (!found.length) kids.push(UI.el('div', { class: 'slash-empty', text: 'No results' }));
    slash.node.replaceChildren(...kids);
    positionSlash();
  }

  function markSlash() {
    const rows = slash.node.querySelectorAll('.slash-item');
    rows.forEach((r, k) => { r.classList.toggle('is-on', k === slash.index); r.setAttribute('aria-selected', String(k === slash.index)); });
    const on = rows[slash.index];
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function positionSlash() {
    const b = Editor.block(slash.line);
    const rc = Editor.rectAt(b.start + Math.max(0, b.md.length - b.vis.length) + slash.col);
    const r = rc ? { left: rc.left, top: rc.lineTop, bottom: rc.lineTop + rc.lh } : b.el.getBoundingClientRect();
    const n = slash.node;
    const h = n.offsetHeight, w = n.offsetWidth;
    const vh = UI.visibleBottom ? UI.visibleBottom() : window.innerHeight;
    let top = r.bottom + 6;
    if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    n.style.left = Math.max(8, Math.min(r.left - 4, window.innerWidth - w - 8)) + 'px';
    n.style.top = Math.max(8, top) + 'px';
  }

  function runSlash(k) {
    const x = slash && slash.items[k];
    if (!x) return;
    const line = slash.line;
    const from = slash.col;
    const to = Editor.caretCol();
    closeSlash();
    if (to > from) Editor.clearInLine(line, from, to);
    if (x.kind === 'type') {
      Editor.turnInto(line, line, x.type);
    } else if (x.kind === 'ai' || x.kind === 'note') {
      const b = Editor.block(line);
      const pre = b.md.length - b.md.replace(/^(#{1,3} |- |\d+\. |\[[ xX]\] |> )/, '').length;
      if (b.vis.trim()) Editor.select(b.start + pre, b.end);
      TDW.Notes && TDW.Notes.compose({ ai: x.kind === 'ai' });
    } else if (x.kind === 'alts') {
      TDW.Alts && TDW.Alts.open('paragraph');
    } else if (x.kind === 'color') {
      TDW.Notes && TDW.Notes.colorBlock(line, x.color);
    }
  }

  function onKey(e) {
    if (!slash || e.isComposing) return;
    if (document.activeElement !== root()) { closeSlash(); return; }
    if (!/^(ArrowDown|ArrowUp|Enter|Tab|Escape)$/.test(e.key)) return;
    drawSlash(); // what's typed so far, even if the menu hasn't redrawn yet
    if (!slash) return;
    const n = slash.items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault(); e.stopPropagation();
      slash.index = (slash.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      markSlash();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (!n) { closeSlash(); return; }
      e.preventDefault(); e.stopPropagation();
      runSlash(slash.index);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      closeSlash();
    }
  }

  // "/" typed at the start of a block or after a space opens the menu.
  function onBeforeInput(e) {
    if (e.inputType !== 'insertText' || e.data !== '/' || !editable()) return;
    const s = Editor.getSelection();
    if (s.end !== s.start) return;
    const b = Editor.block(Editor.caretLine());
    const c = Editor.caretCol();
    if (!b || b.type === 'opaque' || b.type === 'hr') return;
    const before = b.vis.slice(0, c);
    if (before && !/\s$/.test(before)) return;
    pendingSlash = { line: Editor.caretLine(), col: c };
  }
  let pendingSlash = null;
  // Right after the "/" went in (the editor calls onText as part of the edit).
  function checkSlash() {
    const ps = pendingSlash;
    pendingSlash = null;
    if (!ps) return;
    const nb = Editor.block(ps.line);
    if (nb && Editor.caretLine() === ps.line && nb.vis[ps.col] === '/' && Editor.caretCol() === ps.col + 1) openSlash(false, ps.line, ps.col);
  }

  /* ---------- Wiring ---------- */

  function wire() {
    build();
    document.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', () => { if (!drag) hide(); if (slash) positionSlash(); }, { passive: true });
    window.addEventListener('keydown', onKey, true);
    root().addEventListener('beforeinput', onBeforeInput, true);
    root().addEventListener('keydown', () => hide());
    root().addEventListener('blur', () => setTimeout(() => { if (slash && document.activeElement !== root()) closeSlash(); }, 0));
    document.addEventListener('pointerdown', (e) => { if (slash && slash.node && !slash.node.contains(e.target)) closeSlash(); }, true);
  }

  TDW.Blocks = {
    init() { wire(); },
    load() { closeSlash(); hide(); },
    reload() { closeSlash(); },
    onText() { checkSlash(); if (slash) requestAnimationFrame(drawSlash); },
    onSelect() { if (slash) requestAnimationFrame(drawSlash); },
    onMode() { hide(); closeSlash(); },
    TYPES, openSlash, closeSlash, openBlockMenu,
    isSlashOpen: () => !!slash
  };
})();
