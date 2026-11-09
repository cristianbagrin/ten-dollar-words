/* Alternatives: other versions of a word, sentence or paragraph, kept with the draft and read in
   place. Hover an underlined span and use ↑/↓ (or Alt+↑/↓ with the caret in it) to flip through
   them. The list (Ctrl+Shift+A) opens in the inspector, pushed over its tabs: a square for your
   versions, a spark for the AI's, a filled dot for the one on the page. Typing in the list
   changes the page as you type; Return adds, Esc closes, "??" asks the AI for more. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Marks, Editor, UI } = TDW;
  const app = () => TDW.App;
  const KINDS = ['word', 'sentence', 'paragraph'];
  const LABEL = { word: 'Word', sentence: 'Sentence', paragraph: 'Paragraph' };

  let panel = null, list = null, seg = null, hint = null;
  let transient = false; // the inspector opened just for this list, and closes with it
  // The open panel: which alternative, and the point the last undo step was taken from.
  let cur = null; // { id, kind, snap, busy }
  let hoverId = null;
  let hoverAt = 0;

  const text = () => Editor.getText();
  const ann = () => Editor.getAnnotations();
  const altOf = (id) => ann().alts.find((a) => a.id === id) || null;
  const isOpen = () => !!cur;

  /* ---------- Changing the page ---------- */

  // Put option k on the page. history: false while previewing in the panel.
  function show(id, k, history) {
    const r = Marks.swap(text(), ann(), id, k);
    if (!r) return false;
    return Editor.change({ text: r.text, ann: r.ann, kind: 'swap', history });
  }

  // One undo step for everything the panel changed since the last one.
  function settle(kind) {
    if (!cur) return;
    Editor.recordFrom(cur.snap, kind || 'swap');
    cur.snap = Editor.snapshot();
  }

  function setAnn(next, history) { return Editor.change({ ann: next, kind: 'marks', history }); }

  /* ---------- Cycling in place ---------- */

  function cycle(id, dir) {
    const a = altOf(id);
    if (!a || a.options.length < 2) return false;
    const k = (a.active + dir + a.options.length) % a.options.length;
    show(id, k, !cur);
    if (cur && cur.id === id) { draw(); focusRow(k); settle(); }
    TDW.Sound && TDW.Sound.play && TDW.Sound.play('key');
    return true;
  }

  // The smallest alternative the caret (or a markdown offset) is in.
  function altAt(m) {
    let best = null;
    for (const a of ann().alts) {
      if (a.options.length < 2 && a.id !== (cur && cur.id)) continue;
      if (m >= a.start && m <= a.end && (!best || a.end - a.start < best.end - best.start)) best = a;
    }
    return best;
  }

  /* ---------- The panel ---------- */

  function build() {
    panel = TDW.Inspector.pane('alts');
    seg = UI.segmented({ label: 'Alternatives for', value: 'sentence', options: KINDS.map((k) => ({ value: k, label: LABEL[k] })), onChange: (k) => retarget(k) });
    list = UI.el('ol', { class: 'alts-list' });
    hint = UI.el('p', { class: 'hint alts-hint' });
    panel.append(UI.el('div', { class: 'alts-seg' }, seg), list, hint);
    panel.addEventListener('keydown', onPanelKey);
  }

  function draw() {
    const a = cur && altOf(cur.id);
    if (!a) { closePanel(true); return; }
    seg.set(a.kind);
    const rows = a.options.map((o, i) => row(o, i, i === a.active));
    rows.push(row({ text: '', by: 'me' }, a.options.length, false, true));
    list.replaceChildren(...rows);
    hint.textContent = UI.device.touch ? 'Tap a version to read it on the page. Type ?? to ask the AI for more.' : 'Return adds a version. Type ?? and Return to ask the AI for more. Esc closes.';
    sizeAll();
  }

  function row(o, i, on, isNew) {
    const mark = isNew ? '' : on ? 'is-on' : o.by === 'ai' ? 'is-ai' : 'is-me';
    const li = UI.el('li', { class: 'alts-row ' + mark + (isNew ? ' is-new' : '') });
    li.dataset.i = String(i);
    const m = UI.el('span', { class: 'alts-mark', 'aria-hidden': 'true' });
    if (!isNew && !on && o.by === 'ai') m.append(UI.icon('spark'));
    const input = UI.el('textarea', {
      class: 'alts-input', rows: '1', spellcheck: 'true',
      'aria-label': isNew ? 'New alternative' : 'Alternative ' + (i + 1) + (o.by === 'ai' ? ', written by AI' : ', yours') + (on ? ', on the page' : ''),
      placeholder: isNew ? (cur && cur.busy ? '' : 'Another way to say it…') : ''
    });
    input.value = o.text;
    input.addEventListener('focus', () => { if (!isNew) preview(i); });
    input.addEventListener('input', () => { size(input); onType(i, input.value, isNew); });
    li.append(m, input);
    if (isNew && cur && cur.busy) li.classList.add('is-busy');
    return li;
  }


  function size(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  function sizeAll() { for (const t of list.querySelectorAll('textarea')) size(t); }
  function inputs() { return [...list.querySelectorAll('textarea')]; }
  function focusRow(i) {
    const t = inputs()[i];
    if (!t) return;
    if (document.activeElement !== t) t.focus({ preventScroll: false });
  }

  // Arrowing or clicking onto a row shows it on the page.
  function preview(i) {
    const a = cur && altOf(cur.id);
    if (!a || i >= a.options.length || i === a.active) return;
    show(a.id, i, false);
    markRows();
  }

  function markRows() {
    const a = cur && altOf(cur.id);
    if (!a) return;
    list.querySelectorAll('.alts-row').forEach((li, i) => {
      if (li.classList.contains('is-new')) return;
      const o = a.options[i];
      if (!o) return;
      li.classList.toggle('is-on', i === a.active);
      li.classList.toggle('is-ai', i !== a.active && o.by === 'ai');
      li.classList.toggle('is-me', i !== a.active && o.by !== 'ai');
      const m = li.firstChild;
      m.replaceChildren(i !== a.active && o.by === 'ai' ? UI.icon('spark') : '');
    });
  }

  // Typing in a row changes that option, and the page with it when it's the one showing. The
  // new row becomes an option as soon as it has text, so you read it in place as you type.
  function onType(i, value, isNew) {
    const a = cur && altOf(cur.id);
    if (!a) return;
    const v = value.replace(/\s*\n\s*/g, ' ');
    if (isNew) {
      if (!v.trim() || v.trim() === '??' || v.trim() === '?') return;
      const next = Marks.addOptions(ann(), a.id, [v], 'me');
      const b = next.alts.find((x) => x.id === a.id);
      if (b.options.length === a.options.length) return; // a duplicate
      setAnn(next, false);
      show(a.id, b.options.length - 1, false);
      // The row is an option now; a fresh empty row goes under it.
      const li = list.lastChild;
      const idx = b.options.length - 1;
      li.classList.remove('is-new');
      li.dataset.i = String(idx);
      list.append(row({ text: '', by: 'me' }, b.options.length, false, true));
      rebindRow(li, idx);
      markRows();
      return;
    }
    if (!v.trim()) return; // an emptied row stays until Backspace removes it
    const options = a.options.slice();
    options[i] = Object.assign({}, options[i], { text: v });
    if (i === a.active) {
      const t = text();
      const nt = t.slice(0, a.start) + v + t.slice(a.end);
      const others = Marks.applyChange(Object.assign({}, ann(), { alts: ann().alts.filter((x) => x.id !== a.id) }), t, nt);
      const alts = others.alts.concat(Object.assign({}, a, { end: a.start + v.length, options })).sort((x, y) => x.start - y.start);
      Editor.change({ text: nt, ann: Marks.withAnn(others, { alts }), kind: 'swap', history: false });
    } else setAnn(Marks.updateAlt(ann(), a.id, { options }), false);
  }

  // The new row turned into option idx: from now on its typing edits that option.
  function rebindRow(li, idx) {
    const old = li.querySelector('textarea');
    const t = old.cloneNode(false);
    t.value = old.value;
    t.setAttribute('aria-label', 'Alternative ' + (idx + 1) + ', yours, on the page');
    t.placeholder = '';
    old.replaceWith(t);
    t.addEventListener('focus', () => preview(idx));
    t.addEventListener('input', () => { size(t); onType(idx, t.value, false); });
    size(t);
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }

  function rowIndex(t) { return inputs().indexOf(t); }

  function onPanelKey(e) {
    const t = e.target;
    if (!(t instanceof HTMLTextAreaElement)) return;
    const i = rowIndex(t);
    const a = cur && altOf(cur.id);
    if (!a) return;
    const isNew = i >= a.options.length;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePanel(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !mod) {
      e.preventDefault();
      if (t.value.trim() === '??') { t.value = ''; askAI(); return; }
      settle();
      draw();
      focusRow(inputs().length - 1);
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.altKey && !mod) {
      const before = t.value.slice(0, t.selectionStart);
      const after = t.value.slice(t.selectionEnd);
      if (e.key === 'ArrowUp' && before.includes('\n')) return;
      if (e.key === 'ArrowDown' && after.includes('\n')) return;
      e.preventDefault();
      const n = inputs().length;
      const j = Math.max(0, Math.min(n - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      focusRow(j);
      return;
    }
    // Backspace on an empty row, or ⌘/Ctrl+Backspace on any, removes that option.
    if ((e.key === 'Backspace' || e.key === 'Delete') && !isNew && (mod || !t.value)) {
      e.preventDefault();
      removeOption(i);
      return;
    }
    if (mod && !e.altKey && String(e.key).toLowerCase() === 'z') {
      // Undo inside the panel undoes the draft (AI suggestions, deletions, swaps).
      e.preventDefault();
      settle();
      if (e.shiftKey) Editor.redo(); else Editor.undo();
      if (!altOf(cur.id)) { closePanel(true); return; }
      draw();
      focusRow(Math.min(i, inputs().length - 1));
    }
  }

  function removeOption(i) {
    const a = cur && altOf(cur.id);
    if (!a || i >= a.options.length) return;
    settle();
    if (a.options.length <= 1) return;
    if (i === a.active) show(a.id, i > 0 ? i - 1 : 1, false);
    const b = altOf(a.id);
    const options = b.options.filter((_, j) => j !== i);
    const active = b.active > i ? b.active - 1 : b.active;
    setAnn(Marks.updateAlt(ann(), a.id, { options, active }), false);
    settle('marks');
    draw();
    focusRow(Math.min(i, options.length));
  }

  /* ---------- AI ---------- */

  let aiCtrl = null;

  function contextOf(a) {
    const t = text();
    const sen = Marks.sentenceAt(t, a.start);
    const par = Marks.paragraphAt(t, a.start);
    const first = t.split('\n').find((l) => l.trim()) || '';
    return {
      kind: a.kind,
      span: t.slice(a.start, a.end),
      sentence: sen ? t.slice(sen.start, sen.end) : t.slice(a.start, a.end),
      paragraph: par ? t.slice(par.start, par.end) : t.slice(a.start, a.end),
      title: TDW.Inline.plain(first).trim(),
      have: a.options.map((o) => o.text)
    };
  }

  async function askAI() {
    const a = cur && altOf(cur.id);
    if (!a || cur.busy) return;
    if (!TDW.Store.getKey() && !TDW.mockAI) {
      UI.toast('Add your Gemini key in Settings to ask the AI.', { label: 'Settings', run: () => app().openSettings('ai') });
      return;
    }
    settle();
    cur.busy = true;
    draw();
    focusRow(inputs().length - 1);
    if (aiCtrl) aiCtrl.abort();
    aiCtrl = new AbortController();
    const id = a.id;
    try {
      const res = await TDW.AI.alternatives(contextOf(a), aiCtrl.signal);
      if (!altOf(id)) return;
      const next = Marks.addOptions(ann(), id, res.options || [], 'ai');
      if (next.alts.find((x) => x.id === id).options.length === altOf(id).options.length) UI.toast('The AI had nothing new to add.');
      setAnn(next, true);
      if (cur) cur.snap = Editor.snapshot();
    } catch (err) {
      if (!err || err.code !== 'cancelled') UI.toast(TDW.AI.errorMessage(err));
    } finally {
      if (cur && cur.id === id) {
        cur.busy = false;
        draw();
        focusRow(inputs().length - 1);
      }
    }
  }

  /* ---------- Opening, re-targeting, closing ---------- */

  // The range to work on: the selection if there is one, else what's at the caret.
  function target(kind) {
    const t = text();
    const s = Editor.getSelection();
    if (s.end > s.start) {
      let a = s.start, b = s.end;
      while (a < b && /\s/.test(t[a])) a++;
      while (b > a && /\s/.test(t[b - 1])) b--;
      const k = kind || Marks.kindOf(t, a, b);
      if (k && !t.slice(a, b).includes('\n')) return { kind: k, start: a, end: b };
    }
    const at = altAt(s.end);
    if (at && (!kind || at.kind === kind)) return { kind: at.kind, start: at.start, end: at.end };
    const k = kind || 'word';
    const r = Marks.scopeAt(k, t, s.end) || (k === 'word' ? Marks.scopeAt('word', t, Math.max(0, s.end - 1)) : null);
    return r ? { kind: k, start: r.start, end: r.end } : null;
  }

  function opaqueAt(m) {
    const t = text();
    const l = Marks.lineRange(t, m);
    return TDW.Inline.block(t.slice(l.start, l.end)).type === 'opaque';
  }

  function openFor(r, opts) {
    if (!r || opaqueAt(r.start)) { UI.toast('Put the caret on a word, or select some text, first.'); return null; }
    if (app().state.loading) return null;
    if (cur) closePanel(true, true);
    const got = Marks.ensure(text(), ann(), r.kind, r.start, r.end);
    if (!got) { UI.toast('This draft has as many alternatives as it can hold.'); return null; }
    if (got.ann !== ann()) setAnn(got.ann, false);
    cur = { id: got.id, kind: r.kind, snap: null, busy: false };
    cur.snap = Editor.snapshot();
    Editor.setOpenAlt(got.id);
    if (!panel) build();
    if (!TDW.Inspector.pushed()) transient = !TDW.Inspector.isOpen();
    if (!TDW.Inspector.isOpen()) app().openTab(TDW.Inspector.tab());
    if (TDW.Inspector.pushed() !== 'alts') TDW.Inspector.push('alts', 'Alternatives', () => closePanel());
    document.documentElement.classList.add('alts-open');
    draw();
    if (!(opts && opts.keepFocus)) focusRow(inputs().length - 1);
    return got.id;
  }

  // open(): what's selected or at the caret. open('sentence'): that kind. open(id): that alternative.
  function open(kind) {
    const a = kind && !KINDS.includes(kind) ? altOf(kind) : null;
    if (a) return openFor({ kind: a.kind, start: a.start, end: a.end });
    return openFor(target(KINDS.includes(kind) ? kind : undefined));
  }

  // Switching tabs: the sentence or paragraph around the same spot.
  function retarget(kind) {
    const a = cur && altOf(cur.id);
    if (!a) return;
    if (a.kind === kind) return;
    const at = a.start + Math.floor((a.end - a.start) / 2);
    const t = text();
    const hit = ann().alts.find((x) => x.kind === kind && at >= x.start && at <= x.end);
    const r = hit ? { kind, start: hit.start, end: hit.end } : (() => { const s = Marks.scopeAt(kind, t, at); return s ? { kind, start: s.start, end: s.end } : null; })();
    if (!r) return;
    openFor(r);
  }

  function closePanel(silent, keepOpenClass) {
    if (!cur) return;
    if (aiCtrl) { aiCtrl.abort(); aiCtrl = null; }
    settle();
    // An alternative left with only its original is just text again.
    const a = altOf(cur.id);
    if (a && a.options.length < 2) {
      Editor.change({ ann: Marks.withAnn(ann(), { alts: ann().alts.filter((x) => x.id !== a.id) }), kind: 'marks', history: false });
    }
    cur = null;
    Editor.setOpenAlt(null);
    if (!keepOpenClass) {
      document.documentElement.classList.remove('alts-open');
      if (TDW.Inspector.pushed() === 'alts') TDW.Inspector.pop();
      if (transient && TDW.Inspector.isOpen()) app().setMode('write', { keepLibrary: true });
      transient = false;
      if (!silent) Editor.focus();
    }
  }

  /* ---------- From elsewhere: tips and the AI ---------- */

  // Options for a range, from a tip or the AI: they join that range's alternatives (robot-marked),
  // and the panel opens so you can read each one in place. One undo step takes them back.
  function offer(o) {
    const t = text();
    const kind = KINDS.includes(o.kind) ? o.kind : Marks.kindOf(t, o.start, o.end) || 'sentence';
    const id = openFor({ kind, start: o.start, end: o.end }, { keepFocus: true });
    if (!id) return false;
    setAnn(Marks.addOptions(ann(), id, o.options || [], o.by || 'ai'), true);
    cur.snap = Editor.snapshot();
    draw();
    focusRow(1);
    return true;
  }

  // "AI alternatives for selection": open on the selection and ask straight away.
  function aiForSelection() {
    if (open()) askAI();
  }

  /* ---------- Wiring ---------- */

  function onEditorKey(e) {
    if (e.defaultPrevented || e.isComposing) return;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      // Alt+↑/↓: the alternative the caret is in. Plain ↑/↓: the one under the pointer.
      if (e.altKey) {
        const a = altAt(Editor.getSelection().end);
        if (a && cycle(a.id, dir)) e.preventDefault();
      } else if (hoverId && performance.now() - hoverAt < 15000 && altOf(hoverId)) {
        if (cycle(hoverId, dir)) e.preventDefault();
      }
    }
  }

  function wire() {
    const root = Editor.rootEl();
    root.addEventListener('keydown', onEditorKey, true);
    root.addEventListener('mousemove', (e) => {
      const n = e.target.closest && e.target.closest('[data-alt]');
      const id = n ? n.dataset.alt : null;
      if (id !== hoverId) { hoverId = id; }
      hoverAt = performance.now();
    });
    root.addEventListener('mouseleave', () => { hoverId = null; });
    // With the panel open, a click on any word moves the panel to it. On a touch screen
    // (no hover), tapping an underlined span opens it.
    root.addEventListener('click', () => {
      const s = Editor.getSelection();
      if (s.end > s.start) return;
      if (cur) {
        const a = altOf(cur.id);
        if (a && s.end >= a.start && s.end <= a.end) return;
        const r = target(a ? a.kind : 'word');
        if (r) openFor(r, { keepFocus: true });
      } else if (UI.device.touch) {
        const a = altAt(s.end);
        if (a) openFor({ kind: a.kind, start: a.start, end: a.end });
      }
    });
    // The pager dots open the panel on their alternative.
    document.addEventListener('click', (e) => {
      const p = e.target.closest && e.target.closest('.alt-pager');
      if (!p || !p._alt) return;
      const a = altOf(p._alt);
      if (a) openFor({ kind: a.kind, start: a.start, end: a.end });
    });
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]')) return;
      // Ctrl+Shift+A / G; Alt+Shift+A / G too, for browsers that keep Ctrl+Shift+A for themselves.
      const combo = e.shiftKey && !e.metaKey && (e.ctrlKey !== e.altKey);
      if (!combo) return;
      const k = e.code === 'KeyA' ? 'a' : e.code === 'KeyG' ? 'g' : String(e.key).toLowerCase();
      if (k === 'a') { e.preventDefault(); if (cur) closePanel(); else open(); }
      else if (k === 'g') { e.preventDefault(); aiForSelection(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cur && !panel.contains(e.target) && !UI.menuOpen() && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        closePanel();
      }
    });
  }

  TDW.Alts = {
    init() { wire(); },
    load() { if (cur) closePanel(true); },
    reload() { if (cur && !altOf(cur.id)) closePanel(true); else if (cur) draw(); },
    onText() { if (cur && !altOf(cur.id)) closePanel(true); },
    onMode(m) { if (m !== 'edit' && cur) closePanel(true); },
    open, aiForSelection, offer, cycle, isOpen,
    close: () => closePanel()
  };
})();
