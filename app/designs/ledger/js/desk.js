/* Share (save a Markdown file, open one, post to X) in the masthead, the price of a selection
   beside the title, and the list of shortcuts (Settings → Keys). No LinkedIn button, on purpose. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Marks, Editor, UI, Formats, Engine, Inline } = TDW;
  const app = () => TDW.App;
  const IS_MAC = UI.device.apple;

  const svg = (inner) => '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">' + inner + '</svg>';
  const ICONS = {
    save: svg('<path d="M3 2.5h8l2.5 2.5v8.5h-10.5z" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 2.5v3h5v-3M5 13.5v-4h6v4" stroke-width="1.3" stroke-linejoin="round"/>'),
    open: svg('<path d="M2 4.5V12.5h12V6H8L6.5 4.5z" stroke-width="1.3" stroke-linejoin="round"/>'),
    x: '<span class="x-glyph" aria-hidden="true">𝕏</span>',
    keyboard: svg('<rect x="1.5" y="4" width="13" height="8" rx="1.5" stroke-width="1.2"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4.5 9.5h7" stroke-width="1.3" stroke-linecap="round"/>')
  };

  let countEl = null;
  let fileInput = null;
  let sheet = null;

  /* ---------- Live count ---------- */

  // Characters a reader sees: no markdown, no ghosts.
  const charsOf = (md) => md.split('\n').map((l) => Inline.plain(l)).join('\n').replace(/\n+/g, '\n').trim().length;

  function ghostsIn(s, e) {
    return Editor.getAnnotations().ghosts.filter((g) => g.start < e && g.end > s)
      .map((g) => ({ start: Math.max(0, g.start - s), end: Math.min(e - s, g.end - s) }));
  }

  const n = (k, w) => k.toLocaleString() + ' ' + UI.plural(k, w, w + 's');
  let countRaf = 0;
  function updateCount() {
    if (countRaf) return;
    countRaf = requestAnimationFrame(() => {
      countRaf = 0;
      if (!countEl) return;
      const t = Editor.getText();
      const s = Editor.getSelection();
      if (s.end > s.start) {
        const shown = Marks.stripGhosts(t.slice(s.start, s.end), ghostsIn(s.start, s.end));
        const w = Engine.countWords(shown);
        countEl.textContent = n(w, 'word') + ', ' + n(charsOf(shown), 'char') + ' selected: ' + UI.money(w * 10);
        countEl.hidden = false;
      } else {
        countEl.textContent = '';
        countEl.hidden = true;
      }
    });
  }

  /* ---------- Save and open ---------- */

  function fileName() {
    const d = app().state.draft;
    const title = (d ? TDW.Store.displayTitle(d) : 'draft').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return (title || 'draft') + '.md';
  }

  // The draft as markdown: ghosts left out, each alternative as it is on the page.
  function save() {
    app().saveNow();
    const md = app().publishText(Editor.getText());
    const blob = new Blob([md.replace(/\n/g, '\n\n').replace(/\n{3,}/g, '\n\n') + '\n'], { type: 'text/markdown' });
    const a = UI.el('a', { href: URL.createObjectURL(blob), download: fileName() });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    UI.toast('Saved ' + fileName());
  }

  // A markdown or text file opens as a new draft. Paragraphs in a file are separated by blank
  // lines; here each line is a paragraph.
  function openFile() {
    if (!fileInput) {
      fileInput = UI.el('input', { type: 'file', accept: '.md,.markdown,.txt,text/markdown,text/plain', hidden: true });
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) { UI.toast('That file is too big to open (2 MB at most).'); return; }
        const raw = (await f.text()).replace(/\r\n?/g, '\n');
        const md = raw.split(/\n{2,}/).map((p) => p.replace(/\n(?!\s*([-*+>]|\d+\.|#)\s)/g, ' ')).join('\n').trim();
        app().newDraft(md);
        UI.toast('Opened ' + f.name);
      });
      document.body.append(fileInput);
    }
    fileInput.click();
  }

  /* ---------- Post to X ---------- */

  function postToX() {
    const t = app().publishText(Editor.getText());
    if (!t.trim()) { UI.toast('Write something to post first.'); return; }
    const x = Formats.get('x');
    const posts = Formats.posts(t).map((p) => Formats.render(t.slice(p.start, p.end), x).text.trim()).filter(Boolean);
    const first = posts[0] || Formats.render(t, x).text.trim();
    const url = 'https://x.com/intent/post?text=' + encodeURIComponent(first);
    if (posts.length > 1) {
      const rest = posts.slice(1).join('\n\n---\n\n');
      (navigator.clipboard ? navigator.clipboard.writeText(rest) : Promise.reject()).then(
        () => UI.toast('Opened the first post on X. The other ' + (posts.length - 1) + ' are copied, ready to paste as replies.'),
        () => UI.toast('Opened the first post on X. Copy the rest from the page.'));
    }
    window.open(url, '_blank', 'noopener');
  }

  /* ---------- Shortcuts ---------- */

  const SHORTCUTS = [
    ['Writing', [
      ['⌘E', 'Write and Edit mode'], ['⌘B', 'Bold'], ['⌘I', 'Italic'], ['⌘⇧S', 'Strikethrough'], ['⌘K', 'Link'],
      ['⌘⌥1', 'Heading 1 (2, 3 the same)'], ['⌘⇧8', 'Bullets'], ['⌘⇧7', 'Numbered list'], ['⌘⇧9', 'To-do'], ['⌘↩', 'New post (X threads)']
    ]],
    ['Blocks, like Notion', [
      ['/', 'Commands: headings, lists, to-do, quote, divider, AI, note, colors'], ['⌘⇧↑ ⌘⇧↓', 'Move the block up or down'],
      ['⌘D', 'Duplicate the block'], ['⌘A', 'Select the block, again for everything'], ['⋮⋮', 'Drag a block by its handle; click it for the menu']
    ]],
    ['Notes, colors, AI', [
      ['Ctrl+J', 'Ask AI about the selection'], ['Ctrl+Shift+M', 'Add a note (nothing selected: the Notes panel)'],
      ['Ctrl+Shift+H', 'Highlight in the last color used']
    ]],
    ['Alternatives', [
      ['Ctrl+Shift+A', 'Alternatives for selection'], ['Ctrl+Shift+G', 'AI alternatives for selection'],
      ['↑ ↓', 'Flip through them, with the pointer over one'], ['⌥↑ ⌥↓', 'Flip through the one the caret is in'],
      ['↩', 'In the list: add · ?? asks the AI'], ['⌘⌫', 'In the list: remove one'], ['Esc', 'Close the list']
    ]],
    ['Desk', [
      ['Ctrl+/', 'Ghost it / Revive'], ['Ctrl+Shift+X', 'Stash this in Overflow'], ['Ctrl+Shift+O', 'Show or hide Overflow'],
      ['Ctrl+↩', 'In Overflow: use this paragraph'], ['Ctrl+Shift+L', 'The Lab (Edit mode)'], ['Ctrl+Shift+P', 'Post to X'],
      ['⌘Z', 'Undo, alternatives and ghosts included'], ['Ctrl+?', 'This list']
    ]]
  ];

  const keyText = (k) => (k.startsWith('Ctrl') ? (IS_MAC ? k.replace(/Ctrl\+/g, '⌃').replace(/Shift\+/g, '⇧') : k) : UI.keys(k));

  function shortcutList() {
    return UI.el('div', { class: 'keys' }, SHORTCUTS.map(([title, rows]) => UI.el('div', null,
      UI.el('h4', { text: title }),
      UI.el('dl', null, rows.map(([k, what]) => [UI.el('dt', { text: keyText(k) }), UI.el('dd', { text: what })])))));
  }

  // The old floating sheet is Settings → Keys now.
  function toggleSheet() {
    const dlg = document.getElementById('settings-dialog');
    if (dlg.open && dlg.querySelector('.set-tab[data-sec="keys"][aria-selected="true"]')) { dlg.close(); Editor.focus(); return; }
    TDW.Dialogs.openSettings('keys');
  }

  function shareMenu() {
    const b = document.getElementById('btn-share');
    b.setAttribute('aria-expanded', 'true');
    UI.menu(b, [
      { label: 'Save as a Markdown file', value: 'save', note: '.md' },
      { label: 'Open a file', value: 'open', note: '.md .txt' },
      { type: 'sep' },
      { label: 'Post to X', value: 'x', note: keyText('Ctrl+Shift+P') }
    ], (it) => { if (it.value === 'save') save(); else if (it.value === 'open') openFile(); else postToX(); }, null,
    () => b.setAttribute('aria-expanded', 'false'));
  }

  function build() {
    countEl = UI.el('span', { class: 'mh-save mh-sel', 'aria-live': 'off', hidden: true });
    const where = document.querySelector('.mh-where');
    if (where) where.append(countEl);
    document.getElementById('btn-share').addEventListener('click', shareMenu);
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') && !(e.ctrlKey && (e.key === '?' || (e.shiftKey && e.code === 'Slash')))) return;
      if (e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && (e.code === 'KeyP' || String(e.key).toLowerCase() === 'p')) { e.preventDefault(); postToX(); }
      else if (e.ctrlKey && !e.metaKey && (e.key === '?' || (e.shiftKey && e.code === 'Slash'))) { e.preventDefault(); toggleSheet(); }
    });
    document.addEventListener('selectionchange', updateCount);
  }

  TDW.Desk = {
    init() { build(); },
    load() { updateCount(); },
    reload() { updateCount(); },
    onText() { updateCount(); },
    onSelect() { updateCount(); },
    save, openFile, postToX, toggleSheet, shortcutList
  };
})();
