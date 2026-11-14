/* Save as Markdown, open a file, post to X, Threads or LinkedIn, and the shortcuts sheet (where
   any shortcut can be changed). */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Editor, UI, Formats } = TDW;
  const app = () => TDW.App;

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

  /* ---------- A backup of everything ----------
     Every draft, setting and key this browser keeps, as one file, for another browser or web
     address. Opening it fills in what's missing there and keeps anything newer. */
  const NEW_HOME = 'https://tendollarwords.cristianbagrin.com/';
  const OLD_HOST = 'tendollarwords.netlify.app';
  const MOVED_KEY = 'tdw.movedBackup';
  let backupInput = null;

  function download(name, text, type) {
    const a = UI.el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function backup() {
    app().saveNow();
    const data = TDW.Store.exportAll();
    const name = 'ten-dollar-words-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    download(name, JSON.stringify(data), 'application/json');
    try { localStorage.setItem(MOVED_KEY, String(Date.now())); } catch (_) { /* storage blocked */ }
    const n = Object.keys(data.items).filter((k) => k.startsWith('tdw.draft.')).length;
    const saved = 'Saved ' + n + (n === 1 ? ' draft' : ' drafts') + ' and your settings. The file holds your keys: delete it once it’s opened.';
    if (location.hostname !== OLD_HOST) { UI.toast(saved); return; }
    UI.toast(saved + ' At the new address, open it with ⋯ → Open a backup.', { label: 'Go there', run: () => window.open(NEW_HOME, '_blank', 'noopener') });
  }

  function restore() {
    if (!backupInput) {
      backupInput = UI.el('input', { type: 'file', accept: '.json,application/json', hidden: true });
      backupInput.addEventListener('change', async () => {
        const f = backupInput.files && backupInput.files[0];
        backupInput.value = '';
        if (!f) return;
        let data = null;
        try { data = JSON.parse(await f.text()); } catch (_) { /* not JSON */ }
        app().saveNow();
        const done = TDW.Store.importAll(data);
        if (!done) { UI.toast('That file isn’t a Ten Dollar Words backup.'); return; }
        const msg = 'Opened the backup: ' + done.drafts + (done.drafts === 1 ? ' draft' : ' drafts') +
          (done.kept ? ', ' + done.kept + ' kept as they are here (newer)' : '') + (done.failed ? '. Storage is full: ' + done.failed + ' items didn’t fit' : '') + '.';
        try { sessionStorage.setItem('tdw.restored', msg); } catch (_) { /* shown now instead */ }
        location.reload();
      });
      document.body.append(backupInput);
    }
    backupInput.click();
  }

  // On the old address: say where the app lives now, until a backup has been saved here.
  function movedNotice() {
    let said = '';
    try { said = sessionStorage.getItem('tdw.restored') || ''; sessionStorage.removeItem('tdw.restored'); } catch (_) { /* none */ }
    if (said) { UI.toast(said); return; }
    if (location.hostname !== OLD_HOST) return;
    let saved = false;
    try { saved = !!localStorage.getItem(MOVED_KEY); } catch (_) { /* storage blocked */ }
    if (saved) UI.toast('Ten Dollar Words lives at ' + NEW_HOME.slice(8, -1) + ' now.', { label: 'Go there', run: () => { location.href = NEW_HOME; } });
    else UI.toast('Ten Dollar Words has moved to a new address. Save a backup here to take your drafts with you.', { label: 'Save a backup', run: backup });
  }

  /* ---------- Posting: X, Threads, LinkedIn ----------
     Each site opens its own composer with the text in it. A chain of posts opens on the first
     one and copies the rest for the replies. */
  const SITES = {
    x: { name: 'X', url: (t) => 'https://x.com/intent/post?text=' + encodeURIComponent(t) },
    threads: { name: 'Threads', url: (t) => 'https://www.threads.net/intent/post?text=' + encodeURIComponent(t) },
    linkedin: { name: 'LinkedIn', url: (t) => 'https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(t) }
  };
  const copy = (t) => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject(new Error('no clipboard')));

  function postTo(key) {
    const site = SITES[key];
    const t = app().publishText(Editor.getText());
    if (!site) return;
    if (!t.trim()) { UI.toast('Nothing to post yet.'); return; }
    const f = Formats.get(key);
    if (!f.thread) {
      const text = Formats.render(t, f).text.trim();
      // LinkedIn sometimes drops the text it is handed, so it is on the clipboard too.
      copy(text).then(() => UI.toast('Copied. Paste it if ' + site.name + ' opens empty.'), () => {});
      window.open(site.url(text), '_blank', 'noopener');
      return;
    }
    const posts = Formats.posts(t).map((p) => Formats.render(t.slice(p.start, p.end), f).text.trim()).filter(Boolean);
    const first = posts[0] || Formats.render(t, f).text.trim();
    if (posts.length > 1) {
      const n = posts.length - 1;
      copy(posts.slice(1).join('\n\n---\n\n')).then(
        () => UI.toast('The other ' + n + (n === 1 ? ' post is' : ' posts are') + ' copied for the replies.'),
        () => UI.toast('Copy the other posts from the page.'));
    }
    window.open(site.url(first), '_blank', 'noopener');
  }

  // Post wherever this draft's format says it is going; a plain draft goes to the clipboard.
  function post() {
    const d = app().state.draft;
    const key = d ? Formats.get(d.format).key : 'basic';
    if (SITES[key]) { postTo(key); return; }
    const t = app().publishText(Editor.getText());
    if (!t.trim()) { UI.toast('Nothing to copy yet.'); return; }
    copy(Formats.render(t, 'plain').text).then(() => UI.toast('Copied'), () => UI.toast('Copy it with ' + UI.keys('⌘C') + '.'));
  }

  /* ---------- Shortcuts: the list, and changing any of them ---------- */
  const FIXED = [
    ['⌘Z', 'Undo'], ['⌘⇧Z', 'Redo'], ['/', 'Block commands'], ['⌘A', 'Select the block, then everything'],
    ['⌘K', 'Link the selection'], ['⌘↩', 'New post'], ['⌥↑', 'Next alternative'], ['⌘⇧↩', 'Tick a to-do, open a toggle']
  ];
  const PHONE = [
    ['As you type', [['#', 'Heading (## and ### smaller)'], ['-', 'Bullet'], ['1.', 'Numbered list'], ['[]', 'To-do'], ['>', 'Quote'], ['---', 'Divider (in X, a new post)'], ['**word**', 'Bold'], ['*word*', 'Italic'], ['++word++', 'Underline']]]
  ];
  const K = () => TDW.Keys;
  let recording = null; // { id, stop }

  function saveKeys() { app().updateSettings({ keys: K().custom() }); }

  function stopRecording() {
    if (!recording) return;
    const r = recording;
    recording = null;
    window.removeEventListener('keydown', r.onKey, true);
    K().pause(false);
    drawSheet();
  }

  function record(id) {
    stopRecording();
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { stopRecording(); return; }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.altKey) { K().set(id, ''); saveKeys(); stopRecording(); return; }
      const combo = K().comboOf(e);
      if (!combo) return; // still holding modifiers, or a key that would stop you typing
      const before = K().custom();
      const other = K().ownerOf(combo, id);
      K().set(id, combo);
      saveKeys();
      stopRecording();
      if (other) UI.toast('“' + other.label + '” gave up ' + UI.keys(combo) + '.', { label: 'Undo', run: () => { K().load(before); saveKeys(); drawSheet(); } });
    };
    recording = { id, onKey };
    K().pause(true);
    window.addEventListener('keydown', onKey, true);
    drawSheet();
  }

  function keyButton(a) {
    const on = recording && recording.id === a.id;
    const combo = K().combo(a.id);
    const b = UI.el('button', { type: 'button', class: 'key-set' + (on ? ' is-recording' : '') + (combo ? '' : ' is-empty'), 'aria-label': a.label + ': ' + (combo ? UI.keys(combo) : 'no shortcut') + '. Change', dataset: { id: a.id } },
      on ? 'Press keys' : combo ? UI.kbd(combo) : 'Set');
    b.addEventListener('click', () => { if (on) stopRecording(); else record(a.id); });
    return b;
  }

  function drawSheet() {
    if (!sheet) return;
    const el = UI.el;
    const top = sheet.scrollTop;
    const close = el('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Close' }, UI.icon('close'));
    close.addEventListener('click', () => UI.dismiss(sheet));
    let groups;
    if (UI.device.phone) {
      groups = PHONE.map(([title, rows]) => el('section', { class: 'keys-group' }, el('h3', { text: title }), rows.map(([k, what]) => el('div', { class: 'keys-row' }, el('span', { text: what }), el('kbd', { text: k })))));
    } else {
      const names = [...new Set(K().LIST.map((a) => a.group))];
      groups = names.map((g) => el('section', { class: 'keys-group' }, el('h3', { text: g }),
        K().LIST.filter((a) => a.group === g).map((a) => el('div', { class: 'keys-row' }, el('span', { text: a.label }),
          el('span', { class: 'key-cell' },
            K().isDefault(a.id) ? null : el('button', { type: 'button', class: 'key-reset', 'aria-label': 'Back to the default for ' + a.label, 'data-tip': 'Default', onclick: () => { K().set(a.id, null); saveKeys(); drawSheet(); } }, UI.icon('undo')),
            keyButton(a))))));
      groups.push(el('section', { class: 'keys-group' }, el('h3', { text: 'Fixed' }), FIXED.map(([k, what]) => el('div', { class: 'keys-row' }, el('span', { text: what }), UI.kbd(k)))));
    }
    const changed = !UI.device.phone && Object.keys(K().custom()).length > 0;
    sheet.replaceChildren(el('div', { class: 'grabber', 'aria-hidden': 'true' }),
      el('div', { class: 'dlg-head sheet-drag' }, el('h2', { id: 'keys-title', text: 'Shortcuts' }),
        el('span', { class: 'keys-head-end' },
          changed ? el('button', { type: 'button', class: 'btn-quiet btn-sm', text: 'Reset all', onclick: () => { const before = K().custom(); K().reset(); saveKeys(); drawSheet(); UI.toast('Shortcuts reset', { label: 'Undo', run: () => { K().load(before); saveKeys(); drawSheet(); } }); } }) : null,
          close)),
      el('div', { class: 'keys-grid' }, groups));
    sheet.scrollTop = top;
    if (recording) { const b = sheet.querySelector('.key-set.is-recording'); if (b) b.focus({ preventScroll: true }); }
  }

  function toggleSheet() {
    if (!sheet) {
      sheet = UI.el('dialog', { class: 'shortcuts', 'aria-labelledby': 'keys-title' });
      sheet.addEventListener('close', stopRecording);
      document.body.append(sheet);
    }
    if (sheet.open) { UI.dismiss(sheet); return; }
    drawSheet();
    UI.present(sheet, { onDismiss: () => Editor.focus() });
    sheet.querySelector('.btn-icon').focus({ preventScroll: true });
  }

  TDW.Desk = {
    init() {
      TDW.Keys.on('postX', () => post());
      TDW.Keys.on('shortcuts', () => { if (document.querySelector('dialog[open]:modal') && !(sheet && sheet.open)) return false; toggleSheet(); });
      setTimeout(movedNotice, 1200);
    },
    save, openFile, backup, restore, post, postTo, postToX: () => postTo('x'), toggleSheet, SITES
  };
})();
