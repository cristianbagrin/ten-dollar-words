/* Overflow: a per-draft scratch area on the tape (its Overflow tab) for cut passages, notes,
   links, words you like, an outline. It isn't part of the post: no words, no $, no spelling. Markdown-lite, one
   paragraph per line, like the draft. In Notion it's one toggle block titled "Overflow" at the
   bottom of the page (see sync.js). */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const $ = (id) => document.getElementById(id);
  const app = () => TDW.App;
  const UI = () => TDW.UI;

  const SOFT_CAP = 50 * 1024;
  const MD_TYPE = 'application/x-tdw-markdown';
  const SAVE_MS = 300;

  let panel = null, area = null;
  let draft = null;
  let saveTimer = 0;
  let warned = false;

  const isOpen = () => !!(TDW.Tape && TDW.Tape.view() === 'overflow');
  const valueOf = (d) => String((d && d.overflow) || '');

  /* ---------- Building ---------- */

  function build() {
    panel = $('tab-overflow');
    area = document.createElement('textarea');
    area.className = 'ov-text';
    area.spellcheck = false;
    area.setAttribute('autocomplete', 'off');
    area.setAttribute('autocorrect', 'off');
    area.setAttribute('autocapitalize', 'sentences');
    area.setAttribute('aria-label', 'Overflow: spare writing, notes and links for this draft');
    area.placeholder = 'Spare paragraphs, cut lines, links, an outline. They stay here, out of the post and off the bill.';
    area.addEventListener('input', () => schedule());
    area.addEventListener('keydown', onAreaKey);
    area.addEventListener('dragstart', onDragStart);
    area.addEventListener('blur', () => saveNow());
    const tip = document.createElement('p');
    tip.className = 'ov-tip';
    const mac = TDW.UI.device.apple;
    tip.textContent = TDW.UI.device.touch ? 'Not counted, not spellchecked. Each draft has its own.'
      : (mac ? '⌃↩' : 'Ctrl+Enter') + ' puts the paragraph under the caret back on the page. Or drag a selection in.';
    panel.append(area, tip);
    TDW.Tape.onView = (v) => { if (v !== 'overflow') saveNow(); };
  }

  /* ---------- Open and close ---------- */
  function setOpen(on, focusPage) {
    if (on) {
      TDW.Tape.setView('overflow');
      requestAnimationFrame(() => area.focus({ preventScroll: true }));
    } else {
      saveNow();
      if (isOpen()) { if (app().state.mode === 'edit') TDW.Tape.setView('receipt'); else TDW.Tape.fold(); }
      if (focusPage && TDW.Editor) TDW.Editor.focus();
    }
    if (TDW.Editor && TDW.Editor.placeAids) requestAnimationFrame(() => TDW.Editor.placeAids());
  }

  function toggle() { setOpen(!isOpen(), true); }

  // After a stash: say so, with a way to look (and ⌘Z to undo, which the editor already gives).
  function peek() {
    if (isOpen()) { flash(); return; }
    UI() && UI().toast('Moved to Overflow. ' + UI().keys('⌘Z') + ' brings it back.', { label: 'Show', run: () => { setOpen(true); flash(); } });
  }

  function flash() {
    area.scrollTop = 0;
    panel.classList.remove('is-new');
    void panel.offsetWidth;
    panel.classList.add('is-new');
  }

  /* ---------- Saving ---------- */

  function schedule() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_MS);
  }

  function write(d, value) {
    if (!d) return;
    if (valueOf(d) === value) return;
    d.overflow = value;
    if (value.length > SOFT_CAP && !warned) {
      warned = true;
      UI() && UI().toast("Overflow is getting long (over 50 KB). It still saves, but move what you won't use somewhere else.");
    }
    if (d === (app() && app().state.draft)) {
      app().markDirty();
      app().syncEdit();
    } else if (TDW.Store) {
      TDW.Store.saveDraft(d);
    }
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
      // Keep the caret near where it was while the text changes under it.
      const at = area.selectionStart, end = area.selectionEnd;
      const d0 = v.length - area.value.length;
      area.value = v;
      const move = (i) => Math.max(0, Math.min(v.length, i + (i > 0 ? d0 : 0)));
      area.setSelectionRange(move(at), move(end));
    } else area.value = v;
  }

  /* ---------- Using it on the page ---------- */

  // The paragraph at the caret, or the selection when there is one.
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
    const sel = E.getSelection();
    let at = sel.end;
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
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      usePick();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false, true);
    }
  }

  // Dragging a selection into the page: the editor's drop reads our markdown type.
  function onDragStart(e) {
    const md = area.value.slice(area.selectionStart, area.selectionEnd);
    if (!md || !e.dataTransfer) return;
    try { e.dataTransfer.setData(MD_TYPE, md); } catch (_) { /* no custom types: plain text still goes */ }
    e.dataTransfer.setData('text/plain', md);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function onDocKey(e) {
    if (!e.ctrlKey || e.metaKey || e.altKey || !e.shiftKey || e.code !== 'KeyO') return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    toggle();
  }

  /* ---------- Public ---------- */

  TDW.Overflow = {
    init() {
      if (panel) return;
      build();
      document.addEventListener('keydown', onDocKey);
      window.addEventListener('pagehide', saveNow);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    },
    // A draft was opened.
    load(d) {
      if (!panel) return;
      if (draft && draft !== d) saveNow();
      draft = d;
      warned = valueOf(d).length > SOFT_CAP;
      area.value = valueOf(d);
    },
    // The open draft changed elsewhere (Notion, another tab, the account).
    reload(d) {
      if (!panel || d !== draft) return;
      clearTimeout(saveTimer);
      show(d);
    },
    onMode() {},
    // md goes on top of the open draft's Overflow (the page already let go of it).
    stash(md) {
      const s = String(md || '').replace(/^\n+|\s+$/g, '');
      const d = app() && app().state.draft;
      if (!s || !d) return;
      if (draft !== d) this.load(d);
      saveNow();
      const cur = valueOf(d);
      const next = cur.trim() ? s + '\n' + cur : s;
      area.value = next;
      write(d, next);
      peek();
    },
    // Alternatives whose text vanished keep their options here, one line each: "a / b / c".
    keepLost(lost) {
      const d = app() && app().state.draft;
      const lines = (lost || []).map((a) => (a.options || []).map((o) => o.text).join(' / ')).filter(Boolean);
      if (!d || !lines.length) return;
      if (draft !== d) this.load(d);
      saveNow();
      const cur = valueOf(d);
      const next = (cur.trim() ? cur.replace(/\s+$/, '') + '\n' : '') + lines.join('\n');
      area.value = next;
      write(d, next);
    },
    isOpen,
    open: () => { if (!isOpen()) setOpen(true); },
    close: () => { if (isOpen()) setOpen(false, true); },
    toggle
  };
})();
