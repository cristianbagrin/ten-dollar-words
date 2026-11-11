/* Colors, notes and talking to the AI about the draft.
   - Color: select text and pick a text color or a background (the bubble's "A", the block
     menu's Color, or "/red", "/yellow background"). In Notion it's the same color.
   - Notes for future you: select text and add a note (Ctrl+Shift+M, the bubble's speech mark,
     or "/note"). The words get a faint underline and a mark in the margin. A note can be a
     to-do: tick it off when it's done. They sit in the margin beside their words.
   - Ask AI: a note you write to the AI (the bubble's ✦, Ctrl+J, or "/ai"). Ask for "a punchier
     version" or "is this clear?" and it answers in the thread, like a comment in a design tool.
     Versions it suggests join the text's alternatives, so you flip through them in place
     (A/B) and keep the one you like. It never changes the page by itself. */
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

  /* ---------- The note card ---------- */

  let card = null; // { node, id, draft: bool, range }
  let cardFrom; // the margin view before a card opened it
  let aiCtrl = null;

  function rectOf(start, end) {
    const a = Editor.rectAt(start), b = Editor.rectAt(Math.max(start, end));
    if (!a) return null;
    const top = a.lineTop, bottom = (b || a).lineTop + (b || a).lh;
    return { left: a.left, right: b ? b.left : a.left, top, bottom };
  }

  // Beside its words in the margin; in a sheet in the narrow layout.
  function placeCard(start) {
    if (!card) return;
    const M = TDW.Margin;
    if (M.isNarrow()) return;
    M.place([{ node: card.node, y: M.lineY(start) }].concat(rows.filter((r) => r.id !== card.id).map((r) => ({ node: r.node, y: r.y, h: r.node.offsetHeight }))));
  }

  function mountCard(node, title) {
    const M = TDW.Margin;
    node.classList.add('nn', 'is-open');
    node.dataset.view = 'notes';
    if (M.isNarrow()) { M.openSheet('notes', title, node, { onClose: () => { if (card && card.node === node) closeCard(true); } }); return; }
    M.layer().append(node);
    if (M.view() !== 'notes') { cardFrom = M.view(); M.setView('notes'); }
  }

  // New: a note (or a message to the AI) on the selection.
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
    closeCard(true);
    TDW.Bubble && TDW.Bubble.hide();
    const node = UI.el('div', { class: 'note-card' + (ai ? ' is-ai' : ''), role: 'dialog', 'aria-label': ai ? 'Ask AI' : 'New note' });
    const quote = UI.el('div', { class: 'note-quote', text: TDW.Inline.plain(text().slice(r.start, r.end)).slice(0, 160) });
    const input = UI.el('textarea', { class: 'note-input', rows: '2', placeholder: ai ? 'Ask AI to rewrite, shorten, judge…' : 'A note for later: a to-do, an idea, a question…', 'aria-label': ai ? 'Message to the AI' : 'Note' });
    const chips = ai ? UI.el('div', { class: 'note-chips' }, ['Other ways to say this', 'Make it punchier', 'Shorter', 'Simpler words', 'Is this clear?'].map((q) =>
      UI.el('button', { type: 'button', class: 'chip note-chip', text: q, onclick: () => { input.value = q; send(); } }))) : null;
    const save = UI.el('button', { type: 'button', class: 'btn btn-sm', text: ai ? 'Ask' : 'Add note' });
    const swap = UI.el('button', { type: 'button', class: 'btn-quiet btn-sm note-swap', text: ai ? 'Just a note' : '✦ Ask AI instead' });
    const foot = UI.el('div', { class: 'note-foot' }, UI.el('span', { class: 'note-spacer' }), swap, save);
    node.append(quote, input, chips, foot);
    mountCard(node, ai ? 'Ask AI' : 'New note');
    card = { node, id: null, range: r, ai, marked: false };
    Editor.setOpenNote(null);
    // Show what the note is on while you write it (unless the Lab's marks are showing).
    if (!Editor.getLab().length && r.end > r.start) { Editor.setLab([{ start: r.start, end: r.end, type: 'note-target', id: 'note-target' }]); card.marked = true; }
    const send = () => {
      const msg = input.value.trim();
      if (!msg) { input.focus(); return; }
      const got = Marks.addNote(ann(), r.start, r.end, ai
        ? { ai: true, body: '', thread: [{ by: 'me', text: msg, at: Date.now() }] }
        : { body: msg, done: false });
      if (!got) { UI.toast('This draft has as many notes as it can hold.'); return; }
      if (card && card.marked) { Editor.setLab([]); card.marked = false; }
      Editor.change({ ann: got.ann, kind: 'marks', keepFocus: false });
      const id = got.id;
      closeCard(true);
      openNote(id);
      if (ai) askAI(id, msg);
      refreshPanel();
    };
    save.addEventListener('click', send);
    swap.addEventListener('click', () => { const v = input.value; compose({ ai: !ai }); if (card) card.node.querySelector('textarea').value = v; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeCard(); }
    });
    autosize(input);
    placeCard(r.start, r.end);
    input.focus({ preventScroll: true });
  }

  function autosize(t) {
    const go = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; };
    t.addEventListener('input', go);
    requestAnimationFrame(go);
  }

  // An existing note: its words, its body (editable), the thread, a reply box.
  function openNote(id) {
    const n = noteOf(id);
    if (!n) return;
    closeCard(true);
    const node = UI.el('div', { class: 'note-card' + (n.ai ? ' is-ai' : '') + (n.done ? ' is-done' : ''), role: 'dialog', 'aria-label': n.ai ? 'Conversation with the AI' : 'Note' });
    card = { node, id, range: { start: n.start, end: n.end }, ai: n.ai };
    Editor.setOpenNote(id);
    drawCard();
    mountCard(node, n.ai ? 'AI thread' : 'Note');
    placeCard(n.start, n.end);
    const input = node.querySelector('.note-reply');
    if (input && n.ai) input.focus({ preventScroll: true });
  }

  function drawCard() {
    if (!card || !card.id) return;
    const n = noteOf(card.id);
    if (!n) { closeCard(true); return; }
    const t = text();
    const node = card.node;
    node.classList.toggle('is-done', !!n.done);
    const quoteText = n.end > n.start ? TDW.Inline.plain(t.slice(n.start, n.end)) : '';
    const head = UI.el('div', { class: 'note-head' },
      UI.el('label', { class: 'note-check', title: n.done ? 'Mark as not done' : 'Mark as done' },
        UI.el('input', { type: 'checkbox', checked: !!n.done, 'aria-label': 'Done', onchange: (e) => setNote(n.id, { done: e.target.checked }) })),
      UI.el('span', { class: 'note-kind', text: n.ai ? '✦ AI thread' : 'Note' }),
      UI.el('span', { class: 'note-when', text: n.at ? UI.relTime(n.at) : '' }),
      UI.el('button', { type: 'button', class: 'btn-icon note-del', 'aria-label': 'Delete note', title: 'Delete note', onclick: () => removeNote(n.id) }, UI.icon('trash') || '×'),
      UI.el('button', { type: 'button', class: 'btn-icon note-x', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => closeCard() }, UI.icon('close')));
    const quote = quoteText
      ? UI.el('button', { type: 'button', class: 'note-quote', text: quoteText.slice(0, 160) + (quoteText.length > 160 ? '…' : ''), title: 'Select it on the page', onclick: () => { Editor.select(n.start, n.end); } })
      : UI.el('div', { class: 'note-quote is-gone', text: 'The words this note was on were deleted.' });
    const kids = [head, quote];
    if (!n.ai || n.body) {
      const body = UI.el('textarea', { class: 'note-body', rows: '1', placeholder: 'Write a note…', 'aria-label': 'Note' });
      body.value = n.body;
      body.addEventListener('change', () => setNote(n.id, { body: body.value }));
      body.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); body.blur(); closeCard(); } });
      autosize(body);
      kids.push(body);
    }
    if (n.thread.length) {
      const list = UI.el('ol', { class: 'note-thread' });
      n.thread.forEach((m) => {
        const li = UI.el('li', { class: 'note-msg ' + (m.by === 'ai' ? 'by-ai' : 'by-me') },
          UI.el('span', { class: 'note-who', text: m.by === 'ai' ? '✦ AI' : 'You' }),
          UI.el('p', { class: 'note-text', text: m.text }));
        if (m.options && m.options.length) li.append(optionList(n, m.options));
        list.append(li);
      });
      kids.push(list);
    }
    if (card.busy) kids.push(UI.el('div', { class: 'note-busy', 'aria-live': 'polite' }, UI.el('span', { class: 'dots' }), ' thinking'));
    const reply = UI.el('textarea', { class: 'note-reply', rows: '1', placeholder: n.ai ? 'Reply to the AI…' : 'Ask AI about this…', 'aria-label': 'Reply' });
    const ask = UI.el('button', { type: 'button', class: 'btn btn-sm', text: '✦ Ask', disabled: !!card.busy });
    const go = () => { const v = reply.value.trim(); if (!v) { reply.focus(); return; } reply.value = ''; ask_(n.id, v); };
    ask.addEventListener('click', go);
    reply.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeCard(); }
    });
    autosize(reply);
    kids.push(UI.el('div', { class: 'note-replybox' }, reply, ask));
    const keepFocus = node.contains(document.activeElement) && document.activeElement.classList.contains('note-reply');
    node.replaceChildren(...kids);
    if (keepFocus) node.querySelector('.note-reply').focus({ preventScroll: true });
  }

  // The AI's versions: click one to put it on the page (it's an alternative, so the original
  // and the others stay a ↑/↓ away).
  function optionList(n, options) {
    const t = text();
    const shown = t.slice(n.start, n.end);
    const ul = UI.el('ul', { class: 'note-options' });
    for (const o of options) {
      const on = o === shown;
      const b = UI.el('button', { type: 'button', class: 'note-option' + (on ? ' is-on' : ''), title: on ? 'On the page' : 'Try it on the page' },
        UI.el('span', { class: 'note-option-dot', 'aria-hidden': 'true' }), UI.el('span', { text: TDW.Inline.plain(o) }));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => tryOption(n.id, o));
      ul.append(UI.el('li', null, b));
    }
    const orig = UI.el('button', { type: 'button', class: 'btn-quiet btn-sm note-orig', text: 'Back to the original', onclick: () => tryOriginal(n.id) });
    orig.addEventListener('mousedown', (e) => e.preventDefault());
    const alt = altFor(n);
    if (alt && alt.active !== 0) ul.append(UI.el('li', null, orig));
    return ul;
  }

  // The alternative that sits exactly on a note's words, if any.
  function altFor(n) {
    return ann().alts.find((a) => a.start === n.start && a.end === n.end) || null;
  }

  // The note's words as an alternative with these options (made if needed). Returns its id.
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
    if (a.start !== n.start || a.end !== n.end) return null; // another alternative covers it
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
      if (r) {
        // The note follows its words to their new length.
        const ann2 = Marks.updateNote(r.ann, id, { start: r.start, end: r.end });
        Editor.change({ text: r.text, ann: ann2, kind: 'swap', keepFocus: false });
      }
    } else {
      // Across lines: replace it, one undo step.
      const t = text();
      const nt = t.slice(0, n.start) + o + t.slice(n.end);
      const shifted = Marks.applyChange(Marks.removeNote(ann(), id), t, nt);
      const notes = shifted.notes.concat(Object.assign({}, n, { start: n.start, end: n.start + o.length })).sort((x, y) => x.start - y.start);
      Editor.change({ text: nt, ann: Marks.withAnn(shifted, { notes }), kind: 'swap', keepFocus: false });
    }
    drawCard();
  }

  function tryOriginal(id) {
    const n = noteOf(id);
    const a = n && altFor(n);
    if (!a) return;
    const r = Marks.swap(text(), ann(), a.id, 0);
    if (r) Editor.change({ text: r.text, ann: Marks.updateNote(r.ann, id, { start: r.start, end: r.end }), kind: 'swap', keepFocus: false });
    drawCard();
  }

  function setNote(id, patch) {
    Editor.change({ ann: Marks.updateNote(ann(), id, patch), kind: 'marks', keepFocus: false });
    drawCard();
    refreshPanel();
  }

  function removeNote(id) {
    Editor.change({ ann: Marks.removeNote(ann(), id), kind: 'marks', keepFocus: false });
    closeCard();
    refreshPanel();
    UI.toast('Note deleted.', { label: 'Undo', run: () => Editor.undo() });
  }

  function closeCard(silent) {
    if (!card) return;
    if (card.id) {
      const body = card.node.querySelector('.note-body');
      const n = noteOf(card.id);
      if (body && n && body.value !== n.body) Editor.change({ ann: Marks.updateNote(ann(), card.id, { body: body.value }), kind: 'marks', keepFocus: false });
    } else if (card.marked) Editor.setLab([]);
    const old = card.node;
    card = null;
    if (TDW.Margin.sheetOpen('notes') && TDW.Margin.sheetBody().contains(old)) TDW.Margin.closeSheet();
    old.remove();
    Editor.setOpenNote(null);
    // A card that opened the margin just for itself gives it back.
    { const v = cardFrom; cardFrom = undefined; if (v !== undefined && TDW.Margin.view() === 'notes') TDW.Margin.setView(v); }
    refreshPanel();
    if (!silent) Editor.focus();
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
    if (card && card.id === id) { card.busy = true; drawCard(); }
    const input = Object.assign(contextOf(n), { message: msg, thread: n.thread.slice(0, -1).slice(-10) });
    try {
      const res = await TDW.AI.talk(input, aiCtrl.signal);
      const cur = noteOf(id);
      if (!cur) return;
      const options = (res.options || []).filter((o) => o && o !== text().slice(cur.start, cur.end));
      const thread = cur.thread.concat({ by: 'ai', text: res.reply || (options.length ? 'Here are some versions.' : 'No answer.'), at: Date.now(), options });
      Editor.change({ ann: Marks.updateNote(ann(), id, { thread }), kind: 'marks', keepFocus: false });
      // Its versions join the alternatives, so ↑/↓ on the page flips through them.
      if (options.length) ensureAlt(id, options);
    } catch (err) {
      if (!err || err.code !== 'cancelled') UI.toast(TDW.AI.errorMessage(err));
    } finally {
      if (card && card.id === id) { card.busy = false; drawCard(); placeCard(card.range.start, card.range.end); }
      refreshPanel();
    }
  }

  /* ---------- Notes in the margin, beside their words ---------- */

  let rows = [];        // [{ id, node, y }] on a computer
  let filter = 'open';  // the list in the narrow layout
  const M = () => TDW.Margin;

  function noteLine(n) {
    const last = n.thread.length ? n.thread[n.thread.length - 1] : null;
    const body = n.ai ? (last ? last.text : 'AI thread') : (n.body || 'Empty note');
    return { body, meta: n.ai ? n.thread.length + (n.thread.length === 1 ? ' message' : ' messages') : (n.end > n.start ? '' : 'Its words were deleted') };
  }

  function refreshPanel() {
    const notes = ann().notes || [];
    M().setCount('notes', notes.filter((n) => !n.done).length);
    if (M().isNarrow()) {
      for (const r of rows) r.node.remove();
      rows = [];
      if (M().sheetOpen('notes') && !card) drawList(M().sheetBody().querySelector('.notes-list-wrap'));
      return;
    }
    if (M().view() !== 'notes') return;
    const keep = new Map(rows.map((r) => [r.id, r]));
    rows = [];
    for (const n of notes) {
      if (card && card.id === n.id) continue;
      let r = keep.get(n.id);
      keep.delete(n.id);
      if (!r) {
        const node = UI.el('div', { class: 'nn', dataset: { view: 'notes' } });
        r = { id: n.id, node };
        M().layer().append(node);
      }
      const l = noteLine(n);
      r.node.className = 'nn' + (n.done ? ' is-done' : '') + (n.ai ? ' is-ai' : '');
      const b = UI.el('button', { type: 'button', class: 'nn-row', 'aria-label': 'Open the note: ' + l.body },
        UI.el('span', { class: 'nn-body', text: (n.ai ? '✦ ' : '') + l.body }), l.meta ? UI.el('span', { class: 'nn-meta', text: l.meta }) : null);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => openNote(n.id));
      b.addEventListener('mouseenter', () => Editor.setOpenNote(n.id));
      b.addEventListener('mouseleave', () => Editor.setOpenNote(card && card.id ? card.id : null));
      r.node.replaceChildren(b);
      r.y = M().lineY(n.start);
      rows.push(r);
    }
    for (const r of keep.values()) r.node.remove();
    const items = rows.map((r) => ({ node: r.node, y: r.y }));
    if (card) { const n = card.id ? noteOf(card.id) : null; items.push({ node: card.node, y: M().lineY(n ? n.start : card.range.start), h: 26 }); }
    M().place(items);
  }

  // The narrow layout: every note in a sheet, Open or Done.
  function drawList(wrap) {
    if (!wrap) return;
    const notes = ann().notes || [];
    const t = text();
    const shown = notes.filter((n) => filter === 'all' || (filter === 'done' ? n.done : !n.done));
    wrap.replaceChildren(...(shown.length ? shown.map((n) => {
      const q = n.end > n.start ? TDW.Inline.plain(t.slice(n.start, n.end)) : '';
      const l = noteLine(n);
      return UI.el('button', { type: 'button', class: 'rn-card note-list-row', onclick: () => { Editor.scrollToIndex(n.start, 0.25, true); openNote(n.id); } },
        UI.el('span', { class: 'note-quote', text: q ? q.slice(0, 120) : 'Deleted words' }), UI.el('span', { class: 'note-text', text: l.body }));
    }) : [UI.el('p', { class: 'hint', text: filter === 'done' ? 'Nothing done yet.' : 'No notes. Select some words and add one.' })]));
  }

  function showAll() {
    cardFrom = undefined;
    closeCard(true);
    if (M().isNarrow()) {
      closeCard(true);
      const wrap = UI.el('div', { class: 'notes-list-wrap' });
      const seg = UI.segmented({ label: 'Show', value: filter, options: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }], onChange: (v) => { filter = v; drawList(wrap); } });
      drawList(wrap);
      M().openSheet('notes', 'Notes', UI.el('div', null, UI.el('div', { class: 'notes-filter' }, seg), wrap), { tall: true });
      return;
    }
    M().setView('notes');
    refreshPanel();
    if (!(ann().notes || []).length) UI.toast('No notes yet. Select some words and press ' + (IS_MAC ? '⌃⇧M' : 'Ctrl+Shift+M') + '.');
  }

  function togglePanel() {
    if ((M().view() === 'notes' && !card) || M().sheetOpen('notes')) {
      closeCard(true);
      if (M().sheetOpen('notes')) M().closeSheet();
      else M().setView(app().state.mode === 'edit' ? 'review' : null);
      Editor.focus();
    } else showAll();
  }

  /* ---------- Wiring ---------- */

  function wire() {
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]:modal') || app().state.loading) return;
      if (e.key === 'Escape' && card && !e.defaultPrevented) {
        if (card.node.contains(e.target) || document.activeElement === Editor.rootEl()) { e.preventDefault(); closeCard(); return; }
      }
      if (!e.ctrlKey || e.metaKey) return;
      const k = e.code;
      if (e.shiftKey && !e.altKey && k === 'KeyM') {
        e.preventDefault();
        const s = Editor.getSelection();
        if (s.end > s.start) compose({ ai: false }); else togglePanel();
      } else if (!e.shiftKey && !e.altKey && k === 'KeyJ') { e.preventDefault(); compose({ ai: true }); }
      else if (e.shiftKey && !e.altKey && k === 'KeyH') {
        e.preventDefault();
        const r = range({ allowEmpty: true });
        if (r.end <= r.start) return;
        const c = lastColor();
        applyColor(r.start, r.end, Marks.colorAt(ann(), r.start, r.end) === c ? null : c);
      }
    });
    Editor.rootEl().addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-note]');
      if (!el) return;
      const s = Editor.getSelection();
      if (s.end > s.start) return;
      openNote(el.dataset.note);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!card || card.node.contains(e.target)) return;
      if (e.target.closest && (e.target.closest('.note-pin') || e.target.closest('[data-note]') || e.target.closest('.bubble') || e.target.closest('dialog') || e.target.closest('.menu'))) return;
      closeCard(true);
    }, true);
    M().onChange((v) => {
      if (v !== 'notes' && card && !M().isNarrow()) closeCard(true);
      if (v === 'notes') refreshPanel(); else if (!M().isNarrow()) { for (const r of rows) r.node.remove(); rows = []; }
    });
  }

  TDW.Notes = {
    init() { wire(); refreshPanel(); },
    load() { closeCard(true); closeColor(); refreshPanel(); },
    reload() { if (card && card.id && !noteOf(card.id)) closeCard(true); else drawCard(); refreshPanel(); },
    onText() { if (card && card.id) { const n = noteOf(card.id); if (n) card.range = { start: n.start, end: n.end }; } refreshPanel(); },
    onLayout() { refreshPanel(); },
    onMode() {},
    openPins(ids) {
      if (!ids || !ids.length) return;
      if (ids.length === 1) { if (card && card.id === ids[0]) closeCard(); else openNote(ids[0]); }
      else showAll();
    },
    compose, openNote, colorMenu, colorBlock, applyColor, palette, lastColor, showAll,
    togglePanel,
    isCardOpen: () => !!card
  };
})();
