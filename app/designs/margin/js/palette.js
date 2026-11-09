/* The command palette: everything that isn't the page, one keystroke away (⌘K, ⋯ in the spine,
   or a tap on a phone). Commands are grouped (Draft, Review, Tools, Challenge, Format, Share,
   App), show their shortcuts, and filter as you type. Some open a page of their own (the Lab,
   picking a challenge, the theme). */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { UI, Editor, Formats } = TDW;
  const { el, icon, kbd } = UI;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);

  let dlg, input, list, foot, crumb, back;
  let page = null;       // null or { id, title }
  let rows = [];         // what's on screen: [{ cmd, node }]
  let sel = 0;

  /* ---------- The commands ---------- */
  function hasSelection() { const s = Editor.getSelection(); return s.end > s.start; }

  function commands() {
    const st = app().state;
    const d = st.draft;
    const lens = st.mode === 'edit';
    const nb = app().backspaceOff(d);
    const fmt = d ? Formats.get(d.format).key : 'basic';
    const C = TDW.Challenges;
    const ch = C && C.info ? C.info() : null;
    const out = [
      { group: 'Draft', label: 'New draft', icon: 'newDoc', keys: '⌘⌥N', run: () => TDW.Dialogs.newDraft(), words: 'create blank start' },
      { group: 'Draft', label: 'Drafts', icon: 'drafts', keys: '⌘O', run: () => TDW.Dialogs.openDrafts(), words: 'switch open list notion stage find' },
      { group: 'Draft', label: 'Budget and word count', icon: 'dollar', run: () => TDW.Spine.openTally(), words: 'money spend words characters reading time grade' },
      { group: 'Draft', label: 'No backspace', icon: 'backspace', state: nb ? 'On' : 'Off', on: nb, run: () => app().setBackspaceOff(!nb), words: 'delete forward only write' },

      { group: 'Review', label: lens ? 'Stop reviewing' : 'Review this draft', icon: 'pencil', keys: '⌘E', run: () => app().toggleLens(), words: 'edit mode fixes lens grade marks' },
      { group: 'Review', label: 'Check the message', icon: 'target', desc: 'What a busy reader takes away (AI)', run: () => { if (!lens) app().setMode('edit'); TDW.Review.startMessage(); }, words: 'ai takeaway gemini' },
      { group: 'Review', label: 'The Lab', icon: 'flask', keys: '⌃⇧L', note: 'Checks that mark, and Trim', page: 'lab', words: 'lab checks trim cut weak long tone hedges typos' },

      { group: 'Tools', label: 'Alternatives', icon: 'swap', keys: '⌃⇧A', run: () => TDW.Alts.open(), words: 'versions options a/b word sentence paragraph' },
      { group: 'Tools', label: 'Alternatives from AI', icon: 'spark', keys: '⌃⇧G', run: () => TDW.Alts.aiForSelection(), words: 'ai versions gemini' },
      { group: 'Tools', label: 'Ask AI about the selection', icon: 'spark', keys: '⌃J', run: () => TDW.Notes.compose({ ai: true }), words: 'chat thread gemini', off: !hasSelection() },
      { group: 'Tools', label: 'Add a note', icon: 'note', keys: '⌃⇧M', run: () => TDW.Notes.compose({ ai: false }), words: 'comment todo' },
      { group: 'Tools', label: 'Notes', icon: 'note', note: noteCount(), run: () => TDW.Notes.showAll(), words: 'margin comments list' },
      { group: 'Tools', label: 'Overflow', icon: 'tray', keys: '⌃⇧O', run: () => TDW.Overflow.toggle(), words: 'scratch spare cut parking' },
      { group: 'Tools', label: 'Stash in Overflow', icon: 'stash', keys: '⌃⇧X', run: () => TDW.Menu.stash(), words: 'move cut keep' },
      { group: 'Tools', label: 'Ghost it or revive it', icon: 'ghost', keys: '⌃/', run: () => TDW.Menu.toggleGhost(), words: 'hide fade dim' },

      { group: 'Challenge', label: 'Roll a challenge', icon: 'dice', run: () => C.roll(), words: 'game random' },
      { group: 'Challenge', label: 'Roll a combo', icon: 'dice', note: '2 or 3 that fit', run: () => C.combo(), words: 'game random several' },
      { group: 'Challenge', label: 'Today’s challenge', icon: 'dice', note: ch ? ch.daily : '', run: () => C.daily(), words: 'daily game' },
      { group: 'Challenge', label: 'Pick a challenge', icon: 'dice', page: 'challenges', words: 'list choose game' },
      { group: 'Challenge', label: 'Difficulty', icon: 'sliders', note: ch ? ch.levelName : '', page: 'level', words: 'easy medium hard level' }
    ];
    if (ch && ch.running) out.push({ group: 'Challenge', label: ch.met ? 'Clear the challenge' : 'Give up the challenge', icon: 'close', run: () => C.finish(), words: 'end stop quit' });
    for (const f of Formats.LIST) out.push({ group: 'Format', label: f.label, icon: 'measure', checked: f.key === fmt, run: () => app().setFormat(f.key), words: 'format width ' + f.key + (f.key === 'x' ? ' twitter thread' : '') });
    out.push(
      { group: 'Share', label: 'Save as Markdown', icon: 'download', run: () => TDW.Desk.save(), words: 'export file md download' },
      { group: 'Share', label: 'Open a file', icon: 'folder', run: () => TDW.Desk.openFile(), words: 'import md txt' },
      { group: 'Share', label: 'Post to X', icon: 'x', keys: '⌃⇧P', run: () => TDW.Desk.postToX(), words: 'twitter publish tweet thread' },
      { group: 'App', label: 'Settings', icon: 'sliders', keys: '⌘,', run: () => TDW.Dialogs.openSettings(), words: 'preferences account notion gemini sound font' },
      { group: 'App', label: 'Theme', icon: 'contrast', note: { auto: 'System', light: 'Light', dark: 'Dark' }[app().themeSetting(st.settings)], page: 'theme', words: 'dark light night appearance' },
      { group: 'App', label: 'Keyboard shortcuts', icon: 'keyboard', keys: '⌃?', run: () => TDW.Desk.toggleSheet(), words: 'keys help' },
      document.fullscreenEnabled ? { group: 'App', label: document.fullscreenElement ? 'Leave full screen' : 'Full screen', icon: document.fullscreenElement ? 'shrink' : 'expand', run: fullScreen, words: 'focus' } : null);
    return out.filter(Boolean);
  }

  function noteCount() { const n = (Editor.getAnnotations().notes || []).filter((x) => !x.done).length; return n ? n + ' open' : ''; }

  function fullScreen() {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(() => {});
  }

  function pageCommands(id) {
    if (id === 'lab') {
      const L = TDW.Lab;
      const out = L.ITEMS.filter((it) => it.id !== 'message').map((it) => ({ group: 'Mark, never rewrite', label: it.label, icon: 'flask', desc: it.desc, run: () => L.run(it.id), words: it.id }));
      L.LEVELS.forEach((lv, k) => { if (k) out.push({ group: 'Trim: dim what would go, then you choose', label: lv.label, icon: 'scissors', note: '~' + lv.pct + '%', cls: 'lab-level', data: { level: String(k) }, run: () => L.trim(k), words: 'trim cut shorten ' + lv.pct }); });
      return out;
    }
    if (id === 'challenges') return TDW.Challenges.pickList().map((c) => ({ group: c.cat, label: c.name, desc: c.desc, note: c.ai ? 'AI' : '', off: c.off, run: () => TDW.Challenges.pick(c.id), words: c.cat }));
    if (id === 'level') {
      const info = TDW.Challenges.info();
      return info.levels.map((l) => ({ group: 'Difficulty', label: l.name, checked: l.on, keep: true, run: () => { TDW.Challenges.setLevel(l.id); draw(); }, words: '' }));
    }
    if (id === 'theme') {
      const cur = app().themeSetting(app().state.settings);
      return [['auto', 'System', 'Light by day, graphite at night'], ['light', 'Light', ''], ['dark', 'Dark', '']].map(([v, label, desc]) => ({ group: 'Theme', label, desc, checked: v === cur, keep: true, run: () => { app().updateSettings({ theme: v }); draw(); } }));
    }
    return [];
  }
  const PAGE_TITLE = { lab: 'The Lab', challenges: 'Pick a challenge', level: 'Difficulty', theme: 'Theme' };

  /* ---------- Matching ---------- */
  function score(c, q) {
    if (!q) return 1;
    const label = c.label.toLowerCase();
    const hay = (label + ' ' + (c.words || '') + ' ' + (c.group || '') + ' ' + (c.note || '')).toLowerCase();
    if (label.startsWith(q)) return 100;
    if (label.includes(' ' + q) ) return 80;
    if (label.includes(q)) return 60;
    const toks = q.split(/\s+/).filter(Boolean);
    const words = hay.split(/[\s/,()]+/);
    if (toks.every((t) => words.some((w) => w.startsWith(t)))) return 40;
    let i = 0;
    for (const ch of label) if (ch === q[i]) i++;
    return i === q.length ? 10 : 0;
  }

  /* ---------- Drawing ---------- */
  function draw() {
    const q = input.value.trim().toLowerCase();
    const all = page ? pageCommands(page.id) : commands();
    let shown = all.map((c) => ({ c, s: score(c, q) })).filter((x) => x.s > 0);
    if (q) shown.sort((a, b) => b.s - a.s);
    shown = shown.map((x) => x.c);
    const kids = [];
    rows = [];
    let group = null;
    shown.forEach((c) => {
      if (!q && c.group !== group) { group = c.group; kids.push(el('div', { class: 'pal-group', role: 'presentation', text: group })); }
      const k = rows.length;
      const node = el('button', {
        type: 'button', role: 'option', id: 'pal-' + k, class: 'pal-row' + (c.cls ? ' ' + c.cls : ''), dataset: c.data || null,
        'aria-disabled': c.off ? 'true' : null, tabindex: '-1'
      },
      c.icon ? icon(c.icon) : null,
      el('span', { class: 'pal-label' }, c.label, c.desc && (page || q) ? el('span', { class: 'pal-desc', text: c.desc }) : null),
      c.note ? el('span', { class: 'pal-note', text: c.note }) : null,
      c.state ? el('span', { class: 'pal-state' + (c.on ? ' is-on' : ''), text: c.state }) : null,
      c.checked ? el('span', { class: 'pal-check' }, icon('check')) : null,
      c.keys ? kbd(c.keys) : null);
      node.addEventListener('mousemove', () => { if (sel !== k) { sel = k; mark(); } });
      node.addEventListener('click', () => runAt(k));
      rows.push({ c, node });
      kids.push(node);
    });
    if (!rows.length) kids.push(el('p', { class: 'pal-empty', text: 'Nothing matches “' + input.value.trim() + '”.' }));
    list.replaceChildren(...kids);
    if (sel >= rows.length) sel = 0;
    if (!q && !page) { const firstOn = 0; sel = Math.min(sel, rows.length - 1); if (sel < 0) sel = firstOn; }
    mark();
    crumb.hidden = back.hidden = !page;
    crumb.textContent = page ? page.title : '';
    input.placeholder = page ? 'Filter' : 'Type a command';
    const t = TDW.Spine.tally();
    foot.querySelector('.pal-count').textContent = TDW.Spine.countLine(t);
  }

  function mark() {
    rows.forEach((r, k) => r.node.classList.toggle('is-on', k === sel));
    const r = rows[sel];
    input.setAttribute('aria-activedescendant', r ? r.node.id : '');
    if (r) r.node.scrollIntoView({ block: 'nearest' });
  }

  function runAt(k) {
    const r = rows[k];
    if (!r || r.c.off) return;
    if (r.c.page) { openPage(r.c.page); return; }
    if (r.c.keep) { r.c.run(); return; }
    closeNow();
    Editor.focus();
    r.c.run();
  }

  function openPage(id) {
    page = { id, title: PAGE_TITLE[id] || '' };
    input.value = '';
    sel = 0;
    draw();
    if (!UI.isNarrow()) input.focus();
  }

  function goBack() { page = null; input.value = ''; sel = 0; draw(); input.focus(); }

  function onKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      mark();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(sel);
    } else if (e.key === 'Escape' && page) {
      e.preventDefault(); e.stopPropagation();
      goBack();
    } else if (e.key === 'Backspace' && page && !input.value) {
      e.preventDefault();
      goBack();
    }
  }

  /* ---------- Opening and closing ---------- */
  function open(opts) {
    const o = opts || {};
    page = null;
    input.value = o.query || '';
    sel = 0;
    if (o.page) page = { id: o.page, title: PAGE_TITLE[o.page] || '' };
    draw();
    UI.present(dlg, { onDismiss: () => Editor.focus() });
    if (!UI.isNarrow()) input.focus({ preventScroll: true });
    else dlg.focus();
  }

  function closeNow() { if (dlg.open) { dlg.classList.remove('is-leaving'); dlg.close(); dlg.style.transform = ''; } }

  function toggle(opts) { if (dlg.open) UI.dismiss(dlg); else open(opts); }

  function init() {
    dlg = $('palette');
    input = el('input', { type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-label': 'Command', autocomplete: 'off', spellcheck: 'false' });
    input.addEventListener('input', () => { sel = 0; draw(); });
    // However it closes (Esc, a click outside, a command), the caret goes back to the page.
    dlg.addEventListener('close', () => setTimeout(() => { if (!document.querySelector('dialog[open]') && (document.activeElement === input || document.activeElement === document.body)) Editor.focus(); }, 0));
    input.addEventListener('keydown', onKey);
    list = el('div', { class: 'pal-list', id: 'pal-list', role: 'listbox', 'aria-label': 'Commands' });
    list.addEventListener('keydown', onKey);
    crumb = el('span', { class: 'pal-crumb', hidden: true });
    back = el('button', { type: 'button', class: 'btn-icon pal-back', 'aria-label': 'Back', hidden: true, onclick: goBack }, icon('chevLeft'));
    foot = el('div', { class: 'pal-foot' }, el('span', { class: 'pal-count' }),
      el('span', { class: 'pal-keys' }, kbd('↑'), kbd('↓'), ' choose'), el('span', { class: 'pal-keys' }, kbd('↩'), ' run'), el('span', { class: 'pal-keys' }, kbd('esc'), ' close'));
    dlg.append(el('div', { class: 'grabber', 'aria-hidden': 'true' }), el('div', { class: 'pal-search sheet-drag' }, back, icon('search'), crumb, input), list, foot);
    // ⌘K opens it; with words selected, ⌘K still links them.
    document.addEventListener('keydown', (e) => {
      const mod = UI.device.apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      const k = String(e.key || '').toLowerCase();
      if (mod && !e.shiftKey && !e.altKey && k === 'k') {
        if (dlg.open) { e.preventDefault(); e.stopPropagation(); UI.dismiss(dlg); return; }
        if (document.querySelector('dialog[open]:modal')) return;
        if (document.activeElement === Editor.rootEl() && hasSelection()) return;
        e.preventDefault(); e.stopPropagation();
        open();
      } else if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.code === 'KeyL' || k === 'l')) {
        if (document.querySelector('dialog[open]:modal')) return;
        e.preventDefault();
        open({ page: 'lab' });
      }
    }, true);
  }

  TDW.Palette = { init, open, toggle, close: () => UI.dismiss(dlg), isOpen: () => !!dlg && dlg.open };
})();
