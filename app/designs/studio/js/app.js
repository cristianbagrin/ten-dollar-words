/* App state, events, and boot. Loaded last.
   Studio's model: the library (left), the page (middle) and the inspector (right).
   - Focus (setMode('write')): both side panes folded away, no highlights, No backspace applies.
   - Studio (setMode('edit')): the inspector is open; the fix highlights show on its Review tab.
   On a phone the library is the home screen and the inspector is a sheet. */
(function () {
  'use strict';
  const TDW = window.TDW;
  const { Engine, Editor, UI, Store, Sound, Panel, Popover, Dialogs, Spell, Sync, Formats, Account, Marks, Inspector, Library } = TDW;
  const opt = (name) => TDW[name] || null;
  const { el, icon, tip, keys, ctrlKeys, isNarrow } = UI;

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
  const FOLD_TITLE = {
    phone: 'On a phone, LinkedIn shows everything before this mark. The rest hides behind “…see more”.',
    desktop: 'On a computer, LinkedIn shows everything before this mark. The rest hides behind “…see more”.'
  };
  const FORMAT_NOTE = { basic: 'Your font’s own line', linkedin: 'The “…see more” fold', x: 'One window per post', substack: 'A newsletter’s line' };
  const FONT_OF_SKIN = { typewriter: 'typewriter', ditto: 'serif', night: 'mono' };
  const THEMES = ['light', 'dark', 'system'];
  const FONTS = ['serif', 'typewriter', 'sans', 'mono'];

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const editor = $('editor');

  const state = {
    mode: 'write', draft: null, analysis: null, words: 0, dirty: false,
    settings: null, aiBusy: false, cycle: { type: null, index: -1 }, loading: false
  };

  /* ---------- Settings: theme and writing font ---------- */
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  // Old settings carry a skin (and auto night); Studio separates the theme from the writing
  // font. Unknown values fall back, so nothing old can break it.
  function normalizeLook(s, fresh) {
    if (!THEMES.includes(s.theme)) s.theme = fresh ? 'system' : s.autoNight ? 'system' : s.skin === 'night' ? 'dark' : 'light';
    if (!FONTS.includes(s.font)) s.font = fresh ? 'serif' : FONT_OF_SKIN[s.skin] || 'serif';
    return s;
  }
  // Keep the old fields true too, so the settings still make sense to an older copy of the app.
  function legacyLook(s) {
    s.autoNight = s.theme === 'system';
    s.skin = s.theme === 'dark' ? 'night' : s.font === 'typewriter' ? 'typewriter' : s.font === 'mono' ? 'typewriter' : 'ditto';
  }
  const themeNow = () => (state.settings.theme === 'system' ? (darkScheme.matches ? 'dark' : 'light') : state.settings.theme);

  function setThemeColor() {
    const v = getComputedStyle(root).getPropertyValue(isNarrow() && Library.view() === 'library' ? '--chrome' : '--page').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && v) meta.setAttribute('content', v);
  }

  function applySettings() {
    const s = state.settings;
    root.dataset.theme = themeNow();
    root.dataset.font = s.font;
    root.style.setProperty('--text-offset', s.textSize + 'px');
    root.classList.toggle('tw-scroll', !!s.typewriterScroll);
    setThemeColor();
  }

  function updateSettings(patch) {
    const p = Object.assign({}, patch);
    if ('skin' in p && !('font' in p)) {
      p.font = FONT_OF_SKIN[p.skin] || state.settings.font;
      if (!('theme' in p) && !('autoNight' in p) && state.settings.theme !== 'system') p.theme = p.skin === 'night' ? 'dark' : 'light';
    }
    if ('autoNight' in p && !('theme' in p)) p.theme = p.autoNight ? 'system' : (p.skin || state.settings.skin) === 'night' ? 'dark' : 'light';
    Object.assign(state.settings, p);
    normalizeLook(state.settings, false);
    if ('theme' in p || 'font' in p) legacyLook(state.settings);
    Store.saveSettings(state.settings);
    applySettings();
    if ('sound' in p) Sound.setProfile(p.sound);
    if ('volume' in p) Sound.setVolume(p.volume);
    if ('noBackspace' in p) updateBackspace();
    if ('font' in p || 'theme' in p || 'skin' in p || 'textSize' in p || 'autoNight' in p) requestAnimationFrame(() => Editor.render());
    if (Dialogs.isSettingsOpen && Dialogs.isSettingsOpen() && ('theme' in p || 'sound' in p)) Dialogs.refreshSettings();
  }

  function reloadSettings() {
    state.settings = normalizeLook(Store.getSettings(), false);
    applySettings();
    Sound.setProfile(state.settings.sound);
    Sound.setVolume(state.settings.volume);
    Spell.setPersonal(state.settings.dictionary);
    Editor.setHidden(hiddenTypes());
    updateBackspace();
    refresh();
  }

  const hiddenTypes = () => (state.settings.fixHighlights === false ? TYPES.slice() : TYPES.filter((t) => state.settings.highlights[t] === false));

  function toggleHighlight(type) {
    state.settings.highlights[type] = state.settings.highlights[type] === false;
    if (state.settings.highlights[type] && state.settings.fixHighlights === false) state.settings.fixHighlights = true;
    Store.saveSettings(state.settings);
    Editor.setHidden(hiddenTypes());
    Popover.hide();
  }

  const analyze = (text) => Engine.analyze(text, { isKnown: Spell.isReady() ? Spell.known : undefined });

  /* ---------- Ghosts: still on the page, gone for every other purpose ---------- */
  const ghosts = () => Editor.getAnnotations().ghosts;
  const masked = (text) => Marks.mask(text == null ? Editor.getText() : text, ghosts());
  const publishText = (text) => Marks.stripGhosts(text == null ? Editor.getText() : text, ghosts());
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
    refresh();
  }
  function removeWord(word) {
    state.settings.dictionary = state.settings.dictionary.filter((x) => x !== word);
    Spell.setPersonal(state.settings.dictionary);
    Store.saveSettings(state.settings);
    refresh();
  }

  /* ---------- Saving: quiet unless it fails ---------- */
  let saveTimer = 0;
  let saveFailed = false;
  function setSaveStatus(text) { $('save-status').textContent = text; }
  function markDirty() {
    state.dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 600);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (!state.dirty || !state.draft) return true;
    const d = state.draft;
    if (!state.loading) { d.text = Editor.getText(); d.ann = Editor.getAnnotations(); }
    d.updatedAt = Date.now();
    if (Store.saveDraft(d)) {
      state.dirty = false;
      if (saveFailed) setSaveStatus('');
      saveFailed = false;
      scheduleList();
      return true;
    }
    setSaveStatus('Not saved: storage is full');
    if (!saveFailed) UI.toast('Storage is full. Delete old drafts to make room.');
    saveFailed = true;
    return false;
  }
  function syncEdit() {
    const d = state.draft;
    if (d && !d.localOnly && Sync.isConnected()) Sync.noteEdit(d.id);
  }
  // The library's spend and dates follow the typing, a little behind it.
  let listTimer = 0;
  function scheduleList(ms) { clearTimeout(listTimer); listTimer = setTimeout(() => {
    // The open draft's row reads the same text as the header, not the last saved copy.
    const d = state.draft;
    if (d && !state.loading) { d.text = Editor.getText(); d.ann = Editor.getAnnotations(); }
    Library.render();
  }, ms == null ? 250 : ms); }

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

  // X post windows (always); the LinkedIn fold and text past the limit (Studio).
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
        const slice = real.slice(s, e);
        const shown = Marks.stripGhosts(slice, ghosts().filter((g) => g.start < e && g.end > s).map((g) => ({ start: Math.max(0, g.start - s), end: Math.min(e - s, g.end - s) })));
        return { words: Engine.countWords(shown), length: Formats.xPost(shown, 0, shown.length, f.limit).length, limit: f.limit };
      } : null,
      addPost: UI.device.touch
    });
  }

  function applyFormat() {
    const f = Formats.get(state.draft.format);
    root.dataset.format = f.key;
    $('format-btn').replaceChildren(el('span', { text: f.label }), icon('chevDown'));
    $('format-btn').setAttribute('aria-label', 'Format: ' + f.label);
    $('pb-format').replaceChildren(icon('format'), el('span', { text: f.label }));
    updateAids();
    Editor.render();
  }

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
    Panel.renderMoney(d, state.words);
    refresh();
    restoreAnchor(anchor);
    Library.renderDraftTab();
    Editor.focus();
  }

  function formatMenu(anchor) {
    const cur = state.draft && state.draft.format;
    UI.menu(anchor, Formats.LIST.map((f) => ({ label: f.label, note: FORMAT_NOTE[f.key], value: f.key, checked: f.key === cur })), (it) => { setFormat(it.value); });
  }

  /* ---------- Drafts ---------- */
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
    Editor.setText(d.text, { ann: d.ann });
    state.words = countNow();
    each((m) => m.load && m.load(d));
    setSaveStatus('');
    applyFormat();
    updateBackspace();
    updateTitle();
    Panel.renderMoney(d, state.words);
    refresh();
    Library.render();
    Library.renderDraftTab();
  }

  let openSeq = 0;
  let loadingCount = 0;
  function onLoading(on) {
    loadingCount = Math.max(0, loadingCount + (on ? 1 : -1));
    state.loading = loadingCount > 0;
    Editor.setReadOnly(state.loading);
    Editor.setPlaceholder(state.loading ? 'Loading from Notion…' : PLACEHOLDER);
    root.classList.toggle('is-loading', state.loading);
    if (on) {
      Popover.hide();
      Editor.setText('');
      state.words = 0;
      refresh();
    }
  }

  function dropIfEmpty(d) {
    if (!d || d.notionId || d.text.trim() || d.title.trim() || Store.getDraft(d.id) !== d) return;
    Store.deleteDraft(d.id);
  }

  async function openDraft(target) {
    const d = typeof target === 'string' ? Store.getDraft(target) : target;
    if (!d || state.draft === d) return;
    if (!keepUnsaved()) return;
    dropIfEmpty(state.draft);
    const seq = ++openSeq;
    state.draft = d;
    state.dirty = false;
    Store.setOpen(d.id);
    Library.render();
    await Sync.prepare(d);
    if (seq !== openSeq || Store.getDraft(d.id) !== d) return;
    loadDraft(d);
    window.scrollTo(0, 0);
  }

  function newDraft(text) {
    if (state.draft && !keepUnsaved()) return state.draft;
    openSeq++;
    const prev = state.draft;
    const f = Formats.get(state.settings.defaultFormat);
    const d = Store.newDraft({ text: text || '', format: f.key, budget: Formats.budgetOf(f, state.settings) });
    dropIfEmpty(prev);
    loadDraft(d);
    window.scrollTo(0, 0);
    if (text) syncEdit();
    if (isNarrow() && Library.view() !== 'page') Library.pushPage({ instant: !!text });
    return d;
  }

  function openNewest() {
    const next = Store.listDrafts()[0];
    if (next) openDraft(next); else newDraft('');
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
    Panel.renderMoney(state.draft, state.words);
    Library.renderDraftTab();
  }

  function setIntent(text) {
    state.draft.intent = text;
    markDirty();
    saveNow();
    Account.noteDraft(state.draft);
  }

  function setProp(d, name, value) {
    d.props[name] = value;
    const c = Sync.config();
    const t = c && c.schema && c.schema[name] && c.schema[name].type;
    if (t === 'status' || t === 'select') d.nb = null; // a new stage decides backspace again
    Store.saveDraft(d);
    Account.noteDraft(d);
    Sync.noteProp(d.id, name);
    if (d === state.draft) updateBackspace();
    Library.render();
  }

  const MODULES = ['Alts', 'Menu', 'Overflow', 'Lab', 'Challenges', 'Desk', 'Blocks', 'Bubble', 'Notes', 'Ledger'];
  function each(fn) { for (const n of MODULES) { const m = opt(n); if (m) try { fn(m); } catch (e) { console.error(n, e); } } }

  // A fix that returns money gets a moment: the chip ticks down, and a toast says what came back.
  function saveToast(words) {
    UI.toast('Saved ' + UI.money(words * 10), { label: 'Undo', run: () => { Editor.undo(); Editor.focus(); } });
    scheduleList(0);
    root.classList.remove('is-credit'); void root.offsetWidth; root.classList.add('is-credit');
    setTimeout(() => root.classList.remove('is-credit'), 1200);
  }
  function edit(start, end, text, opts) {
    const before = state.words;
    Editor.replaceRange(start, end, text);
    const saved = before - state.words;
    if (saved > 0 && state.mode === 'edit' && !(opts && opts.silent)) { Sound.play('coin'); saveToast(saved); }
    return saved;
  }
  function cut(start, end, sentenceStart, opts) {
    const before = state.words;
    Editor.cut(start, end, sentenceStart);
    const saved = before - state.words;
    if (saved > 0 && state.mode === 'edit' && !(opts && opts.silent)) { Sound.play('coin'); saveToast(saved); }
    return saved;
  }
  function insertSample() {
    const text = Editor.getText();
    if (!text.trim()) Editor.replaceRange(0, text.length, SAMPLE_TEXT);
    else newDraft(SAMPLE_TEXT);
  }

  /* ---------- Changes from Notion and from other tabs ---------- */
  function replaceText(text, ann) {
    if (Editor.getText() === text) { if (ann) Editor.setAnnotations(ann); return; }
    const lost = Editor.replaceText(text, ann ? { ann } : null);
    if (lost && lost.length && opt('Overflow') && TDW.Overflow.keepLost) TDW.Overflow.keepLost(lost);
    state.draft.ann = Editor.getAnnotations();
    state.words = countNow();
    Popover.hide();
    updateAids();
    updateTitle();
    Panel.renderMoney(state.draft, state.words);
    refresh();
  }

  function onList() {
    Library.render();
    Library.renderDraftTab();
    if (!state.draft || state.loading) return;
    updateBackspace();
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
      UI.toast('“' + Store.displayTitle(d) + '” was deleted in Notion');
    }
    onList();
  }

  let conflictWarnedAt = 0;
  function onExternal(ch) {
    if (ch.key === 'tdw.syncWant') return;
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
      }
    }
    onList();
  }

  /* ---------- Account ---------- */
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
      Panel.renderMoney(d, state.words);
      refresh();
    }
    onList();
    Library.renderSync();
    Dialogs.refreshSettings();
  }
  function onSignedOut(message) {
    UI.toast(message, { label: 'Sign in', run: () => Dialogs.openSettings('account') });
  }

  /* ---------- Analysis, highlights and modes ---------- */
  const isSentence = (i) => i.type === 'hard' || i.type === 'veryHard';
  let analyzeTimer = 0;
  // Fix highlights show while the Review tab is in front: what's on the page is what the open tab is about.
  const showsFixes = () => state.mode === 'edit' && Inspector.tab() === 'review' && !Inspector.pushed();

  function refresh() {
    clearTimeout(analyzeTimer);
    if (!state.draft) return;
    if (state.mode !== 'edit') {
      Editor.setMarks([], []);
      Editor.render();
      if (TDW.Ledger) TDW.Ledger.update();
      return;
    }
    state.analysis = analyze(masked());
    if (showsFixes()) Editor.setMarks(state.analysis.issues.filter(isSentence), state.analysis.issues.filter((i) => !isSentence(i)));
    else Editor.setMarks([], []);
    Editor.setHidden(hiddenTypes());
    Editor.render();
    Panel.render(state.analysis, state.draft, state.words);
    if (TDW.Ledger) TDW.Ledger.update();
  }
  function refreshPanel() { if (state.mode === 'edit') Panel.render(state.analysis, state.draft, state.words); else Panel.updateAI(); }

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
    keepTopClear();
  }
  // The draft fits on screen: the first lines must never sit under the toolbar.
  function fitsOnScreen() {
    const sf = $('surface');
    if (!sf) return true;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const cover = parseFloat(root.style.getPropertyValue('--sheet-cover')) || 0;
    return sf.getBoundingClientRect().height + 180 < vh - cover;
  }
  function keepTopClear() { if (window.scrollY > 0 && fitsOnScreen()) window.scrollTo(0, 0); }
  function twScroll() {
    if (fitsOnScreen()) { keepTopClear(); return; }
    Editor.typewriterScroll();
  }

  // Focus remembers whether the library was open, to bring it back with Studio.
  let libraryBeforeFocus = null;

  function setMode(m, opts) {
    const o = opts || {};
    if (m === 'edit') {
      if (!o.noLibrary && libraryBeforeFocus && !isNarrow()) Library.show({ transient: true });
      libraryBeforeFocus = null;
      Inspector.show(o.tab || 'review', { detent: o.detent });
      fitPanes('inspector');
    } else {
      Inspector.hide({ velocity: o.velocity });
      if (!o.keepLibrary && !isNarrow()) {
        libraryBeforeFocus = Library.isOpen();
        Library.hide({ transient: true });
      }
    }
    applyMode(m === 'edit' ? 'edit' : 'write');
  }

  let modeSeg = null;
  function applyMode(m) {
    const changed = state.mode !== m;
    const anchor = changed ? captureAnchor() : null;
    state.mode = m;
    root.dataset.mode = m;
    if (modeSeg) modeSeg.set(m);
    updateChrome();
    if (!changed) { refresh(); return; }
    updateAids();
    if (m !== 'edit') {
      Popover.hide();
      Panel.closeResults();
    }
    refresh();
    updateBackspace();
    each((x) => x.onMode && x.onMode(m));
    restoreAnchor(anchor);
    const ae = document.activeElement;
    if (m === 'write' || !(ae && ae !== document.body && (ae.closest('#inspector') || ae.closest('#library')))) {
      Editor.focus();
      requestAnimationFrame(() => { if (!document.activeElement || document.activeElement === document.body || document.activeElement.closest('[inert]')) Editor.focus(); });
    }
  }

  // A tool asks for its tab: Studio opens on it (Focus leaves the library where it is).
  function openTab(name, opts) {
    const o = opts || {};
    if (state.mode !== 'edit' || !Inspector.isOpen()) setMode('edit', { tab: name, noLibrary: true, detent: o.detent });
    else Inspector.select(name, { keepPushed: o.keepPushed });
  }

  function onTab() {
    Popover.hide();
    refresh();
    if (Inspector.tab() === 'draft') Library.renderDraftTab();
    each((x) => x.onTab && x.onTab(Inspector.tab()));
  }

  // Both side panes need room: on a narrow computer screen, opening one folds the other.
  function fitPanes(priority) {
    if (isNarrow()) return;
    const room = window.innerWidth - (Library.isOpen() ? 264 : 0) - (Inspector.isOpen() ? 352 : 0);
    if (room >= 620) return;
    if (priority === 'library' && Inspector.isOpen()) setMode('write', { keepLibrary: true });
    else if (Library.isOpen()) { libraryBeforeFocus = true; Library.hide({ transient: true }); }
    updateChrome();
  }

  // Focus: both panes away. The toolbar fades back until you reach for it.
  function updateChrome() {
    const focus = !isNarrow() && !Library.isOpen() && !Inspector.isOpen();
    root.classList.toggle('is-focus', focus);
  }

  let movedRaf = 0;
  function layoutMoved() {
    if (movedRaf) return;
    movedRaf = requestAnimationFrame(() => {
      movedRaf = 0;
      const b = opt('Bubble');
      if (b && b.reposition) b.reposition();
      const lg = opt('Ledger');
      if (lg && lg.reposition) lg.reposition();
      const bl = opt('Blocks');
      if (bl && bl.hideHandle) bl.hideHandle();
    });
  }

  /* ---------- No backspace ---------- */
  function stageSaysNo(d) {
    const c = Sync.config();
    const schema = (c && c.schema) || {};
    return Object.keys(d.props || {}).some((name) => {
      const t = schema[name] && schema[name].type;
      const v = d.props[name];
      return (!t || t === 'select' || t === 'status') && typeof v === 'string' && /no backspace/i.test(v);
    });
  }
  function backspaceOff(d) {
    if (!d) return false;
    if (typeof d.nb === 'boolean') return d.nb;
    return !!state.settings.noBackspace && stageSaysNo(d);
  }
  const noBackspace = () => state.mode === 'write' && backspaceOff(state.draft);

  function updateBackspace() {
    const on = backspaceOff(state.draft);
    const b = $('nb-btn');
    b.setAttribute('aria-pressed', String(on));
    b.replaceChildren(icon(on ? 'penOff' : 'pen'));
    tip(b, on ? 'No backspace: on. Typing only moves forward in Focus' : 'No backspace: off');
    b.setAttribute('aria-label', 'No backspace');
    root.classList.toggle('no-backspace', on);
  }
  function setBackspaceOff(on) {
    const d = state.draft;
    if (!d) return;
    d.nb = on === (state.settings.noBackspace && stageSaysNo(d)) ? null : on;
    Store.saveDraft(d);
    Account.noteDraft(d);
    updateBackspace();
    Editor.focus();
  }
  // Backspace was pressed with the pen off: the pen says so, where it lives.
  let alertTimer = 0;
  function blocked() {
    if (performance.now() - Sound.lastKeyAt > 60) Sound.play('back', BUMP);
    const b = $('nb-btn');
    b.classList.remove('is-pulse');
    void b.offsetWidth;
    b.classList.add('is-pulse');
    root.classList.add('is-alert');
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { root.classList.remove('is-alert'); b.classList.remove('is-pulse'); }, 1400);
  }

  /* ---------- The toolbar ---------- */
  let titleRaf = 0;
  // No heading: the first sentence, cut cleanly at a word; "Untitled" when empty.
  function plainTitle(text) {
    const flat = String(text || '').replace(/[#*_>`~\[\]]/g, '').replace(/\s+/g, ' ').trim();
    if (!flat) return 'Untitled';
    const m = flat.match(/^.*?[.!?](?=\s|$)/);
    let s = m ? m[0] : flat;
    const max = 44;
    if (s.length > max) { s = s.slice(0, max + 1); s = s.slice(0, Math.max(s.lastIndexOf(' '), 12)).replace(/[,;:\s-]+$/, '') + '…'; }
    return s;
  }
  function updateTitle() {
    if (titleRaf) return;
    titleRaf = requestAnimationFrame(() => {
      titleRaf = 0;
      const d = state.draft;
      const text = d ? Editor.getText() : '';
      let t = d ? Store.displayTitle(Object.assign({}, d, { text })) : '';
      const untitled = !!d && !String(d.title || '').trim() && !/^\s*#{1,6}\s+\S/.test(text);
      if (untitled) t = plainTitle(text);
      else if (d && !/^\s*#{1,6}\s+\S/.test(text) && String(d.title || '').trim()) t = String(d.title).trim();
      $('tb-title').textContent = t;
      $('tb-title').classList.toggle('is-untitled', t === 'Untitled' || t === 'Untitled draft');
      document.title = (t && t !== 'Untitled' && t !== 'Untitled draft' ? t + ' – ' : '') + 'Ten Dollar Words';
    });
  }

  function buildToolbar() {
    modeSeg = UI.segmented({
      label: 'Mode', value: state.mode, class: 'mode-seg',
      options: [
        { value: 'write', label: 'Write', tip: 'Write: just the page. Folds the library and inspector away' },
        { value: 'edit', label: 'Review', tip: 'Review: the inspector opens with the fixes marked on the page' }
      ],
      onChange: (v) => (v === 'edit' ? setMode('edit', { tab: 'review' }) : setMode('write'))
    });
    $('mode-slot').append(modeSeg);
    $('btn-insp').append(icon('inspector'));
    $('btn-insp').addEventListener('click', toggleInspector);
    $('btn-new').append(icon('compose'));
    $('btn-new').addEventListener('click', () => { newDraft(''); Editor.focus(); });
    tip($('btn-new'), 'New draft');
    $('format-btn').addEventListener('click', (e) => formatMenu(e.currentTarget));
    $('pb-format').addEventListener('click', (e) => formatMenu(e.currentTarget));
    $('nb-btn').addEventListener('click', () => setBackspaceOff(!backspaceOff(state.draft)));
    $('pb-review').append(icon('review'), el('span', { text: 'Review' }));
    $('pb-review').addEventListener('click', () => (Inspector.isOpen() ? setMode('write', { keepLibrary: true }) : setMode('edit', { tab: 'review' })));
    tip($('format-btn'), 'Format: sets the line length for each platform');
    tip($('btn-back'), 'All drafts');
  }

  function toggleInspector() {
    if (Inspector.isOpen()) setMode('write', { keepLibrary: true });
    else setMode('edit', { tab: Inspector.tab(), noLibrary: true });
  }

  /* ---------- Editor events ---------- */
  let writeRaf = 0;
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
    markDirty();
    scheduleList();
    syncEdit();
    Popover.hide();
    updateAids();
    updateTitle();
    Panel.renderMoney(d, words);
    if (words < prev) Panel.refund(prev - words);
    const budget = d.budget;
    if (words > prev && ((prev * 10 <= budget * 0.9 && words * 10 > budget * 0.9) || (prev * 10 <= budget && words * 10 > budget))) Sound.play('bell');
    if (state.mode === 'edit') {
      if (text.length < 15000) refresh();
      else { clearTimeout(analyzeTimer); analyzeTimer = setTimeout(refresh, 150); Editor.render(); }
      if (Inspector.tab() === 'draft') Library.renderDraftTab();
    } else {
      Editor.render();
      if (!writeRaf) {
        writeRaf = requestAnimationFrame(() => {
          writeRaf = 0;
          if (state.settings.typewriterScroll) twScroll();
        });
      }
    }
  }

  function onCaretMove() {
    if (state.mode === 'edit') {
      const s = Editor.getSelection();
      if (s.start === s.end) Popover.showAt(s.end);
    } else if (state.settings.typewriterScroll && !pointerSelecting && performance.now() - lastPointerAt > 600) {
      const s = Editor.getSelection();
      if (s.start === s.end) requestAnimationFrame(twScroll);
    }
    each((m) => m.onSelect && m.onSelect(Editor.getSelection()));
  }

  function clipboard(slice) {
    const f = state.draft ? Formats.get(state.draft.format) : Formats.get('basic');
    if (f.social) return { text: Formats.render(slice, f).text };
    return { text: Formats.render(slice, 'plain').text, html: Formats.toHTML(slice) };
  }

  function onDocKeydown(e) {
    const mod = (e.metaKey || e.ctrlKey);
    const key = String(e.key || '').toLowerCase();
    const dialogOpen = !!document.querySelector('dialog[open]');
    if (mod && !e.altKey && !e.shiftKey && key === 'e') {
      e.preventDefault();
      if (!dialogOpen) setMode(state.mode === 'write' ? 'edit' : 'write');
    } else if (mod && !e.altKey && !e.shiftKey && (e.code === 'Backslash' || key === '\\')) {
      e.preventDefault();
      if (!dialogOpen) { Library.toggle(); updateChrome(); }
    } else if (mod && e.altKey && !e.shiftKey && e.code === 'KeyI') {
      e.preventDefault();
      if (!dialogOpen) toggleInspector();
    } else if (mod && !e.altKey && !e.shiftKey && key === ',') {
      e.preventDefault();
      if (!dialogOpen) Dialogs.openSettings();
    } else if (mod && !e.altKey && key === 's' && !e.shiftKey) {
      e.preventDefault();
      state.dirty = state.dirty || !!state.draft;
      if (saveNow()) UI.toast('Saved');
    } else if (e.key === 'Escape' && !dialogOpen && !UI.menuOpen() && !e.defaultPrevented) {
      if (Popover.isOpen() && document.activeElement === editor) Popover.hide();
      else if (isNarrow() && Inspector.isOpen() && document.activeElement === editor) setMode('write', { keepLibrary: true });
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
      if (!e.metaKey && !e.ctrlKey && !NAV_KEYS.has(e.key)) root.classList.add('is-typing');
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
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', (e) => {
      const unsaved = !saveNow() || (Store.isMemoryOnly() && !!state.draft && !!state.draft.text.trim());
      if (unsaved) { e.preventDefault(); e.returnValue = ''; }
    });
    window.addEventListener('resize', () => { fitPanes('library'); updateChrome(); });
    UI.narrowQuery.addEventListener('change', () => {
      if (isNarrow() && state.mode === 'edit' && !Inspector.isOpen()) applyMode('write');
      updateChrome();
      setThemeColor();
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    TDW.mockAI = false; // tests switch the fake AI on from JS
    state.settings = normalizeLook(Store.getSettings(), !Store.getStoredSettings());
    applySettings();
    Sound.init(state.settings);
    buildToolbar();
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
    Inspector.init({
      onTab,
      onClose: (o) => setMode('write', { keepLibrary: true, velocity: o && o.velocity }),
      onMove: layoutMoved
    });
    Library.init();
    Panel.init();
    Popover.init();
    Dialogs.init();
    each((m) => m.init && m.init());
    Store.setBusyCheck(() => state.dirty);
    Store.onExternal(onExternal);
    Sync.init({ onRemoteText, onRemoteDelete, onList, onStatus: () => Library.renderSync(), onLoading, current: () => state.draft });
    Account.init({ onApplied: onAccountApplied, onSignedOut });

    const lastId = Store.getLast();
    const first = (lastId && Store.getDraft(lastId)) || Store.listDrafts()[0] || null;
    if (first) openDraft(first); else newDraft('');

    applyMode('write');
    updateChrome();
    wire();
    if (Sync.isConnected()) Sync.start();
    Library.renderSync();

    // PREVIEW: no service worker while this direction lives in app/designs/ (the root app's
    // worker serves these files network-first). Remove the `false &&` when it becomes app/.
    if (false && location.protocol === 'https:' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    document.fonts.ready.then(() => Editor.render());
    darkScheme.addEventListener('change', () => {
      if (state.settings.theme !== 'system') return;
      applySettings();
      Editor.render();
    });
    Spell.load('dict/en-us.txt?v=' + APP_VERSION).then(() => {
      Spell.setPersonal(state.settings.dictionary);
      refresh();
    }).catch(() => {});
    requestAnimationFrame(() => root.classList.add('is-ready'));
  }

  function insertAtCaret(md) {
    if (state.loading || !md) return;
    Editor.insertMd(md);
  }

  TDW.App = {
    state, APP_VERSION, SAMPLE_TEXT, masked, publishText, insertAtCaret, refresh, captureAnchor, restoreAnchor,
    noBackspace: () => noBackspace(), markDirty, syncEdit, updateAids,
    setMode, openTab, toggleInspector, saveNow, openDraft, newDraft, draftDeleted, analyze, setFormat, formatMenu,
    updateSettings, toggleHighlight, hiddenTypes, setBudget, setIntent, setProp, edit, cut, insertSample,
    addWord, removeWord, refreshPanel, updateSyncStatus: () => Library.renderSync(), openSettings: (section) => Dialogs.openSettings(section),
    syncChanged() { onList(); Library.renderSync(); },
    setBackspaceOff, countNow, backspaceOff, fitPanes, layoutMoved, updateChrome
  };
  boot();
})();
