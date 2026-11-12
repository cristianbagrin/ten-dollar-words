/* Overflow: a per-draft scratch area for cut passages, notes, links, words you like, an outline.
   It isn't part of the post: no words, no $, no spelling. It lives in the margin (a sheet in the
   narrow layout). In Notion it's one toggle block titled "Overflow" at the bottom of the page. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const app = () => TDW.App;
  const UI = () => TDW.UI;
  const M = () => TDW.Margin;

  const SOFT_CAP = 50 * 1024;
  const MD_TYPE = 'application/x-tdw-markdown';
  const SAVE_MS = 300;
  const PEEK_MS = 1800;

  let box = null, area = null;
  let draft = null;
  let saveTimer = 0, peekTimer = 0, peekFrom = undefined;
  let warned = false;

  const valueOf = (d) => String((d && d.overflow) || '');
  const isOpen = () => (M().view() === 'overflow') || M().sheetOpen('overflow');

  /* ---------- Building ---------- */
  function build() {
    const el = UI().el;
    area = el('textarea', { class: 'ov-text', spellcheck: 'false', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'sentences',
      'aria-label': 'Overflow: spare writing, notes and links for this draft', placeholder: 'Spare paragraphs, cut lines, links, an outline. Nothing here counts.' });
    area.addEventListener('input', () => { clearTimeout(peekTimer); peekFrom = undefined; schedule(); });
    area.addEventListener('keydown', onAreaKey);
    area.addEventListener('dragstart', onDragStart);
    area.addEventListener('focus', () => { clearTimeout(peekTimer); peekFrom = undefined; });
    area.addEventListener('blur', () => saveNow());
    const use = el('button', { type: 'button', class: 'btn-quiet btn-sm ov-use' }, 'Use in the page');
    use.addEventListener('mousedown', (e) => e.preventDefault());
    use.addEventListener('click', usePick);
    box = el('div', { class: 'ov' }, area,
      el('div', { class: 'ov-foot' }, use));
  }

  function mount() {
    if (M().isNarrow()) return;
    const p = M().panel();
    if (box.parentNode !== p) p.replaceChildren(box);
  }

  /* ---------- Open and close ---------- */
  function open(focus) {
    clearTimeout(peekTimer);
    if (M().isNarrow()) {
      M().openSheet('overflow', 'Overflow', box, { tall: true, onClose: () => saveNow() });
    } else {
      mount();
      M().setView('overflow');
    }
    if (focus !== false && !UI().device.touch) area.focus();
  }

  function close(focusPage) {
    clearTimeout(peekTimer);
    saveNow();
    if (M().sheetOpen('overflow')) M().closeSheet();
    if (M().view() === 'overflow') M().setView(app().state.mode === 'edit' ? 'review' : null);
    if (focusPage) TDW.Editor.focus();
  }

  function toggle() { if (isOpen()) close(true); else open(); }

  // After a stash: show it for a moment, then go back, unless the writer stays with it.
  function peek() {
    flash();
    if (M().isNarrow()) {
      UI().toast('Stashed in Overflow', { label: 'Open', run: () => open() });
      return;
    }
    if (isOpen()) return;
    peekFrom = M().view();
    open(false);
    peekTimer = setTimeout(() => {
      if (box.matches(':hover') || box.contains(document.activeElement) || M().view() !== 'overflow') return;
      M().setView(peekFrom === undefined ? null : peekFrom);
      peekFrom = undefined;
    }, PEEK_MS);
  }

  function flash() {
    area.scrollTop = 0;
    area.classList.add('is-new');
    requestAnimationFrame(() => requestAnimationFrame(() => area.classList.remove('is-new')));
  }

  /* ---------- Saving ---------- */
  function schedule() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, SAVE_MS); }

  function write(d, value) {
    if (!d || valueOf(d) === value) return;
    d.overflow = value;
    if (value.length > SOFT_CAP && !warned) {
      warned = true;
      UI().toast("Overflow is over 50 KB. It still saves, but move what you won't use somewhere else.");
    }
    if (d === (app() && app().state.draft)) { app().markDirty(); app().syncEdit(); }
    else if (TDW.Store) TDW.Store.saveDraft(d);
  }

  function saveNow() { clearTimeout(saveTimer); if (area && draft) write(draft, area.value); }

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
  }

  /* ---------- Using it on the page ---------- */
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
    let ins = md;
    if (text.slice(lineStart, lineEnd).trim()) { at = lineEnd; ins = '\n' + md; }
    E.setCaret(at);
    app().insertAtCaret(ins);
  }

  function onAreaKey(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) { e.preventDefault(); usePick(); return; }
    if (e.key === 'Escape' && !M().sheetOpen('overflow')) { e.preventDefault(); e.stopPropagation(); close(true); }
  }

  function onDragStart(e) {
    const md = area.value.slice(area.selectionStart, area.selectionEnd);
    if (!md || !e.dataTransfer) return;
    try { e.dataTransfer.setData(MD_TYPE, md); } catch (_) { /* plain text still goes */ }
    e.dataTransfer.setData('text/plain', md);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function onKey() {
    if (document.querySelector('dialog[open]:modal') && !M().sheetOpen('overflow')) return false;
    toggle();
  }

  TDW.Overflow = {
    init() {
      if (box) return;
      build();
      mount();
      TDW.Keys.on('overflow', onKey);
      window.addEventListener('pagehide', saveNow);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
      M().onChange((v) => { if (v === 'overflow') mount(); else saveNow(); });
    },
    load(d) {
      if (!box) return;
      if (draft && draft !== d) saveNow();
      draft = d;
      warned = valueOf(d).length > SOFT_CAP;
      area.value = valueOf(d);
    },
    reload(d) { if (box && d === draft) { clearTimeout(saveTimer); show(d); } },
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
    open: () => { if (!isOpen()) open(); },
    close: () => { if (isOpen()) close(true); },
    toggle
  };
})();
