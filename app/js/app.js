/* App state, events, and boot. Loaded last.
   One page, one mode: Review (⌘E, or setMode('edit')) is a lens that brings pencil marks onto
   the text and notes into the margin. The page itself never moves when it turns on or off. */
(function () {
  'use strict';
  const TDW = window.TDW;
  const { Engine, Editor, UI, Store, Sound, Dialogs, Spell, Sync, Formats, Account, Marks } = TDW;
  const opt = (name) => TDW[name] || null;

  const APP_VERSION = '3.1.1';
  const SAMPLE_TEXT = [
    'Every word you type costs ten dollars. That sounds harsh, but it is really the fastest way to learn to cut.',
    'Most people write long sentences because they are afraid that short ones will make them look simple to readers.',
    'This sentence is here to show you what happens when a writer keeps adding clauses and qualifications that the reader has to hold in their head while they wait for the point, which arrives much too late.',
    'The report was written by a committee in order to utilize every possible word.',
    "I think you already know what to do. Delete what doesn't earn its keep and watch the register quietly drop."
  ].join('\n');
  const TYPES = ['spelling', 'veryHard', 'hard', 'complex', 'passive', 'adverb', 'qualifier'];
  const PLACEHOLDER = 'Start writing. Every word costs $10.';
  const BUMP = { pan: 0, gain: 0.6 };
  const FOLD_TITLE = {
    phone: 'On a phone, LinkedIn shows everything before this mark. The rest hides behind “…see more”.',
    desktop: 'On a computer, LinkedIn shows everything before this mark. The rest hides behind “…see more”.'
  };
  const LENS_FADE = 160;

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const editor = $('editor');

  const state = {
    mode: 'write', draft: null, analysis: null, words: 0, dirty: false,
    settings: null, aiBusy: false, cycle: { type: null, index: -1 }, loading: false
  };

  /* ---------- Settings and theme ---------- */
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  // The old skins map onto two themes: Night desk is dark, everything else follows the system.
  function themeSetting(s) {
    if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto') return s.theme;
    return s.skin === 'night' && !s.autoNight ? 'dark' : 'auto';
  }
  const themeOf = (s) => { const t = themeSetting(s); return t === 'auto' ? (darkScheme.matches ? 'dark' : 'light') : t; };
  const fontOf = (s) => (s.pageFont === 'typewriter' ? 'typewriter' : 'serif');

  function setThemeColor() {
    const v = getComputedStyle(root).getPropertyValue('--paper').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && v) meta.setAttribute('content', v);
  }

  function applySettings() {
    const s = state.settings;
    root.dataset.theme = themeOf(s);
    root.dataset.font = fontOf(s);
    root.dataset.marks = s.marks === 'highlighter' ? 'highlighter' : 'pencil';
    root.style.setProperty('--text-offset', (Number(s.textSize) || 0) + 'px');
    root.classList.toggle('tw-scroll', !!s.typewriterScroll);
    setThemeColor();
  }

  function updateSettings(patch) {
    if ('autoNight' in patch && !('theme' in patch)) patch.theme = patch.autoNight ? 'auto' : themeSetting(Object.assign({}, state.settings, { theme: null, autoNight: false }));
    if ('skin' in patch && !('theme' in patch)) patch.theme = patch.skin === 'night' ? 'dark' : 'auto';
    Object.assign(state.settings, patch);
    Store.saveSettings(state.settings);
    applySettings();
    if ('marks' in patch) refreshPanel();
    if ('sound' in patch) Sound.setProfile(patch.sound);
    if ('volume' in patch) Sound.setVolume(patch.volume);
    if ('effectSounds' in patch) Sound.setEffects(patch.effectSounds);
    if ('noBackspace' in patch) updateBackspace();
    if ('paragraphCost' in patch) refreshPanel();
    if ('bench' in patch && opt('Bench')) TDW.Bench.render();
    if ('theme' in patch || 'pageFont' in patch || 'textSize' in patch || 'skin' in patch || 'autoNight' in patch) {
      Editor.render();
      requestAnimationFrame(() => { each((m) => m.onLayout && m.onLayout()); });
    }
    if ('highlights' in patch || 'fixHighlights' in patch) { Editor.setHidden(hiddenTypes()); if (state.mode === 'edit') refresh(); }
  }

  function reloadSettings() {
    state.settings = Store.getSettings();
    applySettings();
    Sound.setProfile(state.settings.sound);
    Sound.setVolume(state.settings.volume);
    Sound.setEffects(state.settings.effectSounds !== false);
    Spell.setPersonal(state.settings.dictionary);
    TDW.Keys.load(state.settings.keys);
    Editor.setHidden(hiddenTypes());
    updateBackspace();
    if (opt('Bench')) TDW.Bench.render();
    if (state.mode === 'edit') refresh();
    else Editor.render();
  }

  const hiddenTypes = () => (state.settings.fixHighlights === false ? TYPES.slice() : TYPES.filter((t) => state.settings.highlights[t] === false));

  function toggleHighlight(type) {
    state.settings.highlights[type] = state.settings.highlights[type] === false;
    Store.saveSettings(state.settings);
    Editor.setHidden(hiddenTypes());
    if (state.mode === 'edit') refresh();
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
  let saveFailed = false;

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
      if (saveFailed) { saveFailed = false; spine('setSaveError', false); }
      if (TDW.Drafts && TDW.Drafts.isOpen()) TDW.Drafts.render(); // a docked sidebar follows the title
      return true;
    }
    if (!saveFailed) UI.toast('Not saved: storage is full. Delete old drafts to make room.');
    saveFailed = true;
    spine('setSaveError', true);
    return false;
  }

  function syncEdit() {
    const d = state.draft;
    if (d && !d.localOnly && Sync.isConnected()) Sync.noteEdit(d.id);
  }

  /* ---------- Undo for what isn't typing ----------
     ⌘Z walks back through the text (the editor's own history) and through what was done to the
     draft in between: its format, budget, stage, backspace switch, an ignored note, a deleted
     draft. Whichever happened last goes first. */
  const acts = [];
  let undoing = false;
  function did(label, undo, draftId) {
    if (undoing) return;
    acts.push({ label, undo, at: Date.now(), draftId: draftId === undefined ? (state.draft ? state.draft.id : null) : draftId });
    if (acts.length > 60) acts.shift();
  }
  function undoAct(sinceEdit) {
    let a = acts[acts.length - 1];
    while (a && a.draftId && (!state.draft || a.draftId !== state.draft.id)) { acts.pop(); a = acts[acts.length - 1]; } // another draft's: gone with it
    if (!a || a.at <= sinceEdit) return false;
    acts.pop();
    undoing = true;
    let r;
    try { r = a.undo(); } finally { undoing = false; }
    if (r === false) return undoAct(sinceEdit); // already put back another way
    UI.toast('Undone: ' + a.label);
    return true;
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

  // The aids: X post windows (always); the LinkedIn fold and text past a limit (while reviewing).
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
        const x = Formats.post(text, p.start, p.end, f);
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
        return { words: Engine.countWords(shown), length: Formats.post(shown, 0, shown.length, f).length, limit: f.limit };
      } : null,
      addPost: UI.device.touch
    });
  }

  function applyFormat() {
    const f = Formats.get(state.draft.format);
    root.dataset.format = f.key;
    updateAids();
    Editor.render();
    requestAnimationFrame(() => each((m) => m.onLayout && m.onLayout()));
  }

  function setFormat(key) {
    const d = state.draft;
    const from = Formats.get(d.format);
    const to = Formats.get(key);
    if (from === to) return;
    const anchor = captureAnchor();
    const was = { format: from.key, budget: d.budget };
    did('format', () => { if (state.draft !== d) return; setFormat(was.format); d.budget = was.budget; Store.saveDraft(d); Account.noteDraft(d); refreshPanel(); });
    if (d.budget === Formats.budgetOf(from, state.settings)) d.budget = Formats.budgetOf(to, state.settings);
    d.format = to.key;
    Store.saveDraft(d);
    Account.noteDraft(d);
    applyFormat();
    if (state.mode === 'edit') refresh(); else refreshPanel();
    restoreAnchor(anchor);
    Editor.focus();
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
    Editor.setText(d.text, { ann: d.ann });
    state.words = countNow();
    each((m) => m.load && m.load(d));
    applyFormat();
    updateBackspace();
    if (state.mode === 'edit') refresh(); else refreshPanel();
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
      Editor.setText('');
      state.words = 0;
      if (state.mode === 'edit') refresh(); else refreshPanel();
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

  // byHand: the writer set it (so ⌘Z takes it back); a challenge moving the budget isn't that.
  function setBudget(v, byHand) {
    const d = state.draft;
    const was = d.budget;
    if (byHand && was !== v) did('budget', () => { if (state.draft === d) setBudget(was); });
    state.draft.budget = v;
    markDirty();
    saveNow();
    Account.noteDraft(state.draft);
    refreshPanel();
  }

  function setIntent(text) {
    state.draft.intent = text;
    markDirty();
    saveNow();
    Account.noteDraft(state.draft);
  }

  function setProp(d, name, value) {
    const was = d.props[name];
    did(name, () => { if (Store.getDraft(d.id) === d) { setProp(d, name, was); if (TDW.Drafts) TDW.Drafts.render(); } }, null);
    d.props[name] = value;
    const c = Sync.config();
    const t = c && c.schema && c.schema[name] && c.schema[name].type;
    if (t === 'status' || t === 'select') d.nb = null; // a new stage decides backspace again
    Store.saveDraft(d);
    Account.noteDraft(d);
    Sync.noteProp(d.id, name);
    if (d === state.draft) { updateBackspace(); refreshPanel(); }
  }

  // Every module the app hands the open draft to, in the order they set up.
  const MODULES = ['Spine', 'Margin', 'Review', 'Alts', 'Menu', 'Overflow', 'Lab', 'Challenges', 'Desk', 'Blocks', 'Bubble', 'Notes', 'Links', 'Bench', 'Palette'];
  function each(fn) { for (const n of MODULES) { const m = opt(n); if (m) try { fn(m); } catch (e) { console.error(n, e); } } }
  function spine(fn, arg) { const s = opt('Spine'); if (s && s[fn]) s[fn](arg); }

  // Words leaving the page by a fix: their letters burst and the saving flies to the spend.
  const shotOf = (start, end, opts) => (state.mode === 'edit' && !(opts && opts.silent) && opt('Fx') ? TDW.Fx.capture([{ start, end }]) : null);
  function paid(saved, shot, opts) {
    if (saved <= 0 || state.mode !== 'edit' || (opts && opts.silent)) return;
    if (shot && opt('Fx')) TDW.Fx.cut(shot, saved);
    Sound.play('coin');
  }

  function edit(start, end, text, opts) {
    const before = state.words;
    const shot = shotOf(start, end, opts);
    Editor.replaceRange(start, end, text);
    const saved = before - state.words;
    paid(saved, shot, opts);
    return saved;
  }

  function cut(start, end, sentenceStart, opts) {
    const before = state.words;
    const shot = shotOf(start, end, opts);
    Editor.cut(start, end, sentenceStart);
    const saved = before - state.words;
    paid(saved, shot, opts);
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
    updateAids();
    if (state.mode === 'edit') refresh();
    else { Editor.render(); refreshPanel(); }
  }

  function onList() {
    if (Dialogs.isDraftsOpen()) Dialogs.renderDraftList();
    if (!state.draft || state.loading) return;
    updateBackspace();
    refreshPanel();
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
    if (ch.key === 'tdw.syncWant') return;
    if (ch.key === 'tdw.settings') { reloadSettings(); return; }
    if (ch.key === 'tdw.geminiKey') { refreshPanel(); return; }
    if (ch.conflict) {
      if (Date.now() - conflictWarnedAt > 60000) UI.toast('This draft is also open in another tab. Type in one tab at a time, or one will overwrite the other.');
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
  function onAccountApplied(ch) {
    if (ch.settings) reloadSettings();
    if (ch.notion) Sync.adopt(ch.notion.prev);
    const d = state.draft;
    if (d && ch.drafts.includes(d) && !state.loading) {
      if (d.text === Editor.getText() && !state.dirty) Editor.setAnnotations(d.ann);
      each((m) => m.reload && m.reload(d));
      applyFormat();
      updateBackspace();
    }
    refreshPanel();
    onList();
    Dialogs.refreshSettings();
  }

  function onSignedOut(message) {
    UI.toast(message, { label: 'Sign in', run: () => Dialogs.openSettings('account') });
  }

  /* ---------- Analysis and the lens ---------- */
  const isSentence = (i) => i.type === 'hard' || i.type === 'veryHard';
  let analyzeTimer = 0;
  let lensTimer = 0;

  // A fresh analysis: marks on the text (when reviewing), notes in the margin, the spine.
  function refresh() {
    clearTimeout(analyzeTimer);
    state.analysis = analyze(masked());
    if (opt('Review') && TDW.Review.screen) TDW.Review.screen(state.analysis); // notes you ignored stay gone
    if (state.mode === 'edit' && !(opt('Lab') && TDW.Lab.isRunning && TDW.Lab.isRunning())) {
      Editor.setMarks(state.analysis.issues.filter(isSentence), state.analysis.issues.filter((i) => !isSentence(i)));
    } else Editor.setMarks([], []);
    Editor.setHidden(hiddenTypes());
    Editor.render();
    refreshPanel();
  }

  // The spine and the margin, from what we know now.
  function refreshPanel() {
    if (!state.draft) return;
    spine('render');
    if (opt('Bench')) TDW.Bench.render();
    if (opt('Review')) TDW.Review.render(state.mode === 'edit' ? state.analysis : null);
  }

  // Typewriter scroll: only once the draft is longer than the screen, so a short draft stays put under the spine.
  function twScroll() {
    const sheet = $('surface');
    if (!sheet) return;
    const top = sheet.getBoundingClientRect().top + window.scrollY;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (top + sheet.offsetHeight + 34 < vh * 0.9) return;
    Editor.typewriterScroll();
  }

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

  // 'edit' turns the lens on, 'write' takes it off. The marks cross-fade; the page stays put.
  function setMode(m) {
    m = m === 'edit' ? 'edit' : 'write';
    clearTimeout(lensTimer);
    const was = state.mode;
    const anchor = was !== m ? captureAnchor() : null;
    state.mode = m;
    root.dataset.mode = m;
    updateAids();
    if (m === 'edit') {
      root.classList.add('lens-pre');
      refresh();
      requestAnimationFrame(() => requestAnimationFrame(() => { root.classList.remove('lens-pre'); root.classList.add('lens'); }));
    } else {
      clearTimeout(analyzeTimer);
      root.classList.remove('lens');
      const clear = () => { if (state.mode === 'write') { Editor.setMarks([], []); Editor.render(); } };
      if (was === 'edit' && !UI.reducedMotion()) lensTimer = setTimeout(clear, LENS_FADE); else clear();
      refreshPanel();
    }
    updateBackspace();
    each((x) => x.onMode && x.onMode(m));
    if (was !== m) spine('render');
    if (anchor) { restoreAnchor(anchor); requestAnimationFrame(() => { restoreAnchor(anchor); requestAnimationFrame(() => restoreAnchor(anchor)); }); for (const ms of [60, 180, 400]) setTimeout(() => { if (state.mode === m) restoreAnchor(anchor); }, ms); }
  }

  const toggleLens = () => setMode(state.mode === 'edit' ? 'write' : 'edit');

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

  function backspaceOff(d) {
    if (!d) return false;
    if (typeof d.nb === 'boolean') return d.nb;
    return !!state.settings.noBackspace && stageSaysNo(d);
  }

  // Backspace is blocked while you write; reviewing can always delete.
  const noBackspace = () => state.mode === 'write' && backspaceOff(state.draft);

  function updateBackspace() {
    root.classList.toggle('no-backspace', backspaceOff(state.draft));
    spine('render');
  }

  function setBackspaceOff(on) {
    const d = state.draft;
    if (!d) return;
    const wasNb = d.nb;
    did('no backspace', () => { if (state.draft !== d) return; d.nb = wasNb; Store.saveDraft(d); Account.noteDraft(d); updateBackspace(); });
    d.nb = on === (state.settings.noBackspace && stageSaysNo(d)) ? null : on;
    Store.saveDraft(d);
    Account.noteDraft(d);
    blockWarned = false;
    updateBackspace();
    Editor.focus();
    UI.toast(on ? 'No backspace: on for this draft' : 'No backspace: off');
  }

  function blocked() {
    if (performance.now() - Sound.lastKeyAt > 60) Sound.play('back', BUMP);
    spine('nudgeBackspace');
    if (blockWarned) return;
    blockWarned = true;
    UI.toast('Backspace is off while you write. Review (' + UI.keys(TDW.Keys.combo('review') || '⌘E') + ') can delete.');
  }

  /* ---------- Editor events ---------- */
  let writeRaf = 0;
  let pointerSelecting = false;
  let lastPointerAt = 0;
  let typingTimer = 0;

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
    syncEdit();
    updateAids();
    if (state.mode === 'edit') {
      if (text.length < 15000) refresh();
      else {
        clearTimeout(analyzeTimer);
        analyzeTimer = setTimeout(refresh, 150);
        Editor.render();
        spine('render');
      }
      const budget = d.budget;
      if (words > prev && ((prev * 10 <= budget * 0.9 && words * 10 > budget * 0.9) || (prev * 10 <= budget && words * 10 > budget))) Sound.play('bell');
    } else {
      Editor.render();
      spine('render');
      if (!writeRaf) {
        writeRaf = requestAnimationFrame(() => {
          writeRaf = 0;
          if (state.settings.typewriterScroll) twScroll();
        });
      }
    }
    if (words < prev) spine('refund', prev - words);
  }

  function onCaretMove() {
    if (state.mode !== 'edit' && state.settings.typewriterScroll && !pointerSelecting && performance.now() - lastPointerAt > 600) {
      const s = Editor.getSelection();
      if (s.start === s.end) requestAnimationFrame(() => twScroll());
    }
    each((m) => m.onSelect && m.onSelect(Editor.getSelection()));
  }

  function clipboard(slice) {
    const f = state.draft ? Formats.get(state.draft.format) : Formats.get('basic');
    if (f.social) return { text: Formats.render(slice, f).text };
    return { text: Formats.render(slice, 'plain').text, html: Formats.toHTML(slice) };
  }

  function wireKeys() {
    TDW.Keys.on('review', () => toggleLens());
    TDW.Keys.on('save', () => {
      state.dirty = state.dirty || !!state.draft;
      if (saveNow()) UI.toast(Sync.isConnected() ? 'Saved, syncing to Notion' : 'Saved');
    });
  }

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
      if (!e.metaKey && !e.ctrlKey && !/^(Shift|Alt|Meta|Control|Escape|Tab)$/.test(e.key)) {
        root.classList.add('is-typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => root.classList.remove('is-typing'), 1600);
      }
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
      onCaretMove();
    });
    editor.addEventListener('keyup', (e) => { if (/^(Arrow|Home|End|Page)/.test(e.key)) onCaretMove(); });
    wireKeys();
    // ⌘Z works from anywhere on the page, not only with the caret in the text.
    document.addEventListener('keydown', (e) => {
      const mod = UI.device.apple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (!mod || e.altKey || String(e.key).toLowerCase() !== 'z' || e.defaultPrevented) return;
      const t = e.target;
      if (t === editor || (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], dialog'))) return;
      e.preventDefault();
      if (e.shiftKey) Editor.redo(); else Editor.undo();
    });
    let last = null;
    document.addEventListener('mousemove', (e) => {
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= 3) return;
      last = { x: e.clientX, y: e.clientY };
      if (root.classList.contains('is-typing')) { clearTimeout(typingTimer); root.classList.remove('is-typing'); }
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', (e) => {
      const unsaved = !saveNow() || (Store.isMemoryOnly() && !!state.draft && !!state.draft.text.trim());
      if (unsaved) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    TDW.mockAI = false; // tests switch the fake AI on from JS

    state.settings = Store.getSettings();
    applySettings();
    Sound.init(state.settings);
    TDW.Keys.init(state.settings.keys);

    Editor.init({
      root: editor, surface: $('surface'), under: $('under'), aids: $('aids'),
      hooks: {
        onChange: onInput,
        onSelect: () => { if (!pointerSelecting) onCaretMove(); else each((m) => m.onSelect && m.onSelect(Editor.getSelection())); },
        canDelete: () => !noBackspace(),
        beforeUndo: (at) => undoAct(at),
        onBlocked: blocked,
        onNote: (ids) => opt('Notes') && TDW.Notes.openPins(ids),
        clipboard
      }
    });
    Editor.setPlaceholder(PLACEHOLDER);
    Dialogs.init();
    each((m) => m.init && m.init());
    Store.setBusyCheck(() => state.dirty);
    Store.onExternal(onExternal);
    Sync.init({ onRemoteText, onRemoteDelete, onList, onStatus: () => spine('renderSync'), onLoading, current: () => state.draft });
    Account.init({ onApplied: onAccountApplied, onSignedOut });

    const lastId = Store.getLast();
    const first = (lastId && Store.getDraft(lastId)) || Store.listDrafts()[0] || null;
    if (first) openDraft(first);
    else newDraft('');

    setMode('write');
    wire();
    if (Sync.isConnected()) Sync.start();
    spine('renderSync');

    if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    document.fonts.ready.then(() => { Editor.render(); each((m) => m.onLayout && m.onLayout()); });
    darkScheme.addEventListener('change', () => { applySettings(); Editor.render(); });
    Spell.load('dict/en-us.txt?v=' + APP_VERSION).then(() => {
      Spell.setPersonal(state.settings.dictionary);
      if (state.mode === 'edit') refresh();
    }).catch(() => {});
  }

  function insertAtCaret(md) {
    if (state.loading || !md) return;
    Editor.insertMd(md);
  }

  TDW.App = {
    state, APP_VERSION, SAMPLE_TEXT, masked, publishText, insertAtCaret, refresh, captureAnchor, restoreAnchor,
    noBackspace: () => noBackspace(), markDirty, syncEdit, updateAids,
    setMode, toggleLens, saveNow, openDraft, newDraft, draftDeleted, analyze, setFormat,
    updateSettings, toggleHighlight, hiddenTypes, setBudget, setIntent, setProp, edit, cut, insertSample,
    addWord, removeWord, refreshPanel, updateSyncStatus: () => spine('renderSync'), openSettings: (section) => Dialogs.openSettings(section),
    syncChanged() { onList(); spine('renderSync'); },
    setBackspaceOff, countNow, backspaceOff, themeSetting, fontOf, did
  };
  boot();
})();
