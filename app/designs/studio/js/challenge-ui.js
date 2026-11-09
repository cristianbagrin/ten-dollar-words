/* Writing challenges on the page: the Challenge button, its menu and picker, and the card with
   the live checklist. Challenges only check; they never stop you typing. The rules live in
   challenges.js (TDW.ChallengeRules). The running challenge is saved on the draft as
   d.challenge, so it survives a reload and travels with the account. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const R = () => TDW.ChallengeRules;
  const app = () => TDW.App;
  const el = (...a) => TDW.UI.el(...a);

  const STREAK_KEY = 'tdw.challengeStreak';
  const LEVEL_KEY = 'tdw.challengeLevel';
  const TICK_MS = 1000;

  let draft = null;
  let btn = null, card = null, picker = null;
  let timer = 0;
  let renderRaf = 0;
  let aiCtrl = null;
  let busy = '';            // what the AI is doing right now ('set', 'judge', 'skeptic'), for the card
  let lastTypeAt = 0;
  let ghostedSinceType = false;
  let selfChange = false;   // our own edits (D3's ghost) aren't typing
  let lastTickAt = 0;
  let collapsed = false;

  /* ---------- Small storage helpers (this browser only) ---------- */

  function readJSON(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* storage blocked */ } }
  const level = () => { const l = readJSON(LEVEL_KEY, 'medium'); return R().LEVELS.includes(l) ? l : 'medium'; };
  const today = () => R().dayIso(Date.now());
  const hasAI = () => !!TDW.AI && TDW.AI.status() !== 'none';

  /* ---------- The running challenge ---------- */

  const ch = () => (draft && draft.challenge) || null;
  const text = () => (app() && app().masked ? app().masked() : TDW.Editor.getText());
  const cleanText = () => (app() && app().publishText ? app().publishText() : TDW.Editor.getText());
  const isTimed = (c) => !!c && c.items.some((it) => { const x = R().get(it.id); return x && x.timed; });
  const has = (c, id) => !!c && c.items.some((it) => it.id === id);
  const item = (c, id) => c && c.items.find((it) => it.id === id);

  function save() {
    if (!draft) return;
    if (app()) app().markDirty();
    if (TDW.Account && TDW.Account.noteDraft) TDW.Account.noteDraft(draft);
  }

  function elapsed(c) { return Math.max(0, Date.now() - (c.startedAt || Date.now())); }

  // The first line's alternatives (E14): how many openings are written so far.
  function firstLineAlt() {
    const t = TDW.Editor.getText();
    const ann = TDW.Editor.getAnnotations();
    const nl = t.indexOf('\n');
    const end = nl < 0 ? t.length : nl;
    return ann.alts.find((a) => a.start < end) || null;
  }

  function ctxOf(c) {
    const alt = has(c, 'E14') ? firstLineAlt() : null;
    return { budget: draft ? draft.budget : 0, elapsedMs: elapsed(c), judge: c.judge || {}, hooks: alt ? alt.options.length : 0 };
  }

  function start(ids, lv, opts) {
    if (!draft || !ids.length) return;
    const o = opts || {};
    if (ch()) finish(false);
    const t = text();
    const words = TDW.Engine.countWords(t);
    for (const id of ids) {
      const c = R().get(id);
      if (c.needsText && words < c.needsText) {
        TDW.UI.toast('Write a little first: “' + c.name + '” works on what you have.');
        return;
      }
      if (c.hooks && !t.split('\n').find((l) => l.trim())) {
        TDW.UI.toast('Write your first line first: “' + c.name + '” puts the openings there.');
        return;
      }
    }
    const rand = o.seed != null ? R().seeded(o.seed) : Math.random;
    const items = ids.map((id) => R().startItem(id, lv, t, { budget: draft.budget }, rand)).filter(Boolean);
    const c = {
      v: 1, items, startedAt: Date.now(), activeMs: 0, judge: {}, topic: '', setup: null, error: '', metAt: 0,
      daily: o.daily || null, combo: ids.length > 1,
      prev: { budget: draft.budget, nb: typeof draft.nb === 'boolean' ? draft.nb : null, off: app() ? app().backspaceOff(draft) : false, changedNb: false }
    };
    draft.challenge = c;
    collapsed = false;
    // Side effects: the budget, the backspace switch, the first line's alternatives.
    const half = item(c, 'A5');
    if (half && app()) app().setBudget(Math.max(10, half.data.target * 10));
    const inf = item(c, 'A6');
    if (inf) inf.data.startBudget = draft.budget;
    if (has(c, 'D2') && app() && !app().backspaceOff(draft)) { app().setBackspaceOff(true); c.prev.changedNb = true; }
    if (has(c, 'E14')) openHooks();
    lastTypeAt = Date.now();
    ghostedSinceType = false;
    lastTickAt = Date.now();
    if (c.items.some((it) => needsSet(it))) {
      c.setup = TDW.Engine.countWords(t) >= 15 ? 'loading' : 'topic';
      if (c.setup === 'loading') runSet();
    }
    save();
    ensureTimer();
    render();
  }

  // Back to how things were: the budget A5/A6 changed, the switch D2 turned on.
  function finish(keep) {
    const c = ch();
    if (!c) return;
    if (aiCtrl) { aiCtrl.abort(); aiCtrl = null; }
    busy = '';
    if ((has(c, 'A5') || has(c, 'A6')) && app() && c.prev && c.prev.budget && draft.budget !== c.prev.budget) app().setBudget(c.prev.budget);
    if (c.prev && c.prev.changedNb && app()) {
      draft.nb = c.prev.nb;
      app().setBackspaceOff(!!c.prev.off);
      draft.nb = c.prev.nb;
    }
    draft.challenge = null;
    save();
    stopTimer();
    render();
    if (keep === false) return;
  }

  function met(c) {
    c.metAt = Date.now();
    c.final = R().evaluate(c, text(), ctxOf(c));
    if (TDW.Sound) TDW.Sound.play('coin');
    const s = R().recordStreak(readJSON(STREAK_KEY, null), today());
    writeJSON(STREAK_KEY, s);
    stopTimer();
    save();
  }

  /* ---------- Timers: clocks, inflation, the "don't stop" ghost ---------- */

  function ensureTimer() {
    const c = ch();
    stopTimer();
    if (!c || c.metAt) return;
    if (isTimed(c) || has(c, 'A6')) timer = setInterval(tick, TICK_MS);
  }
  function stopTimer() { clearInterval(timer); timer = 0; }

  function tick() {
    const c = ch();
    if (!c || c.metAt) { stopTimer(); return; }
    const now = Date.now();
    const dt = Math.min(5000, now - (lastTickAt || now));
    lastTickAt = now;
    const inf = item(c, 'A6');
    if (inf && document.visibilityState === 'visible') {
      c.activeMs = (c.activeMs || 0) + dt;
      const b = R().get('A6').budgetAt(inf.data, c.activeMs);
      if (b !== draft.budget && app()) app().setBudget(b);
    }
    const d3 = item(c, 'D3');
    if (d3) dontStop(c, d3, now);
    render();
  }

  function dontStop(c, it, now) {
    const rule = R().get('D3');
    const p = R().paramsOf(rule, it.level);
    if (elapsed(c) >= rule.limitMs(p) || ghostedSinceType) return;
    if (now - lastTypeAt < rule.pauseMs(p)) return;
    const t = TDW.Editor.getText();
    if (TDW.Engine.countWords(text()) <= (it.data.startWords || 0)) return;
    let i = t.length;
    while (i > 0 && /\s/.test(t[i - 1])) i--;
    if (!i) return;
    const s = TDW.Marks.sentenceAt(t, i - 1);
    if (!s) return;
    const ann = TDW.Editor.getAnnotations();
    if (TDW.Marks.ghostAt(ann, s.start, s.end) && ann.ghosts.some((g) => g.start <= s.start && g.end >= s.end)) { ghostedSinceType = true; return; }
    selfChange = true;
    try { TDW.Editor.change({ ann: TDW.Marks.ghost(ann, s.start, s.end), kind: 'marks' }); } finally { selfChange = false; }
    ghostedSinceType = true;
    it.data.ghosted = (it.data.ghosted || 0) + 1;
    save();
  }

  /* ---------- AI: setting a challenge up, judging it, the skeptic ---------- */

  function needsSet(it) { const c = R().get(it.id); return !!(c && c.set) && !(it.data && it.data[c.set.key || (c.set.schema === 'words' ? 'words' : 'line')]); }

  async function ask(req) {
    if (aiCtrl) aiCtrl.abort();
    aiCtrl = new AbortController();
    const signal = aiCtrl.signal;
    try {
      return await TDW.AI.ask(req.prompt, req.schema, 0.8, signal, req.mock);
    } finally {
      if (aiCtrl && aiCtrl.signal === signal) aiCtrl = null;
    }
  }

  async function runSet() {
    const c = ch();
    if (!c) return;
    c.setup = 'loading';
    c.error = '';
    busy = 'set';
    render();
    try {
      for (const it of c.items) {
        if (!needsSet(it)) continue;
        const req = R().setRequest(it.id, c.topic, cleanText());
        const raw = await ask(req);
        if (ch() !== c) return;
        Object.assign(it.data, R().setData(it.id, raw));
      }
      c.setup = null;
    } catch (err) {
      if (err && err.code === 'cancelled') return;
      c.setup = 'error';
      c.error = TDW.AI.errorMessage(err);
    } finally {
      busy = '';
    }
    save();
    render();
  }

  async function judge() {
    const c = ch();
    if (!c) return;
    c.error = '';
    busy = 'judge';
    render();
    try {
      for (const it of c.items) {
        const rule = R().get(it.id);
        if (!rule || !rule.ai || !rule.ai.includes('judge')) continue;
        if (rule.hooks) {
          const alt = firstLineAlt();
          const opts = alt ? alt.options.map((o) => o.text) : [];
          if (opts.length < 2) { c.judge[it.id] = { ok: false, why: 'Write a few openings first.' }; continue; }
          const order = opts.map((_, k) => k).sort(() => Math.random() - 0.5); // blind: shuffled, no hint which is on the page
          const req = R().judgeRequest(it.id, it.data, '', { options: order.map((k) => opts[k]) });
          const raw = await ask(req);
          const k = Math.max(1, Math.min(order.length, parseInt(raw && raw.pick, 10) || 1)) - 1;
          const won = opts[order[k]];
          c.judge[it.id] = { ok: true, why: 'Picked “' + won + '” — ' + String((raw && raw.why) || ''), pick: won };
          continue;
        }
        const raw = await ask(R().judgeRequest(it.id, it.data, cleanText()));
        if (ch() !== c) return;
        c.judge[it.id] = { ok: !!(raw && raw.ok), why: String((raw && raw.why) || '') };
      }
    } catch (err) {
      if (err && err.code === 'cancelled') return;
      c.error = TDW.AI.errorMessage(err);
    } finally {
      busy = '';
    }
    save();
    render();
  }

  // E9: after each finished paragraph, a skeptical reader asks one question.
  async function skeptic() {
    const c = ch();
    const it = item(c, 'E9');
    if (!it || busy) return;
    const ps = R().paragraphs(text());
    if (!ps.length) return;
    busy = 'skeptic';
    c.error = '';
    render();
    try {
      const raw = await ask(R().skepticRequest(ps[ps.length - 1], cleanText()));
      if (ch() !== c) return;
      const q = String((raw && raw.question) || '').trim();
      if (q) {
        it.data.questions = (it.data.questions || []).concat({ q, after: ps.length });
        it.data.askedAt = ps.length;
      }
    } catch (err) {
      if (err && err.code === 'cancelled') return;
      c.error = TDW.AI.errorMessage(err);
    } finally {
      busy = '';
    }
    save();
    render();
  }

  // A new empty line after a paragraph that hasn't been asked about yet: time for a question.
  function maybeSkeptic(t) {
    const c = ch();
    const it = item(c, 'E9');
    if (!it || busy || c.metAt || !hasAI()) return;
    if (!/\n\s*$/.test(t)) return;
    const n = R().paragraphs(t).length;
    const qs = it.data.questions || [];
    const last = qs[qs.length - 1];
    if (n === 0 || (it.data.askedAt || 0) >= n) return;
    if (last && n <= last.after) return;
    skeptic();
  }

  /* ---------- E14: the openings live as alternatives on the first line ---------- */

  function openHooks() {
    const t = TDW.Editor.getText();
    let at = 0;
    while (at < t.length && t[at] === '\n') at++;
    const p = TDW.Marks.paragraphAt(t, at);
    if (!p) return;
    const r = TDW.Marks.ensure(t, TDW.Editor.getAnnotations(), 'paragraph', p.start, p.end);
    if (!r) return;
    TDW.Editor.change({ ann: r.ann, kind: 'marks' });
    if (TDW.Alts && typeof TDW.Alts.open === 'function') TDW.Alts.open(r.id);
    else TDW.UI.toast('Put the caret on your first line and open its alternatives to write each opening.');
  }

  /* ---------- Drawing ---------- */

  function render() {
    cancelAnimationFrame(renderRaf);
    renderRaf = requestAnimationFrame(draw);
  }

  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  function clockOf(c) {
    for (const it of c.items) {
      const r = R().get(it.id);
      if (r && r.limitMs) {
        const left = r.limitMs(R().paramsOf(r, it.level)) - elapsed(c);
        return left > 0 ? mmss(left) : '0:00';
      }
    }
    if (has(c, 'A6')) return R().get('A6').budgetAt(item(c, 'A6').data, c.activeMs || 0) === draft.budget ? TDW.UI.money(draft.budget) : '';
    return '';
  }

  function draw() {
    if (btn) {
      btn.classList.toggle('is-on', !!ch());
      btn.setAttribute('aria-pressed', String(!!ch()));
    }
    const c = ch();
    if (!c) { if (card) card.hidden = true; return; }
    if (!card) buildCard();
    card.hidden = false;
    card.classList.toggle('is-collapsed', collapsed);
    card.classList.toggle('is-met', !!c.metAt);
    const res = c.metAt && c.final ? c.final : R().evaluate(c, text(), ctxOf(c));
    if (res.ok && !c.metAt && !c.setup) { met(c); return draw(); }

    const head = card.querySelector('.ch-head');
    const title = res.items.map((x) => x.name).join(' + ');
    const lv = c.items.find((it) => it.level);
    head.querySelector('.ch-title').textContent = (c.daily ? 'Today: ' : '') + title;
    head.querySelector('.ch-level').textContent = lv ? R().LEVEL_NAMES[lv.level] : '';
    head.querySelector('.ch-clock').textContent = c.metAt ? '' : clockOf(c);

    const body = card.querySelector('.ch-body');
    const kids = [];
    if (c.setup === 'topic') {
      const input = el('input', { class: 'ch-topic', type: 'text', placeholder: 'What’s this piece about?', 'aria-label': 'What this piece is about', value: c.topic || '' });
      const go = el('button', { type: 'button', class: 'btn ch-go', text: 'Set it up' });
      const submit = () => { c.topic = input.value.trim(); if (!c.topic) { input.focus(); return; } runSet(); };
      go.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') { e.preventDefault(); TDW.Editor.focus(); } });
      kids.push(el('p', { class: 'ch-desc', text: res.items.map((x) => x.desc).join(' ') }),
        el('p', { class: 'ch-hint', text: 'One line is enough. The AI shapes the challenge around it.' }), el('div', { class: 'ch-row' }, input, go));
      body.replaceChildren(...kids);
      if (document.activeElement !== input && !body.contains(document.activeElement)) setTimeout(() => input.focus(), 0);
      drawActions(c, res);
      return;
    }
    if (c.setup === 'loading') {
      kids.push(el('p', { class: 'ch-desc ch-dance', text: 'Setting up your challenge…' }));
    } else if (c.setup === 'error') {
      kids.push(el('p', { class: 'ch-error', text: c.error }), el('button', { type: 'button', class: 'btn-outline', text: 'Try again', onclick: runSet }));
    } else {
      for (const x of res.items) {
        if (res.items.length > 1) kids.push(el('div', { class: 'ch-sub', text: x.name }));
        kids.push(el('p', { class: 'ch-desc', text: x.desc }));
        const ul = el('ul', { class: 'ch-rules' });
        for (const r of x.rules) {
          ul.append(el('li', { class: 'ch-rule' + (r.ok ? ' is-ok' : '') + (r.judge ? ' is-judge' : '') },
            el('span', { class: 'ch-mark', 'aria-hidden': 'true', text: r.ok ? '✓' : r.judge ? '?' : '✗' }),
            el('span', { class: 'ch-label', text: r.label }),
            r.detail ? el('span', { class: 'ch-detail', text: r.detail }) : null,
            el('span', { class: 'sr-only', text: r.ok ? ' (done)' : ' (not yet)' })));
        }
        kids.push(ul);
        const e9 = x.id === 'E9' ? item(c, 'E9') : null;
        if (e9 && (e9.data.questions || []).length) {
          const q = e9.data.questions[e9.data.questions.length - 1];
          kids.push(el('blockquote', { class: 'ch-question', text: q.q }));
        }
      }
      if (c.error) kids.push(el('p', { class: 'ch-error', text: c.error }));
      if (busy) kids.push(el('p', { class: 'ch-hint ch-dance', text: busy === 'judge' ? 'Judging…' : busy === 'skeptic' ? 'The skeptic is reading…' : 'Thinking…' }));
    }
    if (c.metAt) kids.push(el('div', { class: 'stamp ch-stamp', text: 'Challenge met' }));
    body.replaceChildren(...kids);
    drawActions(c, res);
  }

  function drawActions(c, res) {
    const bar = card.querySelector('.ch-actions');
    const acts = [];
    const judgeable = c.items.some((it) => { const r = R().get(it.id); return r && r.ai && r.ai.includes('judge'); });
    if (!c.metAt && !c.setup && judgeable) {
      acts.push(el('button', { type: 'button', class: 'btn', text: 'Judge it', disabled: !!busy || !hasAI(), title: hasAI() ? null : 'Add your Gemini key in Settings', onclick: judge }));
    }
    if (!c.metAt && has(c, 'E9') && !c.setup) acts.push(el('button', { type: 'button', class: 'btn-outline', text: 'Ask the skeptic', disabled: !!busy || !hasAI(), onclick: skeptic }));
    if (!c.metAt && has(c, 'E14')) acts.push(el('button', { type: 'button', class: 'btn-quiet', text: 'Write openings', onclick: openHooks }));
    acts.push(el('button', { type: 'button', class: 'btn-quiet ch-end', text: c.metAt ? 'Done' : 'Give up', onclick: () => finish() }));
    if (!res) res = null;
    bar.replaceChildren(...acts);
  }

  function buildCard() {
    card = el('section', { class: 'ch-card', 'aria-label': 'Writing challenge', 'aria-live': 'polite', hidden: true },
      el('header', { class: 'ch-head' },
        el('button', { type: 'button', class: 'ch-toggle', 'aria-label': 'Show or hide the challenge', onclick: () => { collapsed = !collapsed; render(); } },
          el('span', { class: 'ch-title' }), el('span', { class: 'ch-level' })),
        el('span', { class: 'ch-clock', 'aria-label': 'Time left' })),
      el('div', { class: 'ch-body' }),
      el('div', { class: 'ch-actions' }));
    document.body.append(card);
  }

  /* ---------- The menu and the picker ---------- */

  function openMenu() {
    const R_ = R();
    const lv = level();
    const d = R_.daily(today());
    const dc = R_.get(d.id);
    const ai = hasAI();
    const items = [
      { label: 'Roll a challenge', value: 'roll' },
      { label: 'Roll a combo', value: 'combo', note: '2 or 3 that fit' },
      { label: 'Pick one…', value: 'pick' },
      { label: 'Today’s challenge', value: 'daily', note: dc.name },
      { type: 'sep' }
    ];
    for (const l of R_.LEVELS) items.push({ label: R_.LEVEL_NAMES[l], value: 'level:' + l, checked: l === lv });
    if (ch()) items.push({ type: 'sep' }, { label: ch().metAt ? 'Clear the challenge' : 'Give up this one', value: 'end', danger: !ch().metAt });
    const s = readJSON(STREAK_KEY, null);
    const n = R_.streakNow(s, today());
    const extra = el('div', { class: 'ch-streak' },
      n ? n + (n === 1 ? ' day' : ' days') + ' in a row' + (s.best > n ? ' · best ' + s.best : '') : s && s.best ? 'Best streak: ' + s.best + (s.best === 1 ? ' day' : ' days') : 'Meet one today to start a streak',
      ai ? null : el('div', { class: 'ch-note', text: 'Add a Gemini key in Settings for the AI challenges.' }));
    TDW.UI.menu(btn, items, (it) => {
      const ctx = { budget: draft ? draft.budget : 2000 };
      if (it.value === 'roll') start([R_.roll({ ai })], level());
      else if (it.value === 'combo') start(R_.combo({ ai, ctx, level: level() }), level());
      else if (it.value === 'pick') { setTimeout(openPicker, 0); }
      else if (it.value === 'daily') start([d.id], d.level, { daily: today(), seed: d.seed });
      else if (it.value === 'end') finish();
      else if (it.value.startsWith('level:')) { writeJSON(LEVEL_KEY, it.value.slice(6)); return true; }
      return false;
    }, extra);
  }

  function openPicker() {
    closePicker();
    const R_ = R();
    const ai = hasAI();
    const list = el('div', { class: 'ch-picker-list' });
    for (const cat of R_.CATEGORIES) {
      list.append(el('h3', { class: 'ch-cat', text: cat.name }));
      for (const c of R_.LIST.filter((x) => x.cat === cat.key)) {
        const p = R_.paramsOf(c, level());
        const sample = c.start && !c.set ? '' : '';
        const desc = c.desc(p, {}, { budget: draft ? draft.budget : 2000 });
        list.append(el('button', {
          type: 'button', class: 'ch-pick' + (c.ai && !ai ? ' is-off' : ''), disabled: c.ai && !ai,
          title: c.ai && !ai ? 'Needs a Gemini key (Settings)' : null,
          onclick: () => { closePicker(); start([c.id], level()); TDW.Editor.focus(); }
        }, el('span', { class: 'ch-pick-name', text: c.name }), el('span', { class: 'ch-pick-desc', text: desc + sample }), c.ai ? el('span', { class: 'ch-pick-ai', text: 'AI' }) : null));
      }
    }
    picker = el('div', { class: 'ch-picker', role: 'dialog', 'aria-label': 'Pick a challenge' },
      el('div', { class: 'ch-picker-head' }, el('span', { text: 'Pick a challenge' }), el('span', { class: 'ch-level', text: R_.LEVEL_NAMES[level()] }),
        el('button', { type: 'button', class: 'btn-quiet', text: 'Close', onclick: closePicker })),
      list);
    document.body.append(picker);
    const first = picker.querySelector('.ch-pick:not([disabled])');
    if (first) first.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
    document.addEventListener('keydown', pickerKey, true);
  }
  function outside(e) { if (picker && !picker.contains(e.target)) closePicker(); }
  function pickerKey(e) {
    if (!picker) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(); TDW.Editor.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const all = [...picker.querySelectorAll('.ch-pick:not([disabled])')];
      const i = all.indexOf(document.activeElement);
      const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
      if (n) { e.preventDefault(); n.focus(); }
    }
  }
  function closePicker() {
    if (!picker) return;
    picker.remove();
    picker = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', pickerKey, true);
  }

  /* ---------- The module ---------- */

  TDW.Challenges = {
    init() {
      const slot = document.getElementById('dock-center');
      if (!slot || btn) return;
      btn = el('button', { type: 'button', class: 'dock-btn ch-btn', 'aria-haspopup': 'menu', title: 'Writing challenges', text: 'Challenge' });
      btn.addEventListener('click', openMenu);
      slot.append(btn);
      document.addEventListener('visibilitychange', () => { lastTickAt = Date.now(); });
    },
    load(d) {
      if (aiCtrl) { aiCtrl.abort(); aiCtrl = null; }
      busy = '';
      draft = d;
      lastTypeAt = Date.now();
      ghostedSinceType = false;
      lastTickAt = Date.now();
      const c = ch();
      if (c && !Array.isArray(c.items)) draft.challenge = null;
      if (c && c.setup === 'loading') c.setup = 'error', c.error = 'Setting up was interrupted.';
      ensureTimer();
      render();
    },
    reload(d) {
      draft = d;
      ensureTimer();
      render();
    },
    onText(t) {
      if (!ch()) return;
      if (!selfChange) { lastTypeAt = Date.now(); ghostedSinceType = false; }
      maybeSkeptic(text());
      render();
    },
    onMode() { render(); },
    // For tests and the console.
    start: (ids, lv) => start(Array.isArray(ids) ? ids : [ids], lv || level()),
    finish: () => finish(),
    current: () => ch(),
    _tick: tick
  };
})();
