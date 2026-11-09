/* Writing challenges in the inspector's Challenge tab: today's challenge, roll, the list, and the card with
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
  let timer = 0;
  let renderRaf = 0;
  let aiCtrl = null;
  let busy = '';            // what the AI is doing right now ('set', 'judge', 'skeptic'), for the card
  let lastTypeAt = 0;
  let ghostedSinceType = false;
  let selfChange = false;   // our own edits (D3's ghost) aren't typing
  let lastTickAt = 0;

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
    if (c.setup === 'topic' && app() && app().openTab) app().openTab('challenge');
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

  /* ---------- Drawing: the Challenge tab and the chip in the toolbar ---------- */

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
    if (has(c, 'A6')) return TDW.UI.money(draft.budget);
    return '';
  }

  let tab = null, runEl = null, homeEl = null, chip = null, homeLevel = null;

  function draw() {
    if (!tab) return;
    const c = ch();
    homeEl.hidden = !!c;
    runEl.hidden = !c;
    TDW.Inspector.setBadge('challenge', c && !c.metAt ? '•' : '');
    if (!c) { drawChip(null); if (homeLevel !== level()) drawHome(); return; }
    const res = c.metAt && c.final ? c.final : R().evaluate(c, text(), ctxOf(c));
    if (res.ok && !c.metAt && !c.setup) { met(c); return draw(); }
    drawChip(c, res);
    drawRun(c, res);
  }

  function drawChip(c, res) {
    if (!chip) return;
    if (!c) { chip.hidden = true; return; }
    const total = res.items.reduce((n, x) => n + x.rules.length, 0);
    const ok = res.items.reduce((n, x) => n + x.rules.filter((r) => r.ok).length, 0);
    const name = res.items.map((x) => x.name).join(' + ');
    chip.hidden = false;
    chip.classList.toggle('is-met', !!c.metAt);
    const clock = c.metAt ? '' : clockOf(c);
    chip.replaceChildren(el('span', { class: 'chc-name', text: name }),
      el('span', { class: 'chc-state', text: c.metAt ? 'Met' : clock || ok + ' of ' + total }));
    chip.setAttribute('aria-label', 'Challenge: ' + name + (c.metAt ? ', met' : ', ' + ok + ' of ' + total + ' rules met' + (clock ? ', ' + clock + ' left' : '')) + '. Show it');
  }

  function drawRun(c, res) {
    const title = res.items.map((x) => x.name).join(' + ');
    const lv = c.items.find((it) => it.level);
    const kids = [el('div', { class: 'ch-head' },
      el('div', { class: 'ch-titles' }, el('span', { class: 'rv-label', text: c.daily ? 'Today’s challenge' : c.combo ? 'Combo' : 'Challenge' }),
        el('h3', { class: 'ch-title', text: title })),
      el('div', { class: 'ch-side' }, lv ? el('span', { class: 'tag', text: R().LEVEL_NAMES[lv.level] }) : null,
        !c.metAt && clockOf(c) ? el('span', { class: 'ch-clock', 'aria-label': 'Time left', text: clockOf(c) }) : null))];
    if (c.setup === 'topic') {
      const input = el('input', { class: 'field', type: 'text', placeholder: 'What’s this piece about?', 'aria-label': 'What this piece is about', value: c.topic || '' });
      const go = el('button', { type: 'button', class: 'btn btn-sm', text: 'Set it up' });
      const submit = () => { c.topic = input.value.trim(); if (!c.topic) { input.focus(); return; } runSet(); };
      go.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') { e.preventDefault(); TDW.Editor.focus(); } });
      kids.push(el('p', { class: 'ch-desc', text: res.items.map((x) => x.desc).join(' ') }),
        el('p', { class: 'hint', text: 'One line is enough. The AI shapes the challenge around it.' }), el('div', { class: 'ch-row' }, input, go));
      runEl.replaceChildren(...kids, actions(c));
      if (TDW.Inspector.tab() === 'challenge' && document.activeElement !== input && !runEl.contains(document.activeElement)) setTimeout(() => input.focus(), 0);
      return;
    }
    if (c.setup === 'loading') kids.push(el('p', { class: 'ch-desc busy-dots', text: 'Setting up your challenge' }));
    else if (c.setup === 'error') kids.push(el('p', { class: 'ai-error', text: c.error }), el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Try again', onclick: runSet }));
    else {
      for (const x of res.items) {
        if (res.items.length > 1) kids.push(el('div', { class: 'ch-sub', text: x.name }));
        kids.push(el('p', { class: 'ch-desc', text: x.desc }));
        kids.push(el('ul', { class: 'ch-rules' }, x.rules.map((r) => el('li', { class: 'ch-rule' + (r.ok ? ' is-ok' : '') + (r.judge ? ' is-judge' : '') },
          el('span', { class: 'ch-mark', 'aria-hidden': 'true' }, r.ok ? TDW.UI.icon('check') : r.judge ? '?' : ''),
          el('span', { class: 'ch-label', text: r.label }),
          r.detail ? el('span', { class: 'ch-detail', text: r.detail }) : null,
          el('span', { class: 'sr-only', text: r.ok ? ' (done)' : ' (not yet)' })))));
        const e9 = x.id === 'E9' ? item(c, 'E9') : null;
        if (e9 && (e9.data.questions || []).length) kids.push(el('blockquote', { class: 'ch-question page-quote', text: e9.data.questions[e9.data.questions.length - 1].q }));
      }
      if (c.error) kids.push(el('p', { class: 'ai-error', text: c.error }));
      if (busy) kids.push(el('p', { class: 'hint busy-dots', text: busy === 'judge' ? 'Judging' : busy === 'skeptic' ? 'The skeptic is reading' : 'Thinking' }));
    }
    if (c.metAt) kids.push(el('div', { class: 'ch-met' }, el('span', { class: 'ch-stamp', text: 'Challenge met' }), streakLine()));
    runEl.replaceChildren(...kids, actions(c));
  }

  function actions(c) {
    const acts = [];
    const judgeable = c.items.some((it) => { const r = R().get(it.id); return r && r.ai && r.ai.includes('judge'); });
    if (!c.metAt && !c.setup && judgeable) acts.push(el('button', { type: 'button', class: 'btn btn-sm', text: 'Judge it', disabled: !!busy || !hasAI(), onclick: judge }));
    if (!c.metAt && has(c, 'E9') && !c.setup) acts.push(el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Ask the skeptic', disabled: !!busy || !hasAI(), onclick: skeptic }));
    if (!c.metAt && has(c, 'E14')) acts.push(el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Write openings', onclick: openHooks }));
    acts.push(el('button', { type: 'button', class: 'btn btn-sm ' + (c.metAt ? '' : 'btn-quiet ch-end'), text: c.metAt ? 'Done' : 'Give up', onclick: () => finish() }));
    return el('div', { class: 'row-start ch-actions' }, acts);
  }

  function streakLine() {
    const s = readJSON(STREAK_KEY, null);
    const n = R().streakNow(s, today());
    const text = n ? n + (n === 1 ? ' day' : ' days') + ' in a row' + (s.best > n ? ', best ' + s.best : '') : s && s.best ? 'Best streak: ' + s.best + (s.best === 1 ? ' day' : ' days') : 'Meet one today to start a streak.';
    return el('p', { class: 'ch-streak', text });
  }

  /* ---------- The tab with no challenge running: today's, roll, level, every challenge ---------- */
  function drawHome() {
    const R_ = R();
    const lv = level();
    homeLevel = lv;
    const ai = hasAI();
    const d = R_.daily(today());
    const dc = R_.get(d.id);
    const ctx = { budget: draft ? draft.budget : 2000 };
    const levelSeg = TDW.UI.segmented({
      label: 'Difficulty', value: lv, options: R_.LEVELS.map((l) => ({ value: l, label: R_.LEVEL_NAMES[l] })),
      onChange: (v) => { writeJSON(LEVEL_KEY, v); drawHome(); }
    });
    const list = el('div', { class: 'ch-list' });
    for (const cat of R_.CATEGORIES) {
      list.append(el('h4', { class: 'ch-cat', text: cat.name }));
      for (const c of R_.LIST.filter((x) => x.cat === cat.key)) {
        const p = R_.paramsOf(c, lv);
        const off = c.ai && !ai;
        list.append(el('button', {
          type: 'button', class: 'ch-pick', disabled: off, title: off ? 'Needs a Gemini key (Settings, AI)' : null,
          onclick: () => { start([c.id], level()); }
        }, el('span', { class: 'ch-pick-name' }, c.name, c.ai ? el('span', { class: 'tag', text: 'AI' }) : null), el('span', { class: 'ch-pick-desc', text: c.desc(p, {}, ctx) })));
      }
    }
    homeEl.replaceChildren(
      el('section', { class: 'rv-sec ch-today' },
        el('div', { class: 'rv-label', text: 'Today’s challenge' }),
        el('div', { class: 'ch-today-row' }, el('div', null, el('h3', { class: 'ch-title', text: dc.name }), el('p', { class: 'ch-desc', text: dc.desc(R_.paramsOf(dc, d.level), {}, ctx) })),
          el('button', { type: 'button', class: 'btn btn-sm', text: 'Start', disabled: dc.ai && !ai, onclick: () => start([d.id], d.level, { daily: today(), seed: d.seed }) })),
        streakLine()),
      el('section', { class: 'rv-sec' },
        el('div', { class: 'rv-row' }, el('span', { class: 'rv-label', text: 'Difficulty' }), levelSeg),
        el('div', { class: 'row-start' },
          el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Roll a challenge', onclick: () => start([R_.roll({ ai })], level()) }),
          el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Roll a combo', onclick: () => start(R_.combo({ ai, ctx, level: level() }), level()) })),
        ai ? null : el('p', { class: 'hint' }, 'Add a Gemini key in ', el('button', { type: 'button', class: 'link-btn', text: 'Settings', onclick: () => app().openSettings('ai') }), ' for the challenges marked AI.')),
      el('section', { class: 'rv-sec' }, el('div', { class: 'rv-label', text: 'Pick one' }), list));
  }

  function build() {
    tab = TDW.Inspector.pane('challenge');
    runEl = el('div', { class: 'ch-run rv-sec', 'aria-live': 'polite', hidden: true });
    homeEl = el('div', { class: 'ch-home' });
    tab.append(runEl, homeEl);
    chip = el('button', { type: 'button', class: 'ch-chip', hidden: true, onclick: () => app().openTab('challenge') });
    const slot = document.getElementById('tb-challenge-slot');
    if (slot) slot.append(chip);
    drawHome();
  }

  /* ---------- The module ---------- */

  TDW.Challenges = {
    init() {
      if (tab) return;
      build();
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
      if (c && c.setup === 'loading') { c.setup = 'error'; c.error = 'Setting up was interrupted.'; }
      ensureTimer();
      homeLevel = null;
      render();
    },
    reload(d) { draft = d; ensureTimer(); render(); },
    onText() {
      if (!ch()) return;
      if (!selfChange) { lastTypeAt = Date.now(); ghostedSinceType = false; }
      maybeSkeptic(text());
      render();
    },
    onMode() { render(); },
    onTab(t) { if (t === 'challenge' && !ch()) { homeLevel = null; render(); } },
    open: () => app().openTab('challenge'),
    start: (ids, lv) => start(Array.isArray(ids) ? ids : [ids], lv || level()),
    finish: () => finish(),
    current: () => ch(),
    _tick: tick
  };
})();
