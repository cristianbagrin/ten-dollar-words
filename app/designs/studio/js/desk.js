/* Around the page: the word count in the toolbar, the Share menu (copy for the platform, post
   to X, save as Markdown, open a file) and the list of shortcuts. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Marks, Editor, UI, Formats, Engine } = TDW;
  const { el, icon, tip, ctrlKeys, keys } = UI;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);

  let fileInput = null;
  let dlg = null;

  /* ---------- Live count ---------- */
  function ghostsIn(s, e) {
    return Editor.getAnnotations().ghosts.filter((g) => g.start < e && g.end > s)
      .map((g) => ({ start: Math.max(0, g.start - s), end: Math.min(e - s, g.end - s) }));
  }
  const n = (k, w) => k.toLocaleString('en-US') + ' ' + UI.plural(k, w, w + 's');
  let countRaf = 0;
  function updateCount() {
    if (countRaf) return;
    countRaf = requestAnimationFrame(() => {
      countRaf = 0;
      const node = $('tb-count');
      if (!node) return;
      const t = Editor.getText();
      const s = Editor.getSelection();
      if (s.end > s.start) {
        const words = Engine.countWords(Marks.stripGhosts(t.slice(s.start, s.end), ghostsIn(s.start, s.end)));
        node.textContent = n(words, 'word') + ' selected';
        node.classList.add('is-selection');
      } else {
        node.textContent = t.trim() ? n(Engine.countWords(app().publishText(t)), 'word') : '';
        node.classList.remove('is-selection');
      }
    });
  }

  /* ---------- Save, open, copy, post ---------- */
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
    const a = el('a', { href: URL.createObjectURL(blob), download: fileName() });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    UI.toast('Saved ' + fileName());
  }

  // A markdown or text file opens as a new draft.
  function openFile() {
    if (!fileInput) {
      fileInput = el('input', { type: 'file', accept: '.md,.markdown,.txt,text/markdown,text/plain', hidden: true });
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

  // The whole draft the way the platform shows it (LinkedIn and X: Unicode bold, no markdown).
  function copyFor() {
    const d = app().state.draft;
    const f = Formats.get(d ? d.format : 'basic');
    const md = app().publishText(Editor.getText());
    if (!md.trim()) { UI.toast('Nothing to copy yet.'); return; }
    const text = f.social ? Formats.render(md, f).text : Formats.render(md, 'plain').text;
    const html = f.social ? null : Formats.toHTML(md);
    const label = f.key === 'basic' ? 'Copied' : 'Copied for ' + f.label;
    let p;
    if (html && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      p = navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    } else p = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
    p.then(() => UI.toast(label), () => UI.toast('The browser didn’t allow copying. Select the text and copy it.'));
  }

  function shareMenu(anchor) {
    const d = app().state.draft;
    const f = Formats.get(d ? d.format : 'basic');
    UI.menu(anchor, [
      { label: f.key === 'basic' ? 'Copy the text' : 'Copy for ' + f.label, note: f.social ? 'As it will show' : 'With formatting', value: 'copy', icon: 'share' },
      { label: 'Post to X', note: ctrlKeys('Ctrl+Shift+P'), value: 'x', icon: 'external' },
      { type: 'sep' },
      { label: 'Save as Markdown', value: 'save' },
      { label: 'Open a file as a new draft…', value: 'open' }
    ], (it) => {
      if (it.value === 'copy') copyFor();
      else if (it.value === 'x') postToX();
      else if (it.value === 'save') save();
      else if (it.value === 'open') openFile();
    }, null, null, { align: anchor.id === 'share-btn' ? 'end' : null });
  }

  /* ---------- Shortcuts ---------- */
  const SHORTCUTS = [
    ['The studio', [
      ['⌘E', 'Focus or Studio'], ['⌘\\', 'Show or hide the library'], ['⌘⌥I', 'Show or hide the inspector'], ['⌘,', 'Settings'], ['⌘S', 'Save now (it saves as you type)']
    ]],
    ['Writing', [
      ['⌘B', 'Bold'], ['⌘I', 'Italic'], ['⌘⇧S', 'Strikethrough'], ['⌘K', 'Link'],
      ['⌘⌥1', 'Heading 1 (2 and 3 the same)'], ['⌘⇧8', 'Bullets'], ['⌘⇧7', 'Numbered list'], ['⌘⇧9', 'To-do'], ['⌘↩', 'New post, in an X thread']
    ]],
    ['Blocks', [
      ['/', 'Commands: headings, lists, to-do, quote, divider, AI, note, colors'], ['⌘⇧↑ ⌘⇧↓', 'Move the block up or down'],
      ['⌘D', 'Duplicate the block'], ['⌘A', 'Select the block, again for everything']
    ]],
    ['Notes, colors and AI', [
      ['Ctrl+J', 'Ask AI about the selection'], ['Ctrl+Shift+M', 'Add a note, or show the notes'], ['Ctrl+Shift+H', 'Highlight in the last color used']
    ]],
    ['Alternatives', [
      ['Ctrl+Shift+A', 'Alternatives for the selection'], ['Ctrl+Shift+G', 'Ask the AI for alternatives'],
      ['↑ ↓', 'Flip through them, with the pointer over one'], ['⌥↑ ⌥↓', 'Flip through the one the caret is in'],
      ['↩', 'In the list: add one; type ?? to ask the AI'], ['⌘⌫', 'In the list: remove one']
    ]],
    ['The desk', [
      ['Ctrl+/', 'Ghost it, or revive it'], ['Ctrl+Shift+X', 'Stash in Overflow'], ['Ctrl+Shift+O', 'Show Overflow'],
      ['Ctrl+↩', 'In Overflow: put this paragraph on the page'], ['Ctrl+Shift+L', 'The Lab'], ['Ctrl+Shift+P', 'Post to X'],
      ['⌘Z', 'Undo, alternatives and ghosts included'], ['Ctrl+?', 'This list']
    ]]
  ];
  const keyText = (k) => (k.startsWith('Ctrl') ? ctrlKeys(k) : keys(k));

  function buildSheet() {
    dlg = $('keys-dialog');
    const close = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close' }, icon('close'));
    close.addEventListener('click', () => dlg.close());
    const body = el('div', { class: 'keys-body' });
    for (const [title, rows] of SHORTCUTS) {
      const dl = el('dl', { class: 'keys-list' });
      for (const [k, what] of rows) dl.append(el('dt', null, ...keyText(k).split(' ').map((x) => el('kbd', { text: x }))), el('dd', { text: what }));
      body.append(el('section', { class: 'keys-sec' }, el('h3', { text: title }), dl));
    }
    dlg.append(el('header', { class: 'keys-head' }, el('h2', { id: 'keys-title', text: 'Keyboard shortcuts' }), close), body);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { if (!document.querySelector('dialog[open]')) Editor.focus(); });
  }

  function toggleSheet() {
    if (!dlg) buildSheet();
    if (dlg.open) { dlg.close(); return; }
    const s = document.getElementById('settings-dialog');
    if (s && s.open) s.close();
    dlg.showModal();
  }

  function build() {
    $('share-btn').append(el('span', { text: 'Share' }));
    $('share-btn').addEventListener('click', (e) => shareMenu(e.currentTarget));
    $('pb-share').append(icon('share'), el('span', { text: 'Share' }));
    $('pb-share').addEventListener('click', (e) => shareMenu(e.currentTarget));
    tip($('share-btn'), 'Copy, post, save or open');
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]:not(#keys-dialog)')) return;
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
    save, openFile, postToX, copyFor, shareMenu, toggleSheet
  };
})();
