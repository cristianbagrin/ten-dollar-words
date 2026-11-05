/* The right-click menu on the page, and the two things it does that live nowhere else:
   Ghost it (dim text to about 10%: still there, gone for every other purpose) and Stash this in
   Overflow (move it out of the page, into the panel beside it). Shift+right-click gives the
   browser's own menu. On a touch screen, a small button by the selection opens the same menu. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Marks, Editor, UI } = TDW;
  const app = () => TDW.App;
  const IS_MAC = UI.device.apple;

  const text = () => Editor.getText();
  const ann = () => Editor.getAnnotations();
  const hint = (k) => (IS_MAC ? k.replace(/Ctrl\+/g, '⌃').replace(/Shift\+/g, '⇧') : k);

  function opaque(start, end) {
    const t = text();
    for (let m = start; m <= end;) {
      const l = Marks.lineRange(t, m);
      if (TDW.Inline.block(t.slice(l.start, l.end)).type === 'opaque') return true;
      m = l.end + 1;
    }
    return false;
  }

  /* ---------- Ghost it / Revive ---------- */

  // The selection, or the ghost (or word) at the caret.
  function ghostRange() {
    const s = Editor.getSelection();
    if (s.end > s.start) return s;
    const g = ann().ghosts.find((x) => s.end >= x.start && s.end <= x.end);
    return g ? { start: g.start, end: g.end } : null;
  }

  function isGhosted(r) {
    return !!r && ann().ghosts.some((g) => g.start <= r.start && g.end >= r.end);
  }

  function toggleGhost() {
    if (app().state.loading) return;
    const r = ghostRange();
    if (!r) { UI.toast('Select the text to ghost first.'); return; }
    if (opaque(r.start, r.end)) { UI.toast("Notion blocks like images can't be ghosted."); return; }
    const revive = isGhosted(r) || (r.end > r.start && Marks.ghostAt(ann(), r.start, r.end) && covered(r));
    const next = revive ? Marks.revive(ann(), r.start, r.end) : Marks.ghost(ann(), r.start, r.end);
    Editor.change({ ann: next, kind: 'marks', sel: { start: r.end, end: r.end } });
  }

  // Mostly ghosted already: revive rather than ghost the rest.
  function covered(r) {
    let n = 0;
    for (const g of ann().ghosts) n += Math.max(0, Math.min(g.end, r.end) - Math.max(g.start, r.start));
    return n >= (r.end - r.start) / 2;
  }

  /* ---------- Stash this in Overflow ---------- */

  function stash() {
    if (app().state.loading) return;
    if (!TDW.Overflow || !TDW.Overflow.stash) { UI.toast('Overflow isn’t available here.'); return; }
    const t = text();
    let { start, end } = Editor.getSelection();
    if (end <= start) {
      // No selection: the whole paragraph the caret is in.
      const l = Marks.lineRange(t, end);
      start = l.start; end = l.end;
    }
    while (start < end && /\s/.test(t[start])) start++;
    while (end > start && /\s/.test(t[end - 1])) end--;
    if (end <= start) { UI.toast('Select what to stash first.'); return; }
    if (opaque(start, end)) { UI.toast("Notion blocks like images can't go to Overflow."); return; }
    const md = t.slice(start, end);
    // Whole lines leave with their line break; part of a line takes one neighboring space.
    const ls = Marks.lineRange(t, start), le = Marks.lineRange(t, end);
    let a = start, b = end;
    const lineStart = TDW.Inline.block(t.slice(ls.start, ls.end)).prefix + ls.start;
    if (a <= lineStart && b >= le.end) {
      a = ls.start; b = le.end;
      if (b < t.length) b++; else if (a > 0) a--;
    } else if (t[b] === ' ') b++;
    else if (a > 0 && t[a - 1] === ' ') a--;
    Editor.change({ text: t.slice(0, a) + t.slice(b), kind: 'stash', sel: { start: a, end: a } });
    TDW.Overflow.stash(md);
  }

  /* ---------- The menu ---------- */

  function items() {
    const s = Editor.getSelection();
    const has = s.end > s.start;
    const r = ghostRange();
    const ghosted = !!r && (isGhosted(r) || (has && covered(r)));
    const list = [
      { label: 'Alternatives for selection', note: hint('Ctrl+Shift+A'), value: 'alts' },
      { label: 'AI alternatives for selection', note: hint('Ctrl+Shift+G'), value: 'ai' },
      { label: ghosted ? 'Revive' : 'Ghost it', note: hint('Ctrl+/'), value: 'ghost', disabled: !r },
      { label: 'Stash this in Overflow', note: hint('Ctrl+Shift+X'), value: 'stash' },
      { type: 'sep' },
      { label: 'Cut', value: 'cut', disabled: !has },
      { label: 'Copy', value: 'copy', disabled: !has },
      { label: 'Paste', value: 'paste' }
    ];
    return list.filter((x) => !x.disabled);
  }

  async function run(v) {
    if (v === 'alts') TDW.Alts && TDW.Alts.open();
    else if (v === 'ai') TDW.Alts && TDW.Alts.aiForSelection();
    else if (v === 'ghost') toggleGhost();
    else if (v === 'stash') stash();
    else if (v === 'cut' || v === 'copy') { Editor.focus(); document.execCommand(v); }
    else if (v === 'paste') {
      try {
        const t = await navigator.clipboard.readText();
        if (t) app().insertAtCaret(t);
      } catch (_) {
        UI.toast('Paste with ' + UI.keys('⌘V') + '.');
      }
    }
  }

  let anchor = null;
  function openAt(x, y) {
    if (!anchor) {
      anchor = UI.el('span', { class: 'ctx-anchor', 'aria-hidden': 'true' });
      document.body.append(anchor);
    }
    anchor.style.left = x + 'px';
    anchor.style.top = y + 'px';
    UI.menu(anchor, items(), (it) => { run(it.value); });
  }

  /* ---------- Touch: a button by the selection ---------- */
  let touchBtn = null;
  function placeTouchButton() {
    if (!UI.device.touch) return;
    const s = Editor.getSelection();
    if (!touchBtn) {
      touchBtn = UI.el('button', { type: 'button', class: 'ctx-touch', 'aria-label': 'More for this selection', hidden: true, text: '⋯' });
      touchBtn.addEventListener('pointerdown', (e) => e.preventDefault());
      touchBtn.addEventListener('click', () => {
        const r = touchBtn.getBoundingClientRect();
        openAt(r.left, r.bottom);
      });
      document.body.append(touchBtn);
    }
    if (s.end <= s.start || document.activeElement !== Editor.rootEl()) { touchBtn.hidden = true; return; }
    const rc = Editor.rectAt(s.end);
    if (!rc) { touchBtn.hidden = true; return; }
    touchBtn.hidden = false;
    touchBtn.style.left = Math.min(window.innerWidth - 48, rc.left + 8) + 'px';
    touchBtn.style.top = (rc.top + rc.height + 10) + 'px';
  }

  function wire() {
    const root = Editor.rootEl();
    root.addEventListener('contextmenu', (e) => {
      if (e.shiftKey || app().state.loading) return;
      e.preventDefault();
      // A right-click outside the selection moves the caret there first, like a text editor.
      const s = Editor.getSelection();
      const at = Editor.indexFromPoint(e.clientX, e.clientY);
      if (at != null && (s.end <= s.start || at < s.start || at > s.end)) Editor.setCaret(at);
      openAt(e.clientX, e.clientY);
    });
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') || app().state.loading) return;
      if (!e.ctrlKey || e.metaKey || e.altKey) return;
      const k = String(e.key).toLowerCase();
      if (!e.shiftKey && (k === '/' || e.code === 'Slash')) { e.preventDefault(); toggleGhost(); }
      else if (e.shiftKey && (k === 'x' || e.code === 'KeyX')) { e.preventDefault(); stash(); }
    });
    document.addEventListener('selectionchange', () => requestAnimationFrame(placeTouchButton));
  }

  TDW.Menu = {
    init() { wire(); },
    onSelect() { placeTouchButton(); },
    toggleGhost, stash, openAt
  };
})();
