/* Overflow: a per-draft scratch area for cut passages, notes, links, words you like, an outline.
   It lives in the inspector's Overflow tab. It isn't part of the post: no words, no $, no
   spelling. Markdown-lite, one paragraph per line, like the draft. In Notion it's one toggle
   block titled "Overflow" at the bottom of the page (see sync.js). */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const app = () => TDW.App;
  const UI = () => TDW.UI;

  const SOFT_CAP = 50 * 1024;
  const MD_TYPE = 'application/x-tdw-markdown';
  const SAVE_MS = 300;

  let area = null, countEl = null;
  let draft = null;
  let saveTimer = 0;
  let warned = false;

  const valueOf = (d) => String((d && d.overflow) || '');
  const isOpen = () => !!TDW.Inspector && TDW.Inspector.isOpen() && TDW.Inspector.tab() === 'overflow' && !TDW.Inspector.pushed();

  function build() {
    const { el } = UI();
    const host = TDW.Inspector.pane('overflow');
    area = el('textarea', {
      class: 'ov-text', spellcheck: 'false', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'sentences',
      'aria-label': 'Overflow: spare writing, notes and links for this draft',
      placeholder: 'Spare paragraphs, notes, links, an outline. They stay here, out of the post and out of the bill.'
    });
    area.addEventListener('input', () => { schedule(); count(); });
    area.addEventListener('keydown', onAreaKey);
    area.addEventListener('dragstart', onDragStart);
    area.addEventListener('blur', () => saveNow());
    countEl = el('span', { class: 'ov-count' });
    host.append(
      el('div', { class: 'ov-head' }, el('p', { class: 'rv-label', text: 'Kept beside this draft' }), countEl),
      area,
      el('p', { class: 'ov-foot hint', text: (UI().device.touch ? 'Select a line and drag it into the page to use it.' : UI().ctrlKeys('Ctrl+↩') + ' puts the paragraph at your caret on the page, or drag a selection in.') }));
  }

  function count() {
    const n = area.value.split('\n').filter((l) => l.trim()).length;
    countEl.textContent = n ? n + (n === 1 ? ' line' : ' lines') : '';
  }

  function open() {
    if (app()) app().openTab('overflow');
    requestAnimationFrame(() => { if (area) area.focus({ preventScroll: true }); });
  }
  function close() { if (isOpen()) app().setMode('write', { keepLibrary: true }); }
  function toggle() { if (isOpen()) close(); else open(); }

  // After a stash: the tab shows it if it's in front; otherwise a toast confirms it with a way there.
  function flash() {
    area.scrollTop = 0;
    if (isOpen()) {
      area.classList.remove('is-new');
      void area.offsetWidth;
      area.classList.add('is-new');
      return;
    }
    UI().toast('Moved to Overflow', { label: 'Show', run: open });
  }

  function schedule() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, SAVE_MS); }

  function write(d, value) {
    if (!d || valueOf(d) === value) return;
    d.overflow = value;
    if (value.length > SOFT_CAP && !warned) {
      warned = true;
      UI().toast('Overflow is over 50 KB. It still saves, but move what you won’t use somewhere else.');
    }
    if (d === (app() && app().state.draft)) { app().markDirty(); app().syncEdit(); }
    else if (TDW.Store) TDW.Store.saveDraft(d);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    if (!area || !draft) return;
    write(draft, area.value);
  }

  function show(d) {
    const v = valueOf(d);
    if (area.value === v) return;
    if (document.activeElement === area) {
      const at = area.selectionStart, end = area.selectionEnd;
      const d0 = v.length - area.value.length;
      area.value = v;
      const move = (i) => Math.max(0, Math.min(v.length, i + (i > 0 ? d0 : 0)));
      area.setSelectionRange(move(at), move(end));
    } else area.value = v;
    count();
  }

  function pickMd() {
    const v = area.value;
    let s = area.selectionStart, e = area.selectionEnd;
    if (e <= s) {
      s = v.lastIndexOf('\n', s - 1) + 1;
      e = v.indexOf('\n', area.selectionStart);
      if (e < 0) e = v.length;
    }
    return v.slice(s, e).replace(/^\n+|\n+$/g, '');
  }

  // Into the page as its own paragraph, after the line the page's caret is on.
  function usePick() {
    const md = pickMd();
    if (!md.trim()) return;
    const E = TDW.Editor;
    const text = E.getText();
    let at = E.getSelection().end;
    const lineStart = text.lastIndexOf('\n', at - 1) + 1;
    let lineEnd = text.indexOf('\n', at);
    if (lineEnd < 0) lineEnd = text.length;
    const lineEmpty = !text.slice(lineStart, lineEnd).trim();
    let ins = md;
    if (!lineEmpty) { at = lineEnd; ins = '\n' + md; }
    E.setCaret(at);
    app().insertAtCaret(ins);
  }

  function onAreaKey(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) { e.preventDefault(); usePick(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); saveNow(); TDW.Editor.focus(); }
  }

  function onDragStart(e) {
    const md = area.value.slice(area.selectionStart, area.selectionEnd);
    if (!md || !e.dataTransfer) return;
    try { e.dataTransfer.setData(MD_TYPE, md); } catch (_) { /* plain text still goes */ }
    e.dataTransfer.setData('text/plain', md);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function onDocKey(e) {
    if (!e.ctrlKey || e.metaKey || e.altKey || !e.shiftKey || e.code !== 'KeyO') return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    toggle();
  }

  TDW.Overflow = {
    init() {
      if (area) return;
      build();
      document.addEventListener('keydown', onDocKey);
      window.addEventListener('pagehide', saveNow);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    },
    load(d) {
      if (!area) return;
      if (draft && draft !== d) saveNow();
      draft = d;
      warned = valueOf(d).length > SOFT_CAP;
      area.value = valueOf(d);
      count();
    },
    reload(d) {
      if (!area || d !== draft) return;
      clearTimeout(saveTimer);
      show(d);
    },
    onMode() {},
    stash(md) {
      const s = String(md || '').replace(/^\n+|\s+$/g, '');
      const d = app() && app().state.draft;
      if (!s || !d) return;
      if (draft !== d) this.load(d);
      saveNow();
      const cur = valueOf(d);
      const next = cur.trim() ? s + '\n' + cur : s;
      area.value = next;
      count();
      write(d, next);
      flash();
    },
    keepLost(lost) {
      const d = app() && app().state.draft;
      const lines = (lost || []).map((a) => (a.options || []).map((o) => o.text).join(' / ')).filter(Boolean);
      if (!d || !lines.length) return;
      if (draft !== d) this.load(d);
      saveNow();
      const cur = valueOf(d);
      const next = (cur.trim() ? cur.replace(/\s+$/, '') + '\n' : '') + lines.join('\n');
      area.value = next;
      count();
      write(d, next);
    },
    isOpen, open, close, toggle
  };
})();
