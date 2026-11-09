/* Overflow: a per-draft scratch area beside the page for cut passages, notes, links, words you
   like, an outline. It isn't part of the post: no words, no $, no spelling. Markdown-lite, one
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
  const PEEK_MS = 1600;

  let panel = null, area = null, btn = null;
  let draft = null;
  let open = false;
  let saveTimer = 0;
  let peekTimer = 0;
  let warned = false;

  const isOpen = () => open;
  const valueOf = (d) => String((d && d.overflow) || '');

  /* ---------- Building ---------- */

  function build() {
    panel = document.createElement('aside');
    panel.id = 'overflow';
    panel.className = 'overflow';
    panel.setAttribute('aria-label', 'Overflow');
    panel.hidden = true;

    const head = document.createElement('div');
    head.className = 'ov-head';
    const title = document.createElement('h2');
    title.className = 'ov-title';
    title.textContent = 'Overflow';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-icon ov-close';
    close.setAttribute('aria-label', 'Close Overflow');
    close.title = 'Close (Ctrl+Shift+O)';
    if (UI() && UI().icon) close.append(UI().icon('close')); else close.textContent = '×';
    close.addEventListener('click', () => setOpen(false, true));
    head.append(title, close);

    area = document.createElement('textarea');
    area.className = 'ov-text';
    area.spellcheck = false;
    area.setAttribute('autocomplete', 'off');
    area.setAttribute('autocorrect', 'off');
    area.setAttribute('autocapitalize', 'sentences');
    area.setAttribute('aria-label', 'Overflow: spare writing, notes and links for this draft');
    area.placeholder = 'Spare paragraphs, notes, links, an outline. They stay here, out of the post.';
    area.addEventListener('input', () => { clearTimeout(peekTimer); schedule(); });
    area.addEventListener('keydown', onAreaKey);
    area.addEventListener('dragstart', onDragStart);
    area.addEventListener('focus', () => clearTimeout(peekTimer));
    area.addEventListener('blur', () => saveNow());

    const foot = document.createElement('p');
    foot.className = 'ov-foot';
    foot.textContent = 'ctrl+return or drag into the page to use';

    panel.append(head, area, foot);
    document.body.append(panel);

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-btn ov-toggle';
    btn.textContent = 'Overflow';
    btn.title = 'Overflow (Ctrl+Shift+O)';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'overflow');
    btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the page's caret
    btn.addEventListener('click', () => toggle());
    const slot = $('dock-right');
    if (slot) slot.append(btn); else panel.prepend(btn);
  }

  /* ---------- Open and close ---------- */

  function setOpen(on, focusPage) {
    open = !!on;
    clearTimeout(peekTimer);
    panel.hidden = !open;
    panel.classList.toggle('is-peek', false);
    document.documentElement.classList.toggle('overflow-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.classList.toggle('is-on', open);
    if (!open) {
      saveNow();
      if (focusPage && TDW.Editor) TDW.Editor.focus();
    }
    if (TDW.Editor && TDW.Editor.placeAids) requestAnimationFrame(() => TDW.Editor.placeAids());
  }

  function toggle() {
    if (open) { setOpen(false, true); return; }
    setOpen(true);
    area.focus();
  }

  // After a stash: show it for a moment, then go away again unless the writer uses it.
  function peek() {
    if (open) { flash(); return; }
    setOpen(true);
    panel.classList.add('is-peek');
    flash();
    peekTimer = setTimeout(() => {
      if (panel.matches(':hover') || panel.contains(document.activeElement)) return;
      setOpen(false);
    }, PEEK_MS);
  }

  function flash() {
    area.scrollTop = 0;
    panel.classList.remove('is-new');
    void panel.offsetWidth; // restart the animation
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
    open: () => { if (!open) toggle(); },
    close: () => { if (open) setOpen(false, true); },
    toggle
  };
})();
