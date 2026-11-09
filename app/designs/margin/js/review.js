/* Review: the editor's pencil. With the lens on, every fix gets a short note in the margin beside
   its line (blue pencil; spelling in red). Hover a note and its words light up in highlighter;
   open it (click, or rest on it) for what to do: the fix with what it saves, an AI version
   (which joins the text's alternatives), or "Hide these". Clicking marked words opens their
   note. Sentences that are hard to read get a bracket in the left gutter.
   In the narrow layout the notes are chips under their paragraph; a tap opens a sheet.
   Lab checks report here too: their marks get notes with the reason. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { UI, Editor, Engine, Margin } = TDW;
  const { el, icon, money, plural, costNote, toast } = UI;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);

  const KIND = {
    spelling: 'Spelling', veryHard: 'Very hard to read', hard: 'Hard to read', complex: 'Wordy',
    passive: 'Passive', adverb: 'Adverb', qualifier: 'Weakener'
  };
  const SHORT = { spelling: 'Spelling', veryHard: 'Very hard', hard: 'Hard', complex: 'Wordy', passive: 'Passive', adverb: 'Adverb', qualifier: 'Weakener' };
  const MSG = {
    spelling: 'Not in the dictionary.',
    veryHard: 'Readers will lose the thread. Split it or cut it.',
    hard: 'Shorten it, or split it in two.',
    complex: 'A plainer word says the same.',
    passive: 'Say who did what.',
    adverb: 'Cut it, or pick a stronger verb.',
    qualifier: 'Say it like you mean it.'
  };
  const NAMES = { spelling: 'spelling', veryHard: 'very hard sentences', hard: 'hard sentences', complex: 'wordy phrases', passive: 'passive voice', adverb: 'adverbs', qualifier: 'weakeners' };
  const LAB_KIND = { fix: 'Typo', weak: 'Weak sentence', long: 'Runs long', convoluted: 'Convoluted', tone: 'Off tone', hedge: 'Hedge' };
  const INTENSIFIERS = new Set(TDW.Data.INTENSIFIERS);
  const NEXT_WORD = /^[ \t ]+([A-Za-z'’-]+)/;
  const isSentence = (t) => t === 'hard' || t === 'veryHard';

  let analysis = null;     // the analysis the notes show, or null with the lens off
  let notes = [];          // [{ key, kind, issue | lab | fold, node, start, end, line }]
  const pool = new Map();  // key → node
  let openKey = null, pinned = false;
  let hoverTimer = 0, leaveTimer = 0;
  let raf = 0;
  let aiCtrl = null;
  let brackets = [], chipRows = [];
  let msg = null;          // the message check: { state, intent, out, error }

  /* ---------- What the notes are ---------- */
  function sentenceOf(index) {
    const a = app().state.analysis;
    return (a && a.sentenceList.find((r) => r.start <= index && index < r.end)) || null;
  }

  function collect() {
    const out = [];
    const counts = new Map();
    const keyOf = (type, text) => { const k = type + '|' + text; const n = counts.get(k) || 0; counts.set(k, n + 1); return k + '|' + n; };
    const lab = TDW.Lab && TDW.Lab.isRunning && TDW.Lab.isRunning();
    if (lab) {
      for (const m of TDW.Lab.notes()) out.push({ key: keyOf('lab-' + m.type, m.text), kind: 'lab', lab: m, start: m.start, end: m.end, id: m.id });
    } else if (analysis) {
      const hidden = app().hiddenTypes();
      for (const i of analysis.issues) {
        if (hidden.includes(i.type)) continue;
        out.push({ key: keyOf(i.type, i.text), kind: 'issue', issue: i, start: i.start, end: i.end, id: i.id });
      }
    }
    if (analysis) {
      for (const mk of Editor.rootEl().querySelectorAll('.mk-fold')) {
        out.push({ key: 'fold|' + mk.dataset.fold, kind: 'fold', fold: mk.dataset.fold, node0: mk, id: null });
      }
    }
    return out;
  }

  /* ---------- Drawing a note ---------- */
  function quote(s, n) {
    const t = TDW.Inline.plain(String(s || '')).replace(/\s+/g, ' ').trim();
    return t.length > (n || 60) ? t.slice(0, (n || 60) - 1) + '…' : t;
  }

  function headParts(n) {
    if (n.kind === 'fold') return { kind: '…see more', detail: n.fold === 'phone' ? 'on a phone' : 'on a computer', tone: 'red' };
    if (n.kind === 'lab') return { kind: LAB_KIND[n.lab.type] || 'Marked', detail: quote(n.lab.text, 48), tone: n.lab.type === 'fix' ? 'red' : 'blue' };
    const i = n.issue;
    if (isSentence(i.type)) {
      const s = sentenceOf(i.start);
      return { kind: KIND[i.type], detail: s ? s.words + ' words' : '', tone: 'blue' };
    }
    if (i.type === 'complex' && i.suggestion) {
      const first = Editor.matchCase(i.text, i.suggestion.split(', ')[0]);
      return { kind: KIND.complex, detail: el('span', null, el('s', { class: 'rn-del', text: quote(i.text, 30) }), ' ', el('span', { class: 'rn-ins', text: first })), tone: 'blue' };
    }
    return { kind: KIND[i.type], detail: quote(i.text, 40), tone: i.type === 'spelling' ? 'red' : 'blue' };
  }

  function nodeFor(n) {
    let node = pool.get(n.key);
    if (!node) {
      node = el('div', { class: 'rn', dataset: { view: 'review', key: n.key } });
      const row = el('button', { type: 'button', class: 'rn-row', 'aria-expanded': 'false' });
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', () => toggleOpen(node._n.key, true));
      node.append(row);
      node.addEventListener('mouseenter', () => onHover(node._n.key));
      node.addEventListener('mouseleave', () => onLeave(node._n.key));
      node.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNote(true); } });
      pool.set(n.key, node);
      Margin.layer().append(node);
    }
    node._n = n;
    const h = headParts(n);
    const row = node.firstChild;
    const sig = n.key + '\u0001' + (typeof h.detail === 'string' ? h.detail : h.detail.textContent);
    if (node._sig !== sig) {
      node._sig = sig;
      row.replaceChildren(el('span', { class: 'rn-kind', text: h.kind }), ' ', el('span', { class: 'rn-detail' }, h.detail));
      row.setAttribute('aria-label', h.kind + ': ' + (typeof h.detail === 'string' ? h.detail : h.detail.textContent) + '. Open the note.');
    }
    node.className = 'rn tone-' + h.tone + (n.key === openKey ? ' is-open' : '');
    return node;
  }

  /* ---------- Layout: notes, brackets, chips ---------- */
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }

  function draw() {
    const on = !!analysis;
    const narrow = Margin.isNarrow();
    notes = on ? collect() : [];
    const live = new Set(notes.map((n) => n.key));
    for (const [k, node] of pool) {
      if (live.has(k)) continue;
      pool.delete(k);
      fadeOut(node);
    }
    if (openKey && !live.has(openKey)) { openKey = null; pinned = false; }
    Margin.setCount('review', notes.filter((n) => n.kind !== 'fold').length);
    drawSub();
    if (!on) { drawBrackets([]); drawChips([]); return; }
    for (const n of notes) {
      n.line = n.kind === 'fold' ? Editor.blockIndexOf(n.node0) : Editor.lineOfIndex(n.start);
      if (!narrow) nodeFor(n);
    }
    if (narrow) {
      for (const node of pool.values()) node.remove();
      pool.clear();
      drawChips(notes);
    } else {
      drawChips([]);
      const sr = $('surface').getBoundingClientRect();
      const items = notes.map((n) => {
        let y = null;
        if (n.kind === 'fold') { const r = n.node0.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(n.node0.parentNode).lineHeight) || 32; y = r.top + r.height / 2 - sr.top - 10; void lh; }
        else y = Margin.lineY(n.start);
        const node = pool.get(n.key);
        return { node, y, h: node.classList.contains('is-open') ? node.firstChild.offsetHeight : null };
      });
      if (Margin.view() === 'review') Margin.place(items);
      else for (const it of items) it.node._pendingY = it.y;
    }
    drawBrackets(notes.filter((n) => n.kind === 'issue' && isSentence(n.issue.type)));
    markCaretLine();
  }

  function fadeOut(node) {
    if (UI.reducedMotion() || node.style.visibility === 'hidden') { node.remove(); return; }
    node.classList.add('is-gone');
    setTimeout(() => node.remove(), 200);
  }

  // A pencil bracket beside each hard sentence, from its first line to its last.
  function drawBrackets(list) {
    const g = $('gutter');
    const sr = $('surface').getBoundingClientRect();
    let k = 0;
    for (const n of list) {
      const spans = Editor.rootEl().querySelectorAll('[data-id="' + CSS.escape(n.id) + '"]');
      let top = Infinity, bottom = -Infinity;
      for (const s of spans) for (const r of s.getClientRects()) { top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); }
      if (top === Infinity) continue;
      let b = brackets[k];
      if (!b) { b = el('span', { class: 'bracket' }); g.append(b); brackets[k] = b; }
      b.hidden = false;
      b.className = 'bracket b-' + n.issue.type + (n.key === openKey || n.id === hoverId ? ' is-active' : '');
      b.style.top = (top - sr.top - 2) + 'px';
      b.style.height = (bottom - top + 4) + 'px';
      b._key = n.key;
      k++;
    }
    for (let i = k; i < brackets.length; i++) brackets[i].hidden = true;
  }

  // The narrow layout: a row of pencil chips under each paragraph that has notes.
  function drawChips(list) {
    const layer = $('chips');
    const byLine = new Map();
    for (const n of list) {
      if (n.line < 0) continue;
      if (!byLine.has(n.line)) byLine.set(n.line, []);
      byLine.get(n.line).push(n);
    }
    const sr = $('surface').getBoundingClientRect();
    let k = 0;
    for (const [line, ns] of byLine) {
      const b = Editor.block(line);
      if (!b || !b.el) continue;
      const r = b.el.getBoundingClientRect();
      let row = chipRows[k];
      if (!row) { row = el('div', { class: 'chip-row' }); layer.append(row); chipRows[k] = row; }
      row.hidden = false;
      row.style.top = (r.bottom - sr.top - 34) + 'px';
      const shown = ns.slice(0, 3);
      row.replaceChildren(...shown.map((n) => {
        const h = headParts(n);
        const label = n.kind === 'issue' ? SHORT[n.issue.type] : h.kind;
        return el('button', { type: 'button', class: 'rchip tone-' + h.tone, 'aria-label': h.kind + ': ' + (typeof h.detail === 'string' ? h.detail : h.detail.textContent), onclick: () => openSheet(line, n.key) },
          el('span', { class: 'rchip-tick', 'aria-hidden': 'true' }), label);
      }), ...(ns.length > 3 ? [el('button', { type: 'button', class: 'rchip rchip-more', text: '+' + (ns.length - 3), 'aria-label': (ns.length - 3) + ' more notes', onclick: () => openSheet(line, null) })] : []));
      k++;
    }
    for (let i = k; i < chipRows.length; i++) chipRows[i].hidden = true;
  }

  // While you type with the lens on, the notes on the paragraph you're in step back.
  function markCaretLine() {
    const line = Editor.caretLine();
    for (const node of pool.values()) node.classList.toggle('is-caret-line', !!node._n && node._n.line === line);
  }

  /* ---------- The head of the margin while reviewing: grade and the message check ---------- */
  function drawSub() {
    const sub = Margin.sub();
    if (!sub) return;
    const a = analysis;
    if (!a) { sub.replaceChildren(); return; }
    const lab = TDW.Lab && TDW.Lab.isRunning && TDW.Lab.isRunning();
    const label = a.words ? ({ Good: 'easy to read', OK: 'fair to read', Hard: 'hard to read' }[Engine.gradeLabel(a.grade)]) : '';
    const check = el('button', { type: 'button', class: 'mh-action', onclick: startMessage }, icon('target'), el('span', { text: 'Check the message' }));
    check.addEventListener('mousedown', (e) => e.preventDefault());
    const n = notes.filter((x) => x.kind !== 'fold').length;
    sub.replaceChildren(
      el('p', { class: 'mh-grade' }, a.words ? el('b', { text: 'Grade ' + a.grade }) : el('b', { text: 'Nothing to review yet' }), a.words ? ' ' + label : '',
        el('span', { class: 'mh-count', text: lab ? '' : (n ? n + ' ' + plural(n, 'note', 'notes') : a.words ? 'Nothing to fix' : '') })),
      a.words ? check : null);
  }

  /* ---------- Opening a note ---------- */
  let hoverId = null;
  function setHover(id) {
    hoverId = id;
    const open = notes.find((n) => n.key === openKey);
    Editor.setActive(id || (open && open.id) || null);
    for (const b of brackets) if (!b.hidden) b.classList.toggle('is-active', b._key === openKey || (!!id && notes.some((n) => n.key === b._key && n.id === id)));
  }

  function onHover(key) {
    clearTimeout(leaveTimer);
    const n = notes.find((x) => x.key === key);
    if (!n) return;
    setHover(n.id);
    clearTimeout(hoverTimer);
    if (openKey !== key) hoverTimer = setTimeout(() => { if (!pinned || !openKey) openNote(key, false); }, 380);
  }

  function onLeave(key) {
    clearTimeout(hoverTimer);
    leaveTimer = setTimeout(() => {
      setHover(null);
      if (openKey === key && !pinned) closeNote(false);
    }, 220);
  }

  function toggleOpen(key, pin) {
    if (openKey === key && pinned) { closeNote(true); return; }
    openNote(key, pin);
  }

  function openNote(key, pin) {
    const n = notes.find((x) => x.key === key);
    if (!n || Margin.isNarrow()) return;
    if (openKey && openKey !== key) closeNote(false);
    stopAI();
    openKey = key;
    pinned = !!pin;
    const node = nodeFor(n);
    const more = el('div', { class: 'rn-more' });
    fillMore(n, more, false);
    const old = node.querySelector('.rn-more');
    if (old) old.replaceWith(more); else node.append(more);
    node.firstChild.setAttribute('aria-expanded', 'true');
    node.classList.add('is-open');
    setHover(n.id);
    keepInView(node);
    if (pin) { const f = more.querySelector('button'); if (f) f.focus({ preventScroll: true }); }
  }

  function closeNote(refocus) {
    if (!openKey) return;
    stopAI();
    const node = pool.get(openKey);
    openKey = null;
    pinned = false;
    if (node) {
      node.classList.remove('is-open');
      node.firstChild.setAttribute('aria-expanded', 'false');
      const more = node.querySelector('.rn-more');
      if (more) more.remove();
    }
    setHover(null);
    if (refocus) Editor.focus();
  }

  function keepInView(node) {
    requestAnimationFrame(() => {
      const r = node.getBoundingClientRect();
      const over = r.bottom - (UI.visibleBottom() - 16);
      if (over > 0 && r.top - over > 60) window.scrollBy({ top: over, behavior: UI.reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  // From the text: a click on marked words opens their note.
  function openAt(index, labId) {
    if (!analysis) return false;
    let best = null;
    if (labId) best = notes.find((n) => n.id === labId) || null;
    if (!best) {
      for (const n of notes) {
        if (n.kind === 'fold' || !(n.start <= index && index <= n.end)) continue;
        const sent = n.kind === 'issue' && isSentence(n.issue.type);
        const bs = best && best.kind === 'issue' && isSentence(best.issue.type);
        if (!best || (bs && !sent) || (sent === bs && n.end - n.start < best.end - best.start)) best = n;
      }
    }
    if (!best) return false;
    if (Margin.isNarrow()) { openSheet(best.line, best.key); return true; }
    if (Margin.view() !== 'review') Margin.setView('review');
    openNote(best.key, true);
    return true;
  }

  /* ---------- What a note offers ---------- */
  const stillThere = (i) => Editor.getText().slice(i.start, i.end) === i.text;
  const sentenceStartOf = (index) => { const s = sentenceOf(index); return s ? s.start : -1; };

  function done() { closeNote(false); if (Margin.sheetOpen('review')) Margin.closeSheet(); }

  function cutRange(i, start, end) {
    if (!stillThere(i)) { done(); return; }
    done();
    const saved = app().cut(start, end, sentenceStartOf(start));
    if (saved > 0 && Margin.isNarrow()) toast('Cut. ' + money(saved * 10) + ' saved.', { label: 'Undo', run: () => Editor.undo() });
  }

  function swap(i, word) {
    if (!stillThere(i)) { done(); return; }
    done();
    app().edit(i.start, i.end, word);
  }

  const chip = (word, savedWords, onclick, note) => el('button', { type: 'button', class: 'fix', title: note || null, onclick },
    el('span', { class: 'fix-word', text: word }), el('span', { class: 'fix-note', text: costNote(savedWords) }));
  const action = (label, onclick, ic) => el('button', { type: 'button', class: 'rn-act', onclick }, ic ? icon(ic) : null, el('span', { text: label }));

  function needKey() {
    return action('Add a Gemini key for AI help', () => { done(); app().openSettings('ai'); }, 'sliders');
  }

  function stopAI() { if (aiCtrl) { aiCtrl.abort(); aiCtrl = null; } }

  // AI versions become alternatives you read in place; the original stays as the first.
  function offerAlts(start, end, kind, texts, original) {
    const A = TDW.Alts;
    if (!A || !texts.length) return false;
    const text = Editor.getText();
    if (text.slice(start, end) !== original) {
      const k = text.indexOf(original);
      if (k < 0) { toast('That sentence changed. Ask again.'); return true; }
      start = k; end = k + original.length;
    }
    done();
    A.offer({ start, end, kind, options: texts, by: 'ai' });
    return true;
  }

  function busy(box, retry) {
    box.replaceChildren(el('p', { class: 'rn-busy' }, el('span', { class: 'dots', 'aria-hidden': 'true' }), 'Thinking'), action('Stop', () => { stopAI(); retry(); }));
  }

  function aiRewrite(i, box) {
    if (TDW.AI.status() === 'none' && !TDW.mockAI) { box.replaceChildren(needKey()); return; }
    const text = Editor.getText();
    const range = i.type === 'passive' ? sentenceOf(i.start) || i : i;
    const original = text.slice(range.start, range.end);
    const ls = text.lastIndexOf('\n', range.start - 1) + 1;
    let le = text.indexOf('\n', range.end);
    if (le < 0) le = text.length;
    const paragraph = text.slice(ls, le);
    stopAI();
    const c = new AbortController();
    aiCtrl = c;
    const idle = () => fillAI(i, box);
    busy(box, idle);
    const call = i.type === 'passive'
      ? TDW.AI.activeVoice({ sentence: original, paragraph, phrase: i.text }, c.signal)
      : TDW.AI.simplify({ sentence: original, paragraph }, c.signal);
    call.then((out) => {
      if (aiCtrl !== c) return;
      aiCtrl = null;
      if (out.options.length && offerAlts(range.start, range.end, 'sentence', out.options.map((o) => o.text), original)) return;
      box.replaceChildren(el('p', { class: 'rn-error', text: 'The AI had nothing to offer.' }), action('Try again', () => aiRewrite(i, box)));
    }, (err) => {
      if (aiCtrl !== c) return;
      aiCtrl = null;
      if (!err || err.code !== 'cancelled') box.replaceChildren(el('p', { class: 'rn-error', text: TDW.AI.errorMessage(err) }), action('Try again', () => aiRewrite(i, box)));
    });
  }

  function fillAI(i, box) {
    box.replaceChildren(action(i.type === 'passive' ? 'Rewrite with AI' : 'Simplify with AI', () => aiRewrite(i, box), 'spark'));
  }

  // "Stronger word": AI swaps for a weak phrase; they join its alternatives.
  function strongerSlot(target, label) {
    const box = el('div', { class: 'rn-ai' });
    const idle = () => box.replaceChildren(action(label, run, 'spark'));
    function run() {
      if (TDW.AI.status() === 'none' && !TDW.mockAI) { box.replaceChildren(needKey()); return; }
      stopAI();
      const c = new AbortController();
      aiCtrl = c;
      busy(box, idle);
      const s = sentenceOf(target.start);
      const sentence = s ? Editor.getText().slice(s.start, s.end) : target.phrase;
      TDW.AI.stronger({ phrase: target.phrase, sentence }, c.signal).then((out) => {
        if (aiCtrl !== c) return;
        aiCtrl = null;
        if (!out.options.length) { box.replaceChildren(el('p', { class: 'rn-error', text: 'Nothing stronger came back.' })); return; }
        offerAlts(target.start, target.end, 'word', out.options.map((o) => Editor.matchCase(target.phrase, o.text)), target.phrase);
      }, (err) => {
        if (aiCtrl !== c) return;
        aiCtrl = null;
        if (!err || err.code !== 'cancelled') box.replaceChildren(el('p', { class: 'rn-error', text: TDW.AI.errorMessage(err) }), action('Try again', run));
      });
    }
    idle();
    return box;
  }

  function fillMore(n, more, inSheet) {
    if (n.kind === 'fold') {
      more.append(el('p', { class: 'rn-msg', text: n.fold === 'phone'
        ? 'On a phone, LinkedIn shows the post up to this tick. The rest hides behind “…see more”.'
        : 'On a computer, LinkedIn shows the post up to the dashed tick. The rest hides behind “…see more”.' }));
      return;
    }
    if (n.kind === 'lab') {
      const m = n.lab;
      more.append(el('p', { class: 'rn-quote', text: quote(m.text, 140) }), el('p', { class: 'rn-msg', text: m.reason || 'Marked by the Lab.' }));
      const acts = el('div', { class: 'rn-actions' });
      if (m.fix && m.fix !== m.text) acts.append(chip(m.fix, 0, () => { done(); TDW.Lab.applyFix(m.id); }));
      acts.append(action('Dismiss', () => { done(); TDW.Lab.dismiss(m.id); }));
      more.append(acts);
      return;
    }
    const i = n.issue;
    const words = Engine.countWords(i.text);
    const acts = el('div', { class: 'rn-actions' });
    let message = MSG[i.type];
    if (!isSentence(i.type) && inSheet) more.append(el('p', { class: 'rn-quote', text: quote(i.text, 140) }));
    if (isSentence(i.type)) {
      const s = sentenceOf(i.start);
      if (inSheet) more.append(el('p', { class: 'rn-quote', text: quote(i.text, 160) }));
      if (s) message = s.words + ' words. ' + message;
      const box = el('div', { class: 'rn-ai' });
      fillAI(i, box);
      acts.append(box);
    } else if (i.type === 'spelling') {
      const fixes = TDW.Spell.isReady() ? TDW.Spell.suggest(i.text) : [];
      for (const f of fixes) acts.append(chip(f, words - Engine.countWords(f), () => swap(i, f)));
      if (!fixes.length) message = 'Not in the dictionary, and nothing close is.';
      acts.append(action('Add to dictionary', () => { done(); app().addWord(i.text); toast('Added “' + i.text + '” to your dictionary'); }, 'plus'));
    } else if (i.type === 'adverb') {
      acts.append(chip('Cut it', words, () => cutRange(i, i.start, i.end)));
    } else if (i.type === 'qualifier' && i.suggestion && i.cut) {
      message = 'One strong word says it better.';
      for (const alt of i.suggestion.split(', ')) {
        const w = Editor.matchCase(i.text, alt);
        acts.append(chip(w, words - Engine.countWords(alt), () => swap(i, w)));
      }
      const weak = i.text.slice(0, i.cut.end - i.cut.start);
      acts.append(chip('Cut “' + weak + '”', Engine.countWords(weak), () => cutRange(i, i.cut.start, i.cut.end)));
      acts.append(strongerSlot({ start: i.start, end: i.end, phrase: i.text }, 'More options from AI'));
    } else if (i.type === 'qualifier') {
      acts.append(chip('Cut it', words, () => cutRange(i, i.start, i.end)));
      const text = Editor.getText();
      const next = INTENSIFIERS.has(i.text.toLowerCase()) && NEXT_WORD.exec(text.slice(i.end));
      if (next) acts.append(strongerSlot({ start: i.start, end: i.end + next[0].length, phrase: text.slice(i.start, i.end + next[0].length) }, 'A stronger word from AI'));
    } else if (i.type === 'complex' && !i.suggestion) {
      message = 'Cut it; the sentence works without it.';
      acts.append(chip('Cut it', words, () => cutRange(i, i.start, i.end)));
    } else if (i.type === 'complex') {
      for (const alt of i.suggestion.split(', ')) {
        const w = Editor.matchCase(i.text, alt);
        acts.append(chip(w, words - Engine.countWords(alt), () => swap(i, w)));
      }
    } else if (i.type === 'passive') {
      const box = el('div', { class: 'rn-ai' });
      fillAI(i, box);
      acts.append(box);
    }
    const hide = el('button', { type: 'button', class: 'rn-hide', title: 'Stop marking ' + NAMES[i.type] + ' (Settings → Writing brings them back)' }, icon('eyeOff'), el('span', { text: 'Hide ' + NAMES[i.type] }));
    hide.addEventListener('click', () => {
      done();
      app().toggleHighlight(i.type);
      toast('Hiding ' + NAMES[i.type], { label: 'Undo', run: () => app().toggleHighlight(i.type) });
    });
    more.prepend(el('p', { class: 'rn-msg', text: message }));
    more.append(acts, hide);
  }

  /* ---------- The narrow layout: a sheet for a paragraph's notes ---------- */
  function openSheet(line, key) {
    const list = notes.filter((n) => n.line === line);
    if (!list.length) return;
    if (key) list.sort((a, b) => (a.key === key ? -1 : b.key === key ? 1 : 0));
    const body = el('div', { class: 'rn-sheet' }, list.map((n) => {
      const h = headParts(n);
      const more = el('div', { class: 'rn-more' });
      fillMore(n, more, true);
      return el('section', { class: 'rn-card tone-' + h.tone }, el('h3', { class: 'rn-card-kind', text: h.kind }), more);
    }));
    const first = list[0];
    Editor.setActive(first.id);
    Margin.openSheet('review', list.length > 1 ? list.length + ' notes on this paragraph' : headParts(first).kind, body, { onClose: () => { stopAI(); Editor.setActive(null); } });
    const s = Editor.block(line);
    if (s && s.el) {
      const r = s.el.getBoundingClientRect();
      if (r.top < 60 || r.top > window.innerHeight * 0.4) window.scrollBy({ top: r.top - 70, behavior: UI.reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  /* ---------- Check the message (AI), answered in a card at the margin's foot ---------- */
  const VERDICT = { clear: 'Clear', mixed: 'Mixed', unclear: 'Unclear' };
  const MATCH = { yes: 'yes', partly: 'partly', no: 'no' };

  function startMessage() {
    if (TDW.AI.status() === 'none' && !TDW.mockAI) { app().openSettings('ai'); return; }
    if (!Editor.getText().trim()) { toast('Write something to check first.'); return; }
    msg = { state: 'ask', intent: (app().state.draft && app().state.draft.intent) || '' };
    drawMessage();
    requestAnimationFrame(() => { const t = document.querySelector('.pcard .msg-intent'); if (t) t.focus(); });
  }

  function runMessage() {
    stopMsg();
    const c = new AbortController();
    msg.ctrl = c;
    msg.state = 'busy';
    drawMessage();
    TDW.AI.messageCheck({ text: Editor.getText(), intent: msg.intent }, c.signal).then((out) => {
      if (!msg || msg.ctrl !== c) return;
      msg.state = 'done';
      msg.out = out;
      drawMessage();
    }, (err) => {
      if (!msg || msg.ctrl !== c) return;
      if (err && err.code === 'cancelled') return;
      msg.state = 'error';
      msg.error = TDW.AI.errorMessage(err);
      drawMessage();
    });
  }

  function stopMsg() { if (msg && msg.ctrl) { msg.ctrl.abort(); msg.ctrl = null; } }
  function endMessage() { stopMsg(); msg = null; Margin.unpin('message'); }

  function sharper(label, text, which) {
    const use = el('button', { type: 'button', class: 'rn-act', text: 'Use as the ' + which });
    use.addEventListener('click', () => {
      const list = Engine.analyze(Editor.getText()).sentenceList;
      const r = which === 'opening' ? list[0] : list[list.length - 1];
      if (!r) return;
      app().edit(r.start, r.end, text);
      use.disabled = true;
      use.textContent = 'Used';
    });
    return el('div', { class: 'msg-block' }, el('h4', { text: label }), el('p', { class: 'msg-text', text }), use);
  }

  function drawMessage() {
    if (!msg) return;
    const actions = [];
    let body;
    if (msg.state === 'ask') {
      const area = el('textarea', { class: 'field msg-intent', rows: '3', placeholder: 'What should a busy reader take away? (optional)', 'aria-label': 'What you meant' });
      area.value = msg.intent;
      area.addEventListener('input', () => { msg.intent = area.value; });
      area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
      const go = () => { app().setIntent(area.value.trim()); msg.intent = area.value.trim(); runMessage(); };
      body = area;
      actions.push({ label: 'Check', primary: true, run: go }, { label: 'Cancel', run: endMessage });
    } else if (msg.state === 'busy') {
      body = el('p', { class: 'rn-busy' }, el('span', { class: 'dots', 'aria-hidden': 'true' }), 'Reading the whole draft');
      actions.push({ label: 'Stop', run: endMessage });
    } else if (msg.state === 'error') {
      body = el('p', { class: 'rn-error', text: msg.error });
      actions.push({ label: 'Try again', primary: true, run: runMessage }, { label: 'Close', run: endMessage });
    } else {
      const out = msg.out;
      const kids = [el('div', { class: 'msg-block' }, el('h4', { text: 'Readers will take away' }), el('p', { class: 'msg-text', text: out.takeaway }),
        el('p', { class: 'msg-meta' }, VERDICT[out.verdict] ? el('b', { text: VERDICT[out.verdict] }) : null,
          out.match !== 'none' && MATCH[out.match] ? (VERDICT[out.verdict] ? '. ' : '') + 'Matches what you meant: ' + MATCH[out.match] + '.' : ''),
        out.why ? el('p', { class: 'msg-why', text: out.why }) : null)];
      if (out.offMessage.length) {
        kids.push(el('div', { class: 'msg-block' }, el('h4', { text: 'Off message' }), el('ul', { class: 'msg-off' }, out.offMessage.map((o) => el('li', null,
          el('button', { type: 'button', class: 'msg-quote', text: o.quote, onclick: () => { const k = Editor.getText().indexOf(o.quote); if (k >= 0) Editor.select(k, k + o.quote.length); } }),
          o.reason ? el('p', { class: 'msg-why', text: o.reason }) : null)))));
      }
      if (out.strongerOpening) kids.push(sharper('A sharper opening', out.strongerOpening, 'opening'));
      if (out.strongerEnding) kids.push(sharper('A sharper ending', out.strongerEnding, 'ending'));
      body = el('div', { class: 'msg-out' }, kids);
      actions.push({ label: 'Done', run: endMessage }, { label: 'Ask again', run: () => { msg.state = 'ask'; drawMessage(); } });
    }
    Margin.pin('message', { title: 'Check the message', meta: msg.state === 'busy' ? 'Reading…' : '', body, actions, tone: 'blue', busy: msg.state === 'busy' });
  }

  /* ---------- Wiring ---------- */
  function onEditorClick(e) {
    if (!analysis) return;
    const s = Editor.getSelection();
    if (s.end > s.start) return;
    const lab = e.target.closest && e.target.closest('[data-lab]');
    if (lab && /lab-trim/.test(lab.className)) return;
    const hit = e.target.closest && e.target.closest('[data-id], [data-lab]');
    if (!hit) { if (pinned) closeNote(false); return; }
    openAt(s.end, lab ? lab.dataset.lab : null);
  }

  function init() {
    Editor.rootEl().addEventListener('click', onEditorClick);
    Margin.onChange((v) => {
      if (v !== 'review' && openKey) closeNote(false);
      if (analysis) schedule();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]:modal') || UI.menuOpen()) return;
      if (openKey) { e.preventDefault(); closeNote(true); }
    });
    document.addEventListener('pointerdown', (e) => {
      if (!openKey || !pinned) return;
      const t = e.target;
      if (t.closest && (t.closest('.rn') || t.closest('#editor') || t.closest('.menu') || t.closest('dialog'))) return;
      closeNote(false);
    }, true);
    window.addEventListener('resize', schedule);
  }

  TDW.Review = {
    init,
    render(a) {
      analysis = a || null;
      if (!analysis) { closeNote(false); if (Margin.sheetOpen('review')) Margin.closeSheet(true); }
      schedule();
    },
    onMode(m) {
      // The lens class lands a frame or two later and gives paragraphs room for chips.
      if (m === 'edit') { if (!Margin.isNarrow() && Margin.view() !== 'alts') Margin.setView('review'); setTimeout(schedule, 80); }
      else if (Margin.view() === 'review') Margin.setView(null);
    },
    onSelect() { markCaretLine(); },
    onLayout: schedule,
    load() { closeNote(false); endMessage(); },
    openAt, startMessage, closeNote,
    isOpen: () => !!openKey,
    redraw: schedule
  };
})();
