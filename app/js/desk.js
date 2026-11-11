/* Save as Markdown, open a file, post to X, and the list of shortcuts. All reached from the
   command palette; no LinkedIn button, on purpose. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Editor, UI, Formats } = TDW;
  const app = () => TDW.App;
  const IS_MAC = UI.device.apple;

  let fileInput = null;
  let sheet = null;

  /* ---------- Save and open ---------- */
  function fileName() {
    const d = app().state.draft;
    const title = (d ? TDW.Store.displayTitle(d) : 'draft').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return (title || 'draft') + '.md';
  }

  function save() {
    app().saveNow();
    const md = app().publishText(Editor.getText());
    if (!md.trim()) { UI.toast('Nothing to save yet.'); return; }
    const blob = new Blob([md.replace(/\n/g, '\n\n').replace(/\n{3,}/g, '\n\n') + '\n'], { type: 'text/markdown' });
    const a = UI.el('a', { href: URL.createObjectURL(blob), download: fileName() });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    UI.toast('Saved ' + fileName());
  }

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
        () => UI.toast('Opened the first post on X. The other ' + (posts.length - 1) + ' are copied for the replies.'),
        () => UI.toast('Opened the first post on X. Copy the rest from the page.'));
    }
    window.open(url, '_blank', 'noopener');
  }

  /* ---------- Shortcuts ---------- */
  const SHORTCUTS = [
    ['The page', [
      ['⌘E', 'Review on or off'], ['⌘K', 'Commands (with words selected: link them)'], ['⌘O', 'Drafts'], ['⌘⌥N', 'New draft'], ['⌘,', 'Settings'],
      ['⌘S', 'Save now'], ['⌘Z', 'Undo, alternatives and ghosts included']
    ]],
    ['Writing', [
      ['⌘B', 'Bold'], ['⌘I', 'Italic'], ['⌘⇧S', 'Strikethrough'], ['⌘⌥1', 'Heading 1 (2 and 3 the same)'], ['⌘⌥0', 'Plain text'],
      ['⌘⇧8', 'Bullets'], ['⌘⇧7', 'Numbered list'], ['⌘⇧9', 'To-do'], ['⌘↩', 'New post (X threads)']
    ]],
    ['Blocks', [
      ['/', 'Commands for the block'], ['⌘⇧↑', 'Move the block up (↓ down)'], ['⌘D', 'Duplicate the block'], ['⌘A', 'Select the block, again for all']
    ]],
    ['Notes and AI', [
      ['Ctrl+J', 'Ask AI about the selection'], ['Ctrl+Shift+M', 'Add a note'], ['Ctrl+Shift+H', 'Highlight in the last color']
    ]],
    ['Alternatives', [
      ['Ctrl+Shift+A', 'Alternatives for the selection'], ['Ctrl+Shift+G', 'Alternatives from AI'],
      ['↑ ↓', 'Flip through them, pointer over the words'], ['⌥↑ ⌥↓', 'Flip through the one at the caret']
    ]],
    ['The desk', [
      ['Ctrl+/', 'Ghost it or revive it'], ['Ctrl+Shift+X', 'Stash in Overflow'], ['Ctrl+Shift+O', 'Overflow'],
      ['Ctrl+Shift+L', 'The Lab'], ['Ctrl+Shift+P', 'Post to X'], ['Ctrl+?', 'This list']
    ]]
  ];
  const PHONE = [
    ['As you type', [['#', 'Heading (## and ### smaller)'], ['-', 'Bullet'], ['1.', 'Numbered list'], ['[]', 'To-do'], ['>', 'Quote'], ['---', 'Divider (in X, a new post)'], ['**word**', 'Bold'], ['*word*', 'Italic']]]
  ];

  const keyText = (k) => (k.startsWith('Ctrl') ? (IS_MAC ? k.replace(/Ctrl\+/g, '⌃').replace(/Shift\+/g, '⇧') : k) : UI.keys(k));

  function buildSheet() {
    sheet = UI.el('dialog', { class: 'shortcuts', 'aria-labelledby': 'keys-title' });
    const close = UI.el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Close' }, UI.icon('close'));
    close.addEventListener('click', () => UI.dismiss(sheet));
    const groups = (UI.device.phone ? PHONE : SHORTCUTS).map(([title, rows]) => UI.el('section', { class: 'keys-group' }, UI.el('h3', { text: title }),
      rows.map(([k, what]) => UI.el('div', { class: 'keys-row' }, UI.el('span', { text: what }),
        UI.device.phone ? UI.el('kbd', { text: k }) : UI.el('span', { class: 'keys' }, keyText(k).split(/(?<=[⌘⌥⇧⌃])|\+/).filter(Boolean).map((p) => UI.el('kbd', { text: p })))))));
    sheet.append(UI.el('div', { class: 'grabber', 'aria-hidden': 'true' }),
      UI.el('div', { class: 'dlg-head sheet-drag' }, UI.el('h2', { id: 'keys-title', text: UI.device.phone ? 'Typing shortcuts' : 'Keyboard shortcuts' }), close),
      UI.el('div', { class: 'keys-grid' }, groups));
    document.body.append(sheet);
  }

  function toggleSheet() {
    if (!sheet) buildSheet();
    if (sheet.open) { UI.dismiss(sheet); return; }
    UI.present(sheet, { onDismiss: () => Editor.focus() });
    sheet.querySelector('.btn-icon').focus({ preventScroll: true });
  }

  TDW.Desk = {
    init() {
      document.addEventListener('keydown', (e) => {
        if (document.querySelector('dialog[open]:modal') && !(sheet && sheet.open)) return;
        if (e.ctrlKey && !e.metaKey && !e.altKey && e.shiftKey && (e.code === 'KeyP' || String(e.key).toLowerCase() === 'p')) { e.preventDefault(); postToX(); }
        else if (e.ctrlKey && !e.metaKey && (e.key === '?' || (e.shiftKey && e.code === 'Slash'))) { e.preventDefault(); toggleSheet(); }
      });
    },
    save, openFile, postToX, toggleSheet
  };
})();
