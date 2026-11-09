/* Colors, notes and talking to the AI about the draft.
   - Color: select text and pick a text color or a background (the bar's More, the block menu's
     Color, or "/red", "/yellow background"). In Notion it's the same color.
   - Notes for future you: select text and add a note (the bar's Note, Ctrl+Shift+M or "/note").
     The words get a faint underline and a mark in the margin; the note itself opens in the
     inspector's Notes tab. A note is a to-do: tick it off when it's done.
   - Ask AI: a note you write to the AI (the bar's Ask AI, Ctrl+J or "/ai"). It answers in the
     thread; versions it suggests join the text's alternatives, so you flip through them in
     place. It never changes the page by itself. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Marks, Editor, UI } = TDW;
  const app = () => TDW.App;
  const IS_MAC = UI.device.apple;
  const LAST_KEY = 'tdw.lastColor';

  const NAMES = { brown: 'Brown', orange: 'Orange', yellow: 'Yellow', green: 'Green', blue: 'Blue', purple: 'Purple', pink: 'Pink', red: 'Red', gray: 'Gray' };
  const text = () => Editor.getText();
  const ann = () => Editor.getAnnotations();
  const noteOf = (id) => (ann().notes || []).find((n) => n.id === id) || null;

  function palette() {
    const out = Marks.HUES.map((h) => ({ value: h, label: NAMES[h] + ' text' }));
    for (const h of ['gray'].concat(Marks.HUES)) out.push({ value: h + '_background', label: NAMES[h] + ' background' });
    return out;
  }

  function opaque(start, end) {
    const t = text();
    for (let m = start; m <= end;) {
      const l = Marks.lineRange(t, m);
      if (TDW.Inline.block(t.slice(l.start, l.end)).type === 'opaque') return true;
      m = l.end + 1;
    }
    return false;
  }

  // The selection, trimmed; with none, the block the caret is in.
  function range(opts) {
    const t = text();
    let { start, end } = Editor.getSelection();
    if (end <= start && !(opts && opts.allowEmpty)) {
      const l = Marks.lineRange(t, end);
      const pre = TDW.Inline.block(t.slice(l.start, l.end)).prefix;
      start = l.start + pre; end = l.end;
    }
    while (start < end && /\s/.test(t[start])) start++;
    while (end > start && /\s/.test(t[end - 1])) end--;
    return { start, end };
  }

  /* ---------- Color ---------- */

  function lastColor() { try { return localStorage.getItem(LAST_KEY) || 'yellow_background'; } catch (_) { return 'yellow_background'; } }
  function setLast(c) { try { localStorage.setItem(LAST_KEY, c); } catch (_) { /* storage blocked */ } }

  function applyColor(start, end, color) {
    if (end <= start || app().state.loading) return;
    if (opaque(start, end)) { UI.toast("Notion blocks like images can't take a color."); return; }
    if (color) setLast(color);
    const t = text();
    // Line breaks and list markers stay uncolored: color each line's text.
    let next = ann();
    let m = start;
    while (m < end) {
      const l = Marks.lineRange(t, m);
      const pre = l.start + TDW.Inline.block(t.slice(l.start, l.end)).prefix;
      const a = Math.max(m, pre), b = Math.min(end, l.end);
      if (b > a) next = Marks.setColor(next, a, b, color || null);
      m = l.end + 1;
    }
    Editor.change({ ann: next, kind: 'marks', keepFocus: true });
  }

  function colorBlock(line, color) {
    const b = Editor.block(line);
    if (!b || !b.vis) return;
    const pre = b.md.length - b.md.replace(/^(#{1,3} |- |\d+\. |\[[ xX]\] |> )/, '').length;
    applyColor(b.start + pre, b.end, color);
  }

  // A popover of swatches: text colors, then backgrounds, then "Default".
  let colorPop = null;
  function colorMenu(anchor, start, end) {
    closeColor();
    const cur = Marks.colorAt(ann(), start, end);
    const swatch = (c, label) => {
      const b = UI.el('button', { type: 'button', class: 'swatch sw-' + (c || 'default') + (c === cur ? ' is-on' : ''), 'aria-label': label, title: label, text: 'A' });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { closeColor(); applyColor(start, end, c); });
      return b;
    };
    const last = lastColor();
    colorPop = UI.el('div', { class: 'color-pop', role: 'dialog', 'aria-label': 'Color' },
      UI.el('div', { class: 'color-head', text: 'Last used' }),
      UI.el('div', { class: 'color-row' }, swatch(last, (palette().find((p) => p.value === last) || { label: last }).label)),
      UI.el('div', { class: 'color-head', text: 'Text color' }),
      UI.el('div', { class: 'color-row' }, swatch('', 'Default'), Marks.HUES.map((h) => swatch(h, NAMES[h] + ' text'))),
      UI.el('div', { class: 'color-head', text: 'Background' }),
      UI.el('div', { class: 'color-row' }, swatch('', 'No background'), ['gray'].concat(Marks.HUES).map((h) => swatch(h + '_background', NAMES[h] + ' background'))));
    document.body.append(colorPop);
    place(colorPop, anchor.getBoundingClientRect());
    setTimeout(() => document.addEventListener('pointerdown', outsideColor, true));
    document.addEventListener('keydown', escColor, true);
  }
  function outsideColor(e) { if (colorPop && !colorPop.contains(e.target)) closeColor(); }
  function escColor(e) { if (e.key === 'Escape' && colorPop) { e.preventDefault(); e.stopPropagation(); closeColor(); Editor.focus(); } }
  function closeColor() {
    if (!colorPop) return;
    colorPop.remove();
    colorPop = null;
    document.removeEventListener('pointerdown', outsideColor, true);
    document.removeEventListener('keydown', escColor, true);
  }

  function place(node, r) {
    const w = node.offsetWidth, h = node.offsetHeight;
    const vh = UI.visibleBottom ? UI.visibleBottom() : window.innerHeight;
    let top = r.bottom + 8;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 8);
    node.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    node.style.top = top + 'px';
  }

  /* ---------- The Notes tab ----------
     A composer at the top while you write a note, the list (Open, Done, All), and the note you
     opened, expanded in place with its thread and a reply box. Nothing floats over the text. */

  let tab = null, listEl = null, filterSeg = null, composerEl = null;
  let filter = 'open';
  let selected = null;     // the open note's id
  let composing = null;    // { range, ai, marked, transient }
  let busyId = null;
  let aiCtrl = null;

  const inFront = () => TDW.Inspector.isOpen() && TDW.Inspector.tab() === 'notes' && !TDW.Inspector.pushed();

  function build() {
    tab = TDW.Inspector.pane('notes');
    filterSeg = UI.segmented({
      label: 'Show', value: filter,
      options: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }],
      onChange: (v) => { filter = v; draw(); }
    });
    composerEl = UI.el('div', { class: 'note-composer', hidden: true });
    listEl = UI.el('ol', { class: 'notes-list' });
    tab.append(composerEl, UI.el('div', { class: 'rv-row notes-filter' }, UI.el('span', { class: 'rv-label', text: 'Notes' }), filterSeg), listEl);
  }

  /* ---------- Composing ---------- */
  function compose(opts) {
    if (app().state.loading) return;
    if (Editor.rootEl().contentEditable !== 'true') return;
    const ai = !!(opts && opts.ai);
    const r = range();
    if (r.end <= r.start && ai) { UI.toast('Select some text to ask the AI about.'); return; }
    if (opaque(r.start, r.end)) { UI.toast("Notion blocks like images can't take notes."); return; }
    if (ai && !TDW.Store.getKey() && !TDW.mockAI) {
      UI.toast('Add your Gemini key in Settings to ask the AI.', { label: 'Settings', run: () => app().openSettings('ai') });
      return;
    }
    const transient = composing ? composing.transient : !TDW.Inspector.isOpen();
    endCompose(true);
    TDW.Bubble && TDW.Bubble.hide();
    composing = { range: r, ai, marked: false, transient };
    // Show what the note is on while you write it (unless the Lab's marks are there).
    if (!Editor.getLab().length && r.end > r.start) { Editor.setLab([{ start: r.start, end: r.end, type: 'note-target', id: 'note-target' }]); composing.marked = true; }
    app().openTab('notes');
    drawComposer();
    const input = composerEl.querySelector('textarea');
    if (input) input.focus({ preventScroll: true });
  }

  function drawComposer() {
    if (!composing) { composerEl.hidden = true; composerEl.replaceChildren(); return; }
    const { range: r, ai } = composing;
    const quote = TDW.Inline.plain(text().slice(r.start, r.end));
    const input = UI.el('textarea', { class: 'field note-input', rows: '2', placeholder: ai ? 'Ask for other ways to say it, a shorter one, a verdict…' : 'A to-do, an idea, a question for later', 'aria-label': ai ? 'Message to the AI' : 'Note' });
    const chips = ai ? UI.el('div', { class: 'fix-chips' }, ['Other ways to say this', 'Make it punchier', 'Shorter', 'Simpler words', 'Is this clear?'].map((q) =>
      UI.el('button', { type: 'button', class: 'chip', onclick: () => { input.value = q; send(); } }, UI.el('span', { class: 'chip-word', text: q })))) : null;
    const save = UI.el('button', { type: 'button', class: 'btn btn-sm' }, ai ? UI.icon('spark') : null, ai ? 'Ask' : 'Add note');
    const swap = UI.el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: ai ? 'Just a note' : 'Ask AI instead' });
    const cancel = UI.el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Cancel', onclick: () => endCompose(false) });
    composerEl.replaceChildren(
      UI.el('div', { class: 'rv-label', text: ai ? 'Ask AI about' : 'New note on' }),
      quote ? UI.el('p', { class: 'page-quote note-quote', text: quote.length > 160 ? quote.slice(0, 157) + '…' : quote }) : UI.el('p', { class: 'hint', text: 'This block' }),
      input, chips, UI.el('div', { class: 'note-foot' }, swap, UI.el('span', { class: 'note-spacer' }), cancel, save));
    composerEl.hidden = false;
    function send() {
      const msg = input.value.trim();
      if (!msg) { input.focus(); return; }
      const got = Marks.addNote(ann(), r.start, r.end, ai ? { ai: true, body: '', thread: [{ by: 'me', text: msg, at: Date.now() }] } : { body: msg, done: false });
      if (!got) { UI.toast('This draft has as many notes as it can hold.'); return; }
      clearTarget();
      composing = null;
      drawComposer();
      Editor.change({ ann: got.ann, kind: 'marks', keepFocus: false });
      selected = got.id;
      if (filter === 'done') { filter = 'open'; filterSeg.set('open'); }
      Editor.setOpenNote(got.id);
      draw();
      if (ai) askAI(got.id, msg); else Editor.focus();
    }
    save.addEventListener('click', send);
    swap.addEventListener('click', () => { const v = input.value; composing.ai = !ai; drawComposer(); const t = composerEl.querySelector('textarea'); t.value = v; t.focus(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endCompose(false); }
    });
    autosize(input);
  }

  function clearTarget() { if (composing && composing.marked) { Editor.setLab([]); composing.marked = false; } }

  function endCompose(silent) {
    if (!composing) return;
    const transient = composing.transient;
    clearTarget();
    composing = null;
    drawComposer();
    if (!silent) {
      if (transient && inFront()) app().setMode('write', { keepLibrary: true });
      else Editor.focus();
    }
  }

  function autosize(t) {
    const go = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; };
    t.addEventListener('input', go);
    requestAnimationFrame(go);
  }

  /* ---------- The list, and the note you opened ---------- */
  function openNote(id) {
    if (!noteOf(id)) return;
    endCompose(true);
    selected = id;
    const n = noteOf(id);
    if ((filter === 'open' && n.done) || (filter === 'done' && !n.done)) { filter = 'all'; filterSeg.set('all'); }
    Editor.setOpenNote(id);
    app().openTab('notes');
    draw();
    requestAnimationFrame(() => {
      const row = listEl.querySelector('.notes-row.is-open');
      if (row) row.scrollIntoView({ block: 'nearest' });
      const reply = listEl.querySelector('.note-reply');
      if (reply && n.ai && !UI.device.touch) reply.focus({ preventScroll: true });
    });
  }

  function closeNote() {
    selected = null;
    Editor.setOpenNote(null);
    draw();
  }

  let drawRaf = 0;
  function refreshPanel() { cancelAnimationFrame(drawRaf); drawRaf = requestAnimationFrame(draw); }

  function draw() {
    if (!tab) return;
    const notes = ann().notes || [];
    const openCount = notes.filter((n) => !n.done).length;
    TDW.Inspector.setBadge('notes', openCount ? String(openCount) : '');
    if (selected && !noteOf(selected)) { selected = null; Editor.setOpenNote(null); }
    const active = document.activeElement;
    const keep = active && listEl.contains(active) && active.matches('textarea') ? { cls: active.className, value: active.value, s: active.selectionStart } : null;
    const t = text();
    const shown = notes.filter((n) => filter === 'all' || (filter === 'done' ? n.done : !n.done));
    const rows = shown.map((n) => {
      const q = n.end > n.start ? TDW.Inline.plain(t.slice(n.start, n.end)) : '';
      const last = n.thread.length ? n.thread[n.thread.length - 1] : null;
      const isOpen = n.id === selected;
      const li = UI.el('li', { class: 'notes-row' + (n.done ? ' is-done' : '') + (n.ai ? ' is-ai' : '') + (isOpen ? ' is-open' : '') });
      const check = UI.el('input', { type: 'checkbox', class: 'note-check', checked: !!n.done, 'aria-label': n.done ? 'Done. Mark as open' : 'Mark as done', onchange: (e) => setNote(n.id, { done: e.target.checked }) });
      const head = UI.el('button', { type: 'button', class: 'notes-open', 'aria-expanded': String(isOpen), onclick: () => { if (isOpen) closeNote(); else { Editor.scrollToIndex(n.start, 0.35, true); openNote(n.id); } } },
        UI.el('span', { class: 'notes-quote', text: q ? q.slice(0, 90) + (q.length > 90 ? '…' : '') : 'The words this note was on were deleted' }),
        isOpen ? null : UI.el('span', { class: 'notes-body' }, n.ai ? UI.el('span', { class: 'notes-ai', text: 'AI ' }) : null, n.ai ? (last ? last.text : '') : n.body || ''));
      li.append(UI.el('div', { class: 'notes-line' }, check, head));
      if (isOpen) li.append(detail(n));
      return li;
    });
    if (!rows.length) {
      rows.push(UI.el('li', { class: 'notes-empty' }, filter === 'done' ? 'Nothing done yet.' : notes.length ? 'Every note is done.' : 'No notes yet. Select some words, then Note in the bar or ' + UI.ctrlKeys('Ctrl+Shift+M') + '.'));
    }
    listEl.replaceChildren(...rows);
    if (keep) {
      const again = listEl.querySelector('textarea.' + keep.cls.split(' ').filter(Boolean).join('.'));
      if (again) { again.value = keep.value; again.focus({ preventScroll: true }); try { again.setSelectionRange(keep.s, keep.s); } catch (_) { /* fine */ } }
    }
  }

  function detail(n) {
    const kids = [];
    if (!n.ai || n.body) {
      const body = UI.el('textarea', { class: 'note-body', rows: '1', placeholder: 'Write a note…', 'aria-label': 'Note' });
      body.value = n.body;
      body.addEventListener('change', () => setNote(n.id, { body: body.value }));
      body.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); body.blur(); Editor.focus(); } });
      autosize(body);
      kids.push(body);
    }
    if (n.thread.length) {
      kids.push(UI.el('ol', { class: 'note-thread' }, n.thread.map((m) => {
        const li = UI.el('li', { class: 'note-msg ' + (m.by === 'ai' ? 'by-ai' : 'by-me') },
          UI.el('span', { class: 'note-who', text: m.by === 'ai' ? 'AI' : 'You' }),
          UI.el('p', { class: 'note-text', text: m.text }));
        if (m.options && m.options.length) li.append(optionList(n, m.options));
        return li;
      })));
    }
    if (busyId === n.id) kids.push(UI.el('p', { class: 'hint busy-dots', 'aria-live': 'polite', text: 'Thinking' }));
    const reply = UI.el('textarea', { class: 'field note-reply', rows: '1', placeholder: n.ai ? 'Reply to the AI…' : 'Ask AI about this…', 'aria-label': n.ai ? 'Reply' : 'Ask AI about this' });
    const ask = UI.el('button', { type: 'button', class: 'btn btn-sm', disabled: busyId === n.id }, UI.icon('spark'), 'Ask');
    const go = () => { const v = reply.value.trim(); if (!v) { reply.focus(); return; } reply.value = ''; ask_(n.id, v); };
    ask.addEventListener('click', go);
    reply.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); Editor.focus(); }
    });
    autosize(reply);
    kids.push(UI.el('div', { class: 'note-replybox' }, reply, ask));
    kids.push(UI.el('div', { class: 'note-foot' },
      UI.el('span', { class: 'hint', text: n.at ? (n.ai ? 'Thread started ' : 'Added ') + UI.relTime(n.at).toLowerCase() : '' }),
      UI.el('span', { class: 'note-spacer' }),
      n.end > n.start ? UI.el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Select on the page', onclick: () => { const x = noteOf(n.id); if (x) Editor.select(x.start, x.end); } }) : null,
      UI.el('button', { type: 'button', class: 'icon-btn icon-btn-sm is-danger', 'aria-label': 'Delete note', onclick: () => removeNote(n.id) }, UI.icon('trash'))));
    return UI.el('div', { class: 'note-detail' }, ...kids);
  }

  // The AI's versions: click one to put it on the page (it's an alternative, so the original
  // and the others stay a ↑/↓ away).
  function optionList(n, options) {
    const shown = text().slice(n.start, n.end);
    const ul = UI.el('ul', { class: 'note-options' });
    for (const o of options) {
      const on = o === shown;
      const b = UI.el('button', { type: 'button', class: 'note-option' + (on ? ' is-on' : ''), 'aria-pressed': String(on), title: on ? 'On the page' : 'Try it on the page' },
        UI.el('span', { class: 'note-option-dot', 'aria-hidden': 'true' }), UI.el('span', { text: TDW.Inline.plain(o) }));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => tryOption(n.id, o));
      ul.append(UI.el('li', null, b));
    }
    const alt = altFor(n);
    if (alt && alt.active !== 0) {
      const orig = UI.el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Back to the original', onclick: () => tryOriginal(n.id) });
      orig.addEventListener('mousedown', (e) => e.preventDefault());
      ul.append(UI.el('li', null, orig));
    }
    return ul;
  }

  function altFor(n) { return ann().alts.find((a) => a.start === n.start && a.end === n.end) || null; }

  function ensureAlt(id, options) {
    const n = noteOf(id);
    if (!n || n.end <= n.start) return null;
    const t = text();
    const kind = Marks.kindOf(t, n.start, n.end);
    if (!kind) return null;
    const got = Marks.ensure(t, ann(), kind, n.start, n.end);
    if (!got) return null;
    let next = got.ann;
    const a = next.alts.find((x) => x.id === got.id);
    if (a.start !== n.start || a.end !== n.end) return null;
    next = Marks.addOptions(next, got.id, options, 'ai');
    if (next !== ann()) Editor.change({ ann: next, kind: 'marks', history: false, keepFocus: false });
    return got.id;
  }

  function tryOption(id, o) {
    const n = noteOf(id);
    if (!n) return;
    const altId = ensureAlt(id, [o]);
    if (altId) {
      const a = ann().alts.find((x) => x.id === altId);
      const k = a.options.findIndex((x) => x.text === o);
      const r = Marks.swap(text(), ann(), altId, k);
      if (r) Editor.change({ text: r.text, ann: Marks.updateNote(r.ann, id, { start: r.start, end: r.end }), kind: 'swap', keepFocus: false });
    } else {
      const t = text();
      const nt = t.slice(0, n.start) + o + t.slice(n.end);
      const shifted = Marks.applyChange(Marks.removeNote(ann(), id), t, nt);
      const notes = shifted.notes.concat(Object.assign({}, n, { start: n.start, end: n.start + o.length })).sort((x, y) => x.start - y.start);
      Editor.change({ text: nt, ann: Marks.withAnn(shifted, { notes }), kind: 'swap', keepFocus: false });
    }
    draw();
  }

  function tryOriginal(id) {
    const n = noteOf(id);
    const a = n && altFor(n);
    if (!a) return;
    const r = Marks.swap(text(), ann(), a.id, 0);
    if (r) Editor.change({ text: r.text, ann: Marks.updateNote(r.ann, id, { start: r.start, end: r.end }), kind: 'swap', keepFocus: false });
    draw();
  }

  function setNote(id, patch) {
    Editor.change({ ann: Marks.updateNote(ann(), id, patch), kind: 'marks', keepFocus: false });
    draw();
  }

  function removeNote(id) {
    Editor.change({ ann: Marks.removeNote(ann(), id), kind: 'marks', keepFocus: false });
    if (selected === id) { selected = null; Editor.setOpenNote(null); }
    draw();
    UI.toast('Note deleted', { label: 'Undo', run: () => Editor.undo() });
  }

  /* ---------- Talking to the AI ---------- */
  function contextOf(n) {
    const t = text();
    const par = Marks.paragraphAt(t, n.start);
    const first = t.split('\n').find((l) => l.trim()) || '';
    const a = altFor(n);
    return {
      kind: Marks.kindOf(t, n.start, n.end) || 'paragraph',
      span: t.slice(n.start, n.end),
      paragraph: par ? t.slice(par.start, par.end) : t.slice(n.start, n.end),
      title: TDW.Inline.plain(first).trim(),
      have: a ? a.options.map((o) => o.text) : [t.slice(n.start, n.end)],
      thread: n.thread.slice(-10)
    };
  }

  function ask_(id, msg) {
    const n = noteOf(id);
    if (!n) return;
    if (!TDW.Store.getKey() && !TDW.mockAI) {
      UI.toast('Add your Gemini key in Settings to ask the AI.', { label: 'Settings', run: () => app().openSettings('ai') });
      return;
    }
    const thread = n.thread.concat({ by: 'me', text: msg, at: Date.now() });
    Editor.change({ ann: Marks.updateNote(ann(), id, { thread, ai: true }), kind: 'marks', keepFocus: false });
    askAI(id, msg);
  }

  async function askAI(id, msg) {
    const n = noteOf(id);
    if (!n) return;
    if (aiCtrl) aiCtrl.abort();
    aiCtrl = new AbortController();
    busyId = id;
    draw();
    const input = Object.assign(contextOf(n), { message: msg, thread: n.thread.slice(0, -1).slice(-10) });
    try {
      const res = await TDW.AI.talk(input, aiCtrl.signal);
      const cur = noteOf(id);
      if (!cur) return;
      const options = (res.options || []).filter((o) => o && o !== text().slice(cur.start, cur.end));
      const thread = cur.thread.concat({ by: 'ai', text: res.reply || (options.length ? 'Here are some versions.' : 'No answer.'), at: Date.now(), options });
      Editor.change({ ann: Marks.updateNote(ann(), id, { thread }), kind: 'marks', keepFocus: false });
      if (options.length) ensureAlt(id, options);
    } catch (err) {
      if (!err || err.code !== 'cancelled') UI.toast(TDW.AI.errorMessage(err));
    } finally {
      if (busyId === id) busyId = null;
      draw();
    }
  }

  function togglePanel() {
    if (inFront()) app().setMode('write', { keepLibrary: true });
    else app().openTab('notes');
  }

  /* ---------- Wiring ---------- */
  function wire() {
    build();
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') || app().state.loading) return;
      if (!e.ctrlKey || e.metaKey) return;
      const k = e.code;
      if (e.shiftKey && !e.altKey && k === 'KeyM') {
        e.preventDefault();
        const s = Editor.getSelection();
        if (s.end > s.start && document.activeElement === Editor.rootEl()) compose({ ai: false }); else togglePanel();
      } else if (!e.shiftKey && !e.altKey && k === 'KeyJ') { e.preventDefault(); compose({ ai: true }); }
      else if (e.shiftKey && !e.altKey && k === 'KeyH') {
        e.preventDefault();
        const r = range({ allowEmpty: true });
        if (r.end <= r.start) return;
        const c = lastColor();
        applyColor(r.start, r.end, Marks.colorAt(ann(), r.start, r.end) === c ? null : c);
      }
    });
    // Clicking noted words opens their note in the Notes tab.
    Editor.rootEl().addEventListener('click', (e) => {
      const n = e.target.closest && e.target.closest('[data-note]');
      if (!n) return;
      const s = Editor.getSelection();
      if (s.end > s.start) return;
      openNote(n.dataset.note);
    });
  }

  TDW.Notes = {
    init() { wire(); draw(); },
    load() { endCompose(true); closeColor(); selected = null; busyId = null; if (aiCtrl) { aiCtrl.abort(); aiCtrl = null; } draw(); },
    reload() { draw(); },
    onText() { if (composing) { /* the composer keeps its quote */ } refreshPanel(); },
    onMode(m) { if (m !== 'edit') { endCompose(true); if (selected) { selected = null; Editor.setOpenNote(null); } } },
    onTab(t) { if (t !== 'notes' && composing) endCompose(true); if (t === 'notes') draw(); },
    openPins(ids) {
      if (!ids || !ids.length) return;
      if (ids.length === 1) { if (selected === ids[0] && inFront()) closeNote(); else openNote(ids[0]); }
      else { filter = 'all'; filterSeg.set('all'); selected = ids[0]; app().openTab('notes'); draw(); }
    },
    compose, openNote, colorMenu, colorBlock, applyColor, palette, lastColor,
    togglePanel,
    isCardOpen: () => !!composing
  };
})();
