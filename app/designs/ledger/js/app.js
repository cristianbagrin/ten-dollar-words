/* App state, events, and boot. Loaded last. */
(function () {
  'use strict';
  const TDW = window.TDW;
  const { Engine, Editor, UI, Store, Sound, Panel, Popover, Dialogs, Spell, Sync, Formats, Account, Marks } = TDW;
  // Modules that may or may not be loaded (each sets itself up from boot).
  const opt = (name) => TDW[name] || null;

  const APP_VERSION = '2.1.0';
  const SAMPLE_TEXT = [
    'Every word you type costs ten dollars. That sounds harsh, but it is really the fastest way to learn to cut.',
    'Most people write long sentences because they are afraid that short ones will make them look simple to readers.',
    'This sentence is here to show you what happens when a writer keeps adding clauses and qualifications that the reader has to hold in their head while they wait for the point, which arrives much too late.',
    'The report was written by a committee in order to utilize every possible word.',
    "I think you already know what to do. Delete what doesn't earn its keep and watch the register quietly drop."
  ].join('\n');
  const TYPES = ['spelling', 'veryHard', 'hard', 'complex', 'passive', 'adverb', 'qualifier'];
  const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
  const PLACEHOLDER = 'Start typing. Every word costs $10.';
  const BUMP = { pan: 0, gain: 0.6 };
  const SYNC_LABEL = { syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync error', 'other-tab': 'Syncing in another tab' };
  const FOLD_TITLE = {
    phone: 'On a phone, LinkedIn shows everything before this mark. The rest hides behind “…see more”.',
    desktop: 'On a computer, LinkedIn shows everything before this mark. The rest hides behind “…see more”.'
  };
  const PAPER_NOTE = { basic: '', linkedin: '52 a line', x: '280 a post', substack: '70 a line' };

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const editor = $('editor');

  const state = {
    mode: 'write', draft: null, analysis: null, words: 0, dirty: false,
    settings: null, aiBusy: false, cycle: { type: null, index: -1 }, loading: false
  };
  const controls = {};

  /* ---------- Settings and theme ---------- */
  function setThemeColor() {
    const v = getComputedStyle(root).getPropertyValue('--desk').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && v) meta.setAttribute('content', v);
  }

  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  // Ledger's look is a theme (light, dark, automatic) and a writing face. The old skins map on:
  // Night desk is dark, "Night desk in dark mode" is automatic, Ditto is the serif face.
  const THEMES = ['light', 'dark', 'auto'];
  const FACES = ['typewriter', 'serif', 'sans'];
  function lookOf(s) {
    const theme = THEMES.includes(s.theme) ? s.theme : s.skin === 'night' && !s.autoNight ? 'dark' : 'auto';
    const face = FACES.includes(s.face) ? s.face : s.skin === 'ditto' ? 'serif' : 'typewriter';
    return { theme, face };
  }
  const themeNow = (s) => { const t = lookOf(s).theme; return t === 'auto' ? (darkScheme.matches ? 'dark' : 'light') : t; };

  function applySettings() {
    const s = state.settings;
    root.dataset.theme = themeNow(s);
    root.dataset.face = lookOf(s).face;
    root.style.setProperty('--text-offset', s.textSize + 'px');
    root.classList.toggle('tw-scroll', !!s.typewriterScroll);
    setThemeColor();
  }

  function updateSettings(patch) {
    patch = Object.assign({}, patch);
    // Old callers speak skins; new ones speak theme and face. Keep both sets of keys true.
    if (!('theme' in patch) && ('autoNight' in patch || 'skin' in patch)) {
      const next = Object.assign({}, state.settings, patch);
      const was = lookOf(state.settings).theme;
      patch.theme = next.autoNight ? 'auto' : next.skin === 'night' ? 'dark' : was === 'dark' || was === 'auto' ? 'light' : was;
      if ('skin' in patch && !('face' in patch)) patch.face = patch.skin === 'ditto' ? 'serif' : patch.skin === 'night' ? lookOf(state.settings).face : 'typewriter';
    }
    if ('theme' in patch || 'face' in patch) {
      const L = lookOf(Object.assign({}, state.settings, patch));
      patch.autoNight = L.theme === 'auto';
      patch.skin = L.theme === 'dark' ? 'night' : L.face === 'serif' ? 'ditto' : 'typewriter';
    }
    Object.assign(state.settings, patch);
    Store.saveSettings(state.settings);
    applySettings();
    if ('sound' in patch) Sound.setProfile(patch.sound);
    if ('volume' in patch) Sound.setVolume(patch.volume);
    if ('noBackspace' in patch) updateBackspace();
    if ('skin' in patch || 'textSize' in patch || 'autoNight' in patch || 'face' in patch || 'theme' in patch) {
      Editor.render();
      document.fonts.ready.then(() => Editor.render());
    }
  }

  // Settings changed outside this tab: in another tab, or on another device (through the account).
  function reloadSettings() {
    state.settings = Store.getSettings();
    applySettings();
    Sound.setProfile(state.settings.sound);
    Sound.setVolume(state.settings.volume);
    Spell.setPersonal(state.settings.dictionary);
    Editor.setHidden(hiddenTypes());
    updateBackspace();
    if (state.mode === 'edit') refresh();
    else Editor.render();
  }

  const hiddenTypes = () => (state.settings.fixHighlights === false ? TYPES.slice() : TYPES.filter((t) => state.settings.highlights[t] === false));

  function toggleHighlight(type) {
    state.settings.highlights[type] = state.settings.highlights[type] === false;
    Store.saveSettings(state.settings);
    Editor.setHidden(hiddenTypes());
    Popover.hide();
  }

  const analyze = (text) => Engine.analyze(text, { isKnown: Spell.isReady() ? Spell.known : undefined });

  /* ---------- Ghosts: still on the page, gone for every other purpose ---------- */
  const ghosts = () => Editor.getAnnotations().ghosts;
  const masked = (text) => Marks.mask(text == null ? Editor.getText() : text, ghosts());           // offsets kept
  const publishText = (text) => Marks.stripGhosts(text == null ? Editor.getText() : text, ghosts()); // for posting, saving, copying
  const countNow = () => Engine.countWords(masked());

  /* ---------- Personal dictionary ---------- */
  function addWord(word) {
    const w = String(word || '').trim();
    if (!w) return;
    const list = state.settings.dictionary;
    if (!list.some((x) => x.toLowerCase() === w.toLowerCase())) list.push(w);
    Spell.addWord(w);
    Store.saveSettings(state.settings);
    Popover.hide();
    if (state.mode === 'edit') refresh();
  }

  function removeWord(word) {
    state.settings.dictionary = state.settings.dictionary.filter((x) => x !== word);
    Spell.setPersonal(state.settings.dictionary);
    Store.saveSettings(state.settings);
    if (state.mode === 'edit') refresh();
  }

  /* ---------- Saving ---------- */
  let saveTimer = 0;
  let statusTimer = 0;
  let saveFailed = false;

  function setTitle() {
    const d = state.draft;
    const t = $('mh-title');
    const has = !!(d && (d.text.trim() || String(d.title || '').trim()));
    t.textContent = d ? Store.displayTitle(d) : '';
    t.classList.toggle('is-untitled', !has);
    document.title = (has ? Store.displayTitle(d) + ' – ' : '') + 'Ten Dollar Words';
  }

  function setSaveStatus(text, ms) {
    clearTimeout(statusTimer);
    $('save-status').textContent = text;
    if (ms) statusTimer = setTimeout(() => { $('save-status').textContent = ''; }, ms);
  }

  function markDirty() {
    state.dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 600);
    setSaveStatus('Saving…');
  }

  function saveNow() {
    clearTimeout(saveTimer);
    if (!state.dirty || !state.draft) return true;
    const d = state.draft;
    if (!state.loading) { d.text = Editor.getText(); d.ann = Editor.getAnnotations(); }
    d.updatedAt = Date.now();
    if (Store.saveDraft(d)) {
      state.dirty = false;
      saveFailed = false;
      setSaveStatus('Saved', 2000);
      return true;
    }
    setSaveStatus('Not saved: storage is full');
    if (!saveFailed) UI.toast('Storage is full. Delete old drafts to make room.');
    saveFailed = true;
    return false;
  }

  // Tell sync about an edit to the open draft (text or title).
  function syncEdit() {
    const d = state.draft;
    if (d && !d.localOnly && Sync.isConnected()) Sync.noteEdit(d.id);
  }

  /* ---------- Formats ---------- */
  const foldCache = new Map();

  function foldOf(shown, cfg) {
    const key = cfg.label + '\u0000' + shown.slice(0, cfg.chars + 1);
    if (!foldCache.has(key)) {
      if (foldCache.size > 200) foldCache.clear();
      foldCache.set(key, Formats.foldIndex(shown, cfg));
    }
    return foldCache.get(key);
  }

  // The aids: X post windows (both modes); the LinkedIn fold and text past the limit (Edit mode).
  function updateAids() {
    const d = state.draft;
    if (!d) return;
    const f = Formats.get(d.format);
    const real = Editor.getText();
    const text = masked(real);
    const edit = state.mode === 'edit';
    const fx = [];
    const folds = [];
    if (edit && f.fold && text.trim()) {
      const shown = Formats.render(text, f);
      for (const key of Object.keys(Formats.FOLDS)) {
        const cfg = Formats.FOLDS[key];
        const k = foldOf(shown.text, cfg);
        if (k >= 0) folds.push({ index: shown.map[k], label: cfg.label, title: FOLD_TITLE[key] });
      }
      if (f.limit && shown.text.length > f.limit) fx.push({ type: 'overflow', start: shown.map[f.limit], end: text.length });
    }
    if (edit && f.thread) {
      for (const p of Formats.posts(text)) {
        const x = Formats.xPost(text, p.start, p.end, f.limit);
        if (x.over >= 0) fx.push({ type: 'overflow', start: x.over, end: p.end });
      }
    }
    Editor.setThread(!!f.thread);
    Editor.setFx(fx);
    Editor.setAids({
      folds,
      post: f.thread ? (s, e) => {
        const shown = publishText(real.slice(s, e)) === real.slice(s, e) ? real.slice(s, e) : Marks.stripGhosts(real.slice(s, e), ghosts().filter((g) => g.start < e && g.end > s).map((g) => ({ start: Math.max(0, g.start - s), end: Math.min(e - s, g.end - s) })));
        return { words: Engine.countWords(shown), length: Formats.xPost(shown, 0, shown.length, f.limit).length, limit: f.limit };
      } : null,
      addPost: UI.device.phone
    });
  }

  function applyFormat() {
    const f = Formats.get(state.draft.format);
    root.dataset.format = f.key;
    $('paper-label').textContent = f.label;
    updateAids();
    Editor.render();
  }

  // No teaching toasts: the X paper's menu note and each post's own footer say how threads work.
  function threadHint() {}

  function setFormat(key) {
    const d = state.draft;
    const from = Formats.get(d.format);
    const to = Formats.get(key);
    if (from === to) return;
    const anchor = captureAnchor();
    if (d.budget === Formats.budgetOf(from, state.settings)) d.budget = Formats.budgetOf(to, state.settings);
    d.format = to.key;
    Store.saveDraft(d);
    Account.noteDraft(d);
    applyFormat();
    threadHint(to);
    if (state.mode === 'edit') refresh();
    restoreAnchor(anchor);
    Editor.focus();
  }

  /* ---------- Drafts ---------- */
  // Save before leaving a draft. If storage is full, stay on it: switching would lose the text.
  function keepUnsaved() {
    if (saveNow()) return true;
    UI.toast('Storage is full, so this draft stays open until it saves. Delete old drafts to make room.');
    return false;
  }

  function loadDraft(d) {
    clearTimeout(saveTimer);
    state.draft = d;
    state.dirty = false;
    Store.setOpen(d.id);
    Store.setLast(d.id);
    Popover.hide();
    Panel.closeResults();
    Panel.closeBudget();
    Editor.setText(d.text, { ann: d.ann });
    state.words = countNow();
    each((m) => m.load && m.load(d));
    setSaveStatus('');
    setTitle();
    applyFormat();
    updateBackspace();
    Panel.renderBalance(d, state.words);
    if (state.mode === 'edit') refresh();
    if (Dialogs.isDraftsOpen()) Dialogs.renderDraftList();
  }

  let openSeq = 0;
  let loadingCount = 0;

  function onLoading(on) {
    loadingCount = Math.max(0, loadingCount + (on ? 1 : -1));
    state.loading = loadingCount > 0;
    Editor.setReadOnly(state.loading);
    Editor.setPlaceholder(state.loading ? 'Loading from Notion…' : PLACEHOLDER);
    if (on) {
      Popover.hide();
      Editor.setText('');
      state.words = 0;
      if (state.mode === 'edit') refresh();
    }
  }

  // An empty draft that never reached Notion isn't worth keeping once you leave it.
  function dropIfEmpty(d) {
    if (!d || d.notionId || d.text.trim() || d.title.trim() || Store.getDraft(d.id) !== d) return;
    Store.deleteDraft(d.id);
  }

  // Linked drafts may need their text from Notion first.
  async function openDraft(target) {
    const d = typeof target === 'string' ? Store.getDraft(target) : target;
    if (!d || state.draft === d) return;
    if (!keepUnsaved()) return;
    dropIfEmpty(state.draft);
    const seq = ++openSeq;
    state.draft = d;
    state.dirty = false;
    Store.setOpen(d.id);
    await Sync.prepare(d);
    if (seq !== openSeq || Store.getDraft(d.id) !== d) return;
    loadDraft(d);
  }

  function newDraft(text) {
    if (state.draft && !keepUnsaved()) return state.draft;
    openSeq++;
    const prev = state.draft;
    const f = Formats.get(state.settings.defaultFormat);
    const d = Store.newDraft({ text: text || '', format: f.key, budget: Formats.budgetOf(f, state.settings) });
    dropIfEmpty(prev);
    loadDraft(d);
    threadHint(f);
    if (text) syncEdit();
    return d;
  }

  function openNewest() {
    const next = Store.listDrafts()[0];
    if (next) openDraft(next);
    else newDraft('');
  }

  function draftDeleted(id) {
    if (!state.draft || state.draft.id !== id) return;
    clearTimeout(saveTimer);
    state.dirty = false;
    state.draft = null;
    openNewest();
  }

  function setBudget(v) {
    state.draft.budget = v;
    markDirty();
    saveNow();
    Account.noteDraft(state.draft);
    Panel.renderBalance(state.draft, state.words);
    refreshPanel();
  }

  function setIntent(text) {
    state.draft.intent = text;
    markDirty();
    saveNow();
    Account.noteDraft(state.draft);
  }

  // A Notion property changed in the Drafts drawer.
  function setProp(d, name, value) {
    d.props[name] = value;
    const c = Sync.config();
    const t = c && c.schema && c.schema[name] && c.schema[name].type;
    if (t === 'status' || t === 'select') d.nb = null; // a new stage decides backspace again
    Store.saveDraft(d);
    Account.noteDraft(d);
    Sync.noteProp(d.id, name);
    if (d === state.draft) updateBackspace();
  }

  // Every programmatic text change goes through here so undo keeps working and cuts can chime.
  // Every module the app hands the open draft to.
  const MODULES = ['Alts', 'Menu', 'Overflow', 'Lab', 'Challenges', 'Desk', 'Blocks', 'Bubble', 'Notes'];
  function each(fn) { for (const n of MODULES) { const m = opt(n); if (m) try { fn(m); } catch (e) { console.error(n, e); } } }

  function edit(start, end, text, opts) {
    const before = state.words;
    Editor.replaceRange(start, end, text);
    const saved = before - state.words;
    if (saved > 0 && state.mode === 'edit' && !(opts && opts.silent)) Sound.play('coin');
    return saved;
  }

  function cut(start, end, sentenceStart, opts) {
    const before = state.words;
    Editor.cut(start, end, sentenceStart);
    const saved = before - state.words;
    if (saved > 0 && state.mode === 'edit' && !(opts && opts.silent)) Sound.play('coin');
    return saved;
  }

  function insertSample() {
    const text = Editor.getText();
    if (!text.trim()) Editor.replaceRange(0, text.length, SAMPLE_TEXT);
    else newDraft(SAMPLE_TEXT);
  }

  /* ---------- Changes from Notion and from other tabs ---------- */
  // ann: the marks that came with this text (another tab); otherwise the editor finds its own
  // again. Alternatives that can't be found have their options put in Overflow.
  function replaceText(text, ann) {
    if (Editor.getText() === text) { if (ann) Editor.setAnnotations(ann); return; }
    const lost = Editor.replaceText(text, ann ? { ann } : null);
    if (lost && lost.length && opt('Overflow') && TDW.Overflow.keepLost) TDW.Overflow.keepLost(lost);
    state.draft.ann = Editor.getAnnotations();
    state.words = countNow();
    Popover.hide();
    setTitle();
    Panel.renderBalance(state.draft, state.words);
    updateAids();
    if (state.mode === 'edit') refresh();
    else Editor.render();
  }

  function onList() {
    if (Dialogs.isDraftsOpen()) Dialogs.renderDraftList();
    if (!state.draft || state.loading) return;
    updateBackspace();
    updateSyncStatus();
  }

  function onRemoteText(d) {
    if (d === state.draft && !state.loading) { replaceText(d.text, d.ann); each((m) => m.reload && m.reload(d)); }
    onList();
  }

  function onRemoteDelete(d) {
    if (d === state.draft) {
      clearTimeout(saveTimer);
      state.dirty = false;
      state.draft = null;
      openNewest();
      UI.toast('“' + Store.displayTitle(d) + '” was deleted in Notion.');
    }
    onList();
  }

  let conflictWarnedAt = 0;

  function onExternal(ch) {
    if (ch.key === 'tdw.syncWant') return; // sync's business: another tab came to the front
    if (ch.key === 'tdw.settings') { reloadSettings(); return; }
    if (ch.key === 'tdw.geminiKey') { Panel.updateAI(); return; }
    if (ch.conflict) {
      if (Date.now() - conflictWarnedAt > 60000) UI.toast('This draft is also being typed in another tab. Type in one tab at a time, or one will overwrite the other.');
      conflictWarnedAt = Date.now();
      return;
    }
    const d = state.draft;
    if (ch.key && ch.key.startsWith('tdw.draft.') && d && ch.id === d.id) {
      if (!ch.draft) draftDeleted(ch.id);
      else if (!state.dirty && !state.loading) {
        if (root.dataset.format !== Formats.get(d.format).key) applyFormat();
        replaceText(d.text, d.ann);
        each((m) => m.reload && m.reload(d));
        refreshPanel();
      }
    }
    onList();
  }

  /* ---------- Account ---------- */
  // The account brought changes from another device.
  function onAccountApplied(ch) {
    if (ch.settings) reloadSettings();
    if (ch.notion) Sync.adopt(ch.notion.prev);
    if (ch.ai) Panel.updateAI();
    const d = state.draft;
    if (d && ch.drafts.includes(d) && !state.loading) {
      if (d.text === Editor.getText() && !state.dirty) Editor.setAnnotations(d.ann);
      each((m) => m.reload && m.reload(d));
      applyFormat();
      updateBackspace();
      refreshPanel();
    }
    onList();
    updateSyncStatus();
    Dialogs.refreshSettings();
  }

  function onSignedOut(message) {
    UI.toast(message, { label: 'Sign in', run: () => Dialogs.openSettings('account') });
  }

  /* ---------- Sync status ---------- */
  function updateSyncStatus() {
    const b = $('sync-status');
    const s = Sync.status();
    const show = Sync.isConnected() && !!SYNC_LABEL[s.state];
    b.hidden = !show;
    if (!show) return;
    b.textContent = SYNC_LABEL[s.state];
    b.dataset.state = s.state;
  }

  function syncToast() {
    const s = Sync.status();
    const what = s.message || SYNC_LABEL[s.state] || '';
    const when = s.at ? 'Last sync ' + UI.relTime(s.at) + '.' : 'Not synced yet.';
    UI.toast((what ? what.replace(/\.?$/, '.') + ' ' : '') + when);
  }

  /* ---------- Analysis and modes ---------- */
  const isSentence = (i) => i.type === 'hard' || i.type === 'veryHard';
  let analyzeTimer = 0;

  function refresh() {
    clearTimeout(analyzeTimer);
    state.analysis = analyze(masked());
    Editor.setMarks(state.analysis.issues.filter(isSentence), state.analysis.issues.filter((i) => !isSentence(i)));
    Editor.setHidden(hiddenTypes());
    Editor.render();
    Panel.render(state.analysis, state.draft, state.words);
  }

  function refreshPanel() {
    if (state.mode === 'edit') Panel.render(state.analysis, state.draft, state.words);
  }

  // Remember which line sits where on screen, so a layout change can put it back.
  function captureAnchor() {
    const vh = window.innerHeight;
    const caret = Editor.caretIndex();
    const rc = Editor.rectAt(caret);
    if (rc && rc.lineTop > 0 && rc.lineTop < vh - rc.lh) return { index: caret, y: rc.lineTop };
    const sheet = $('surface').getBoundingClientRect();
    const idx = Editor.indexFromPoint(sheet.left + Math.min(40, sheet.width / 2), vh * 0.4);
    if (idx == null) return null;
    const r = Editor.rectAt(idx);
    return r ? { index: idx, y: r.lineTop } : null;
  }

  function restoreAnchor(a) {
    if (!a) return;
    const r = Editor.rectAt(a.index);
    if (r) window.scrollBy(0, r.lineTop - a.y);
  }

  function setMode(m) {
    m = m === 'edit' ? 'edit' : 'write';
    const anchor = captureAnchor();
    state.mode = m;
    root.dataset.mode = m;
    if (controls.mode) controls.mode.set(m, true);
    setThemeColor();
    updateAids();
    if (m === 'edit') {
      refresh();
    } else {
      clearTimeout(analyzeTimer);
      Editor.setMarks([], []);
      Editor.render();
      Popover.hide();
      Panel.closeResults();
      Panel.closeBudget();
    }
    if (TDW.Tape) TDW.Tape.onMode(m);
    $('reg-main').title = m === 'edit' ? '' : 'Show the tape (' + UI.keys('⌘E') + ')';
    updateBackspace();
    each((x) => x.onMode && x.onMode(m));
    restoreAnchor(anchor);
    Editor.focus();
  }

  /* ---------- No backspace ---------- */
  let blockWarned = false;

  function stageSaysNo(d) {
    const c = Sync.config();
    const schema = (c && c.schema) || {};
    return Object.keys(d.props || {}).some((name) => {
      const t = schema[name] && schema[name].type;
      const v = d.props[name];
      return (!t || t === 'select' || t === 'status') && typeof v === 'string' && /no backspace/i.test(v);
    });
  }

  // Is backspace off for this draft? The toggle wins; otherwise the Notion stage decides.
  function backspaceOff(d) {
    if (!d) return false;
    if (typeof d.nb === 'boolean') return d.nb;
    return !!state.settings.noBackspace && stageSaysNo(d);
  }

  const noBackspace = () => state.mode === 'write' && backspaceOff(state.draft);

  function updateBackspace() {
    const on = backspaceOff(state.draft);
    if (controls.nb) controls.nb.set(on);
    root.classList.toggle('no-backspace', on);
  }

  function setBackspaceOff(on) {
    on = !!on;
    const d = state.draft;
    if (!d) return;
    d.nb = on === (state.settings.noBackspace && stageSaysNo(d)) ? null : on;
    Store.saveDraft(d);
    Account.noteDraft(d);
    blockWarned = false;
    updateBackspace();
    Editor.focus();
    UI.toast(on ? 'Backspace is off' : 'Backspace is on');
  }

  function blocked() {
    if (performance.now() - Sound.lastKeyAt > 60) Sound.play('back', BUMP);
    if (blockWarned) return;
    blockWarned = true;
    UI.toast('Backspace is off');
  }

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ---------- Editor events ---------- */
  let writeRaf = 0;
  let titleRaf = 0;

  function onInput() {
    if (state.loading) return;
    const text = Editor.getText();
    const prev = state.words;
    const words = countNow();
    const d = state.draft;
    state.words = words;
    d.text = text;
    d.ann = Editor.getAnnotations();
    each((m) => m.onText && m.onText(text));
    Panel.renderBalance(d, words);
    if (!titleRaf) titleRaf = requestAnimationFrame(() => { titleRaf = 0; setTitle(); });
    markDirty();
    syncEdit();
    Popover.hide();
    updateAids();
    if (state.mode === 'edit') {
      if (text.length < 15000) {
        refresh();
      } else {
        clearTimeout(analyzeTimer);
        analyzeTimer = setTimeout(refresh, 150);
        Editor.render();
        Panel.render(state.analysis, d, words);
      }
      if (words < prev) Panel.refund(prev - words);
      const budget = d.budget;
      if (words > prev && ((prev * 10 <= budget * 0.9 && words * 10 > budget * 0.9) || (prev * 10 <= budget && words * 10 > budget))) {
        Sound.play('bell');
      }
    } else {
      Editor.render();
      if (!writeRaf) {
        writeRaf = requestAnimationFrame(() => {
          writeRaf = 0;
          if (state.settings.typewriterScroll) Editor.typewriterScroll();
        });
      }
    }
  }

  function onCaretMove() {
    if (state.mode === 'edit') {
      const s = Editor.getSelection();
      if (s.start === s.end) Popover.showAt(s.end);
      each((m) => m.onSelect && m.onSelect(s));
    } else if (state.settings.typewriterScroll && !pointerSelecting && performance.now() - lastPointerAt > 600) {
      // Only after typing or arrow keys: a click or a selection never moves the page.
      const s = Editor.getSelection();
      if (s.start === s.end) requestAnimationFrame(() => Editor.typewriterScroll());
    }
    if (state.mode !== 'edit') each((m) => m.onSelect && m.onSelect(Editor.getSelection()));
  }

  // Copy: LinkedIn and X get what the post will show; Basic and Substack also get rich text.
  function clipboard(slice) {
    const f = state.draft ? Formats.get(state.draft.format) : Formats.get('basic');
    if (f.social) return { text: Formats.render(slice, f).text };
    return { text: Formats.render(slice, 'plain').text, html: Formats.toHTML(slice) };
  }

  function onDocKeydown(e) {
    const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
    const key = String(e.key || '').toLowerCase();
    const dialogOpen = !!document.querySelector('dialog[open]');
    if (mod && key === 'e') {
      e.preventDefault();
      if (!dialogOpen) setMode(state.mode === 'write' ? 'edit' : 'write');
    } else if (mod && key === 's' && !e.shiftKey) {
      e.preventDefault();
      state.dirty = state.dirty || !!state.draft;
      if (saveNow()) UI.toast('Saved');
    } else if (e.key === 'Escape' && !dialogOpen && !UI.menuOpen() && !e.defaultPrevented) {
      if (Popover.isOpen()) Popover.hide();
      else if (Panel.isBudgetOpen()) Panel.closeBudget(true);
      else if (TDW.Tape && TDW.Tape.escape()) Editor.focus();
    }
  }

  let pointerSelecting = false;
  let lastPointerAt = 0;

  function wire() {
    editor.addEventListener('keydown', (e) => {
      if (state.loading) return;
      const k = Sound.kindForKey(e);
      if (k && !(k === 'back' && noBackspace())) Sound.play(k, { pan: Sound.panForKey(e), repeat: e.repeat });
      if ((e.key === 'Backspace' || e.key === 'Delete') && noBackspace()) { e.preventDefault(); blocked(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.altKey && Formats.get(state.draft.format).thread) {
        e.preventDefault();
        Editor.insertSeparator();
      }
      if (state.mode === 'write') root.classList.add('is-typing');
    });
    editor.addEventListener('beforeinput', (e) => {
      if (!e.inputType || !e.inputType.startsWith('insert') || e.inputType === 'insertCompositionText') return;
      if (performance.now() - Sound.lastKeyAt > 60) Sound.play('key');
    });
    editor.addEventListener('pointerdown', () => { pointerSelecting = true; lastPointerAt = performance.now(); });
    document.addEventListener('pointerup', () => {
      if (!pointerSelecting) return;
      pointerSelecting = false;
      lastPointerAt = performance.now();
      if (state.mode === 'edit') onCaretMove();
    });
    editor.addEventListener('keyup', (e) => { if (NAV_KEYS.has(e.key)) onCaretMove(); });

    document.addEventListener('keydown', onDocKeydown);
    let last = null;
    document.addEventListener('mousemove', (e) => {
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= 3) return;
      last = { x: e.clientX, y: e.clientY };
      root.classList.remove('is-typing');
    });
    let scrolled = false;
    window.addEventListener('scroll', () => {
      const s = window.scrollY > 4;
      if (s !== scrolled) { scrolled = s; root.classList.toggle('is-scrolled', s); }
    }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    window.addEventListener('pagehide', saveNow);
    // Closing now would lose text that couldn't be saved: let the browser ask first.
    window.addEventListener('beforeunload', (e) => {
      const unsaved = !saveNow() || (Store.isMemoryOnly() && !!state.draft && !!state.draft.text.trim());
      if (unsaved) { e.preventDefault(); e.returnValue = ''; }
    });

    $('btn-drafts').addEventListener('click', () => Dialogs.openDrafts());
    $('btn-settings').addEventListener('click', () => Dialogs.openSettings());
    $('sync-status').addEventListener('click', syncToast);

  }

  function menuButton(btn, items, onPick) {
    btn.setAttribute('aria-expanded', 'true');
    UI.menu(btn, items, onPick, null, () => btn.setAttribute('aria-expanded', 'false'));
  }

  function paperItems() {
    const cur = state.draft && Formats.get(state.draft.format).key;
    return [{ type: 'head', label: 'Paper' }]
      .concat(Formats.LIST.map((f) => ({ label: f.label, value: 'f:' + f.key, checked: f.key === cur, note: PAPER_NOTE[f.key] || null })))
      .concat([{ type: 'sep' }, { label: 'No backspace', value: 'nb', checked: backspaceOff(state.draft), note: 'in Write mode' }]);
  }

  function pickPaper(it) {
    if (it.value === 'nb') { setBackspaceOff(!backspaceOff(state.draft)); return false; }
    if (it.value.startsWith('f:')) setFormat(it.value.slice(2));
    return false;
  }

  function buildControls() {
    controls.mode = UI.segmented({
      label: 'Mode', value: 'write', class: 'seg-mode',
      options: [
        { value: 'write', label: 'Write', title: UI.device.phone ? null : 'Write (' + UI.keys('⌘E') + ')' },
        { value: 'edit', label: 'Edit', title: UI.device.phone ? null : 'Edit: the tape and its refunds (' + UI.keys('⌘E') + ')' }
      ],
      onChange: (v) => setMode(v)
    });
    $('mode-slot').append(controls.mode);
    for (const n of document.querySelectorAll('[data-icon]')) n.append(UI.icon(n.dataset.icon));
    $('btn-paper').addEventListener('click', () => menuButton($('btn-paper'), paperItems(), pickPaper));
    $('btn-more').addEventListener('click', () => {
      const D = TDW.Desk;
      const items = paperItems().concat([{ type: 'sep' }, { type: 'head', label: 'Share' },
        { label: 'Save as a Markdown file', value: 'save' }, { label: 'Open a file', value: 'open' }, { label: 'Post to X', value: 'x' }]);
      menuButton($('btn-more'), items, (it) => {
        if (it.value === 'save') D.save(); else if (it.value === 'open') D.openFile(); else if (it.value === 'x') D.postToX();
        else return pickPaper(it);
        return false;
      });
    });
    // No backspace has no switch on screen: the Paper menu and Settings hold it.
    controls.nb = { set() {} };
  }

  /* ---------- Boot ---------- */
  function boot() {
    TDW.mockAI = false; // tests switch the fake AI on from JS

    state.settings = Store.getSettings();
    applySettings();
    Sound.init(state.settings);

    buildControls();
    Editor.init({
      root: editor, surface: $('surface'), under: $('under'), aids: $('aids'),
      hooks: {
        onChange: onInput,
        onSelect: () => { if (!pointerSelecting) onCaretMove(); else each((m) => m.onSelect && m.onSelect(Editor.getSelection())); },
        canDelete: () => !noBackspace(),
        onBlocked: blocked,
        onNote: (ids) => opt('Notes') && TDW.Notes.openPins(ids),
        clipboard
      }
    });
    Editor.setPlaceholder(PLACEHOLDER);
    Panel.init();
    Popover.init();
    Dialogs.init();
    each((m) => m.init && m.init());
    Store.setBusyCheck(() => state.dirty);
    Store.onExternal(onExternal);
    Sync.init({ onRemoteText, onRemoteDelete, onList, onStatus: updateSyncStatus, onLoading, current: () => state.draft });
    Account.init({ onApplied: onAccountApplied, onSignedOut });

    const lastId = Store.getLast();
    const first = (lastId && Store.getDraft(lastId)) || Store.listDrafts()[0] || null;
    if (first) openDraft(first);
    else newDraft('');

    setMode('write');
    wire();
    if (Sync.isConnected()) Sync.start();
    updateSyncStatus();

    // PREVIEW: no service worker while this direction lives in app/designs/ (the root app's
    // worker serves these files network-first). Remove the `false &&` when it becomes app/.
    if (false && location.protocol === 'https:' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    document.fonts.ready.then(() => Editor.render());
    darkScheme.addEventListener('change', () => {
      if (lookOf(state.settings).theme !== 'auto') return;
      applySettings();
      Editor.render();
    });
    Spell.load('dict/en-us.txt?v=' + APP_VERSION).then(() => {
      Spell.setPersonal(state.settings.dictionary);
      if (state.mode === 'edit') refresh();
    }).catch(() => {});
  }

  // Insert markdown at the caret (Overflow → page), as one undoable paste.
  function insertAtCaret(md) {
    if (state.loading || !md) return;
    Editor.insertMd(md);
  }

  TDW.App = {
    state, APP_VERSION, SAMPLE_TEXT, masked, publishText, insertAtCaret, refresh, captureAnchor, restoreAnchor,
    noBackspace: () => noBackspace(), markDirty, syncEdit, updateAids,
    setMode, saveNow, openDraft, newDraft, draftDeleted, analyze, setFormat,
    updateSettings, toggleHighlight, hiddenTypes, setBudget, setIntent, setProp, edit, cut, insertSample,
    addWord, removeWord, refreshPanel, updateSyncStatus, openSettings: (section) => Dialogs.openSettings(section),
    syncChanged() { onList(); },
    setBackspaceOff, countNow,
    backspaceOff, lookOf, setTitle
  };
  boot();
})();
