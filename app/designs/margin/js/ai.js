/* Gemini client and prompts. The key only ever goes to Google, in the x-goog-api-key header. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};

  const BASE = 'https://generativelanguage.googleapis.com/v1beta/';
  const FALLBACK_MODEL = 'models/gemini-flash-latest'; // Google's alias for the current Flash model
  const FALLBACKS_KEY = 'tdw.geminiFallbacks';
  const MODELS_KEY = 'tdw.geminiModels';      // { at, models: [...] } from the last listing
  const RELIST_MS = 7 * 86400e3;
  // Models that can't write back text for us.
  const NOT_TEXT = /(tts|image|audio|live|embedding|vision|robotics|computer|transcribe|native|veo|imagen|aqa|learnlm|gemma|customtools|nano)/i;
  // Models go offline or get overloaded (503), and free-tier quotas (429) are per model,
  // so a failed call moves on to the next model instead of failing.
  const TRY_NEXT = new Set(['busy', 'rate_limited', 'bad_model']);
  let sticky = null; // the model that answered last, tried first for the rest of this visit
  const MODEL_RE = /^models\/[A-Za-z0-9._-]+$/;
  const MAX_TIGHTEN = 60000;

  const SYSTEM = "You are a sharp line editor. The writer pays $10 for every word, so shorter is better, but never at the cost of meaning. Their style: plain, direct, conversational American English; short sentences; concrete words; no clichés, corporate filler, hype, or em dashes. Keep the writer's facts and voice. Never invent claims. Reply only with JSON that matches the schema.";

  const OPTIONS = { type: 'OBJECT', properties: { options: { type: 'ARRAY', items: { type: 'OBJECT',
    properties: { text: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['text', 'note'] } } }, required: ['options'] };
  const ALTS = { type: 'OBJECT', properties: { options: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['options'] };
  const TALK = { type: 'OBJECT', properties: { reply: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['reply', 'options'] };
  const LAB = { type: 'OBJECT', properties: { marks: { type: 'ARRAY', items: { type: 'OBJECT',
    properties: { quote: { type: 'STRING' }, reason: { type: 'STRING' }, fix: { type: 'STRING' } }, required: ['quote', 'reason', 'fix'] } } },
    required: ['marks'] };
  const CUTS = { type: 'OBJECT', properties: { cuts: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['cuts'] };
  const MESSAGE = { type: 'OBJECT', properties: {
    takeaway: { type: 'STRING' }, verdict: { type: 'STRING', enum: ['clear', 'mixed', 'unclear'] },
    match: { type: 'STRING', enum: ['yes', 'partly', 'no', 'none'] }, why: { type: 'STRING' },
    offMessage: { type: 'ARRAY', items: { type: 'OBJECT', properties: { quote: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['quote', 'reason'] } },
    strongerOpening: { type: 'STRING' }, strongerEnding: { type: 'STRING' } },
    required: ['takeaway', 'verdict', 'match', 'why', 'offMessage', 'strongerOpening', 'strongerEnding'] };

  const MESSAGES = {
    no_key: 'Add your Gemini key in Settings first.',
    bad_key: 'Gemini rejected the key. Check it in Settings.',
    bad_model: "That model isn't available. Pick another in Settings.",
    rate_limited: "Gemini's free limit is used up for now. Try again in a minute.",
    busy: 'Gemini is overloaded. Try again shortly.',
    offline: "You're offline. AI help needs internet.",
    unreachable: "Couldn't reach Gemini. Check your internet and try again.",
    blocked: 'Gemini declined this text.',
    bad_json: 'Gemini sent a garbled answer. Try again.'
  };

  const OK_SCHEMA = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] };

  // detail: Google's own words, shown when connecting fails.
  const fail = (code, message, detail) => ({ code, message: message || MESSAGES[code] || '', detail: detail || '' });
  const str = (v) => (typeof v === 'string' ? v : '');

  function networkError(e) {
    if (e && e.name === 'AbortError') return fail('cancelled');
    if (e instanceof TypeError) return fail(navigator.onLine === false ? 'offline' : 'unreachable');
    return fail('error', (e && e.message) || 'network error');
  }

  function httpError(status, body) {
    const msg = (body && body.error && body.error.message) || '';
    if (status === 400 && /api[ _-]?key/i.test(msg)) return fail('bad_key', '', msg);
    if (status === 401) return fail('bad_key', '', msg);
    // 403 also covers "API not enabled" and region blocks; show Google's reason for those.
    if (status === 403) return /api[ _-]?key|unregistered callers/i.test(msg) ? fail('bad_key', '', msg) : fail('error', msg || 'HTTP 403', msg);
    if (status === 404) return fail('bad_model', '', msg);
    if (status === 429) return fail('rate_limited', '', msg);
    if (status >= 500) return fail('busy', '', msg);
    return fail('error', msg || 'HTTP ' + status, msg);
  }

  const TIMEOUT_MS = 45000;

  // A stalled connection gives up after TIMEOUT_MS, as if Gemini couldn't be reached.
  async function request(path, init, key) {
    const timer = new AbortController();
    const timeout = setTimeout(() => timer.abort(), TIMEOUT_MS);
    const caller = init && init.signal;
    if (caller) {
      if (caller.aborted) timer.abort();
      else caller.addEventListener('abort', () => timer.abort(), { once: true });
    }
    const timedOut = () => !(caller && caller.aborted) && timer.signal.aborted;
    let res;
    try {
      res = await fetch(BASE + path, Object.assign({}, init, {
        signal: timer.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }
      }));
    } catch (e) {
      clearTimeout(timeout);
      throw timedOut() ? fail('unreachable') : networkError(e);
    }
    let body = null;
    try { body = await res.json(); } catch (e) {
      if (e && e.name === 'AbortError') throw timedOut() ? fail('unreachable') : fail('cancelled');
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw httpError(res.status, body);
    return body || {};
  }

  // Flash models, best first: stable before preview, then the highest version.
  function rankModels(names) {
    const flash = names.filter((n) => !/(lite|image|tts|audio|live|embedding|vision|8b|thinking|learnlm|gemma|aqa|nano|robotics|computer|native)/i.test(n) && n.includes('flash'));
    const version = (n) => { const m = /gemini-(\d+(?:\.\d+)?)/.exec(n); return m ? parseFloat(m[1]) : 0; };
    const byVersion = (a, b) => version(b) - version(a) || a.length - b.length || a.localeCompare(b);
    const isPreview = (n) => /(preview|exp)/.test(n);
    return flash.filter((n) => !isPreview(n)).sort(byVersion).concat(flash.filter(isPreview).sort(byVersion));
  }

  const pickModel = (names) => rankModels(names)[0] || FALLBACK_MODEL;

  // Every model worth offering in Settings, best first.
  function usableModels(names) {
    const ok = names.filter((n) => /gemini/.test(n) && !NOT_TEXT.test(n));
    const version = (n) => { const m = /gemini-(\d+(?:\.\d+)?)/.exec(n); return m ? parseFloat(m[1]) : 0; };
    const tier = (n) => (/flash-lite/.test(n) ? 2 : /flash/.test(n) ? 0 : /pro/.test(n) ? 1 : 3);
    const preview = (n) => (/(preview|exp)/.test(n) ? 1 : 0);
    return ok.sort((a, b) => preview(a) - preview(b) || tier(a) - tier(b) || version(b) - version(a) || a.localeCompare(b));
  }

  function readListing() {
    try {
      const v = JSON.parse(localStorage.getItem(MODELS_KEY) || 'null');
      return v && Array.isArray(v.models) ? v : null;
    } catch (_) { return null; }
  }
  function writeListing(models) {
    try { localStorage.setItem(MODELS_KEY, JSON.stringify({ at: Date.now(), models })); } catch (_) { /* storage blocked */ }
  }

  async function listModels(key, signal) {
    const body = await request('models?pageSize=200', { method: 'GET', signal }, key);
    return (Array.isArray(body.models) ? body.models : [])
      .filter((m) => m && typeof m.name === 'string' && m.name.includes('gemini') &&
        Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => m.name)
      .sort();
  }

  // Automatic mode: once a week, move to the newest Flash model Google offers.
  let relisting = false;
  function relistSoon(key) {
    if (relisting || TDW.Store.getModelMode() !== 'auto') return;
    const l = readListing();
    if (l && Date.now() - l.at < RELIST_MS) return;
    relisting = true;
    listModels(key).then((models) => {
      writeListing(models);
      const best = rankModels(models)[0];
      if (best && TDW.Store.getModelMode() === 'auto') TDW.Store.setModel(best);
    }).catch(() => {}).then(() => { relisting = false; });
  }

  function parseJSON(text) {
    const s = text.replace(/```(?:json)?/gi, '').trim();
    try { return JSON.parse(s); } catch (_) { /* try the braces below */ }
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { /* fall through */ }
    }
    throw fail('bad_json');
  }

  function readFallbacks() {
    try { const v = JSON.parse(localStorage.getItem(FALLBACKS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  function writeFallbacks(list) {
    try { localStorage.setItem(FALLBACKS_KEY, JSON.stringify(list)); } catch (_) { /* storage blocked */ }
  }

  // Which models to try, in order: the one that just worked, the saved one, then the backups.
  function modelOrder() {
    const saved = TDW.Store.getModel();
    const list = [sticky, MODEL_RE.test(saved) ? saved : FALLBACK_MODEL, ...readFallbacks(), FALLBACK_MODEL];
    return [...new Set(list.filter((m) => typeof m === 'string' && MODEL_RE.test(m)))].slice(0, 6);
  }

  // use: { key, model } to test a key and model before saving them.
  async function generate(prompt, schema, temperature, signal, use) {
    const key = use ? use.key : TDW.Store.getKey();
    if (!key) throw fail('no_key');
    if (use) return generateWith(use.model, key, prompt, schema, temperature, signal);
    relistSoon(key);
    const saved = TDW.Store.getModel();
    let firstError = null, savedGone = false;
    for (const model of modelOrder()) {
      try {
        const out = await generateWith(model, key, prompt, schema, temperature, signal);
        sticky = model;
        if (savedGone && model !== saved && TDW.Store.getModelMode() === 'auto') TDW.Store.setModel(model); // the saved model was retired
        return out;
      } catch (e) {
        if (!TRY_NEXT.has(e.code)) throw e;
        if (e.code === 'bad_model' && model === saved) savedGone = true;
        if (!firstError) firstError = e;
      }
    }
    throw firstError;
  }

  async function generateWith(model, key, prompt, schema, temperature, signal) {
    const body = await request(model + ':generateContent', {
      method: 'POST',
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema }
      })
    }, key);
    const cand = Array.isArray(body.candidates) ? body.candidates[0] : null;
    const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : null;
    if (!parts) throw fail('blocked');
    return parseJSON(parts.filter((p) => p && !p.thought && typeof p.text === 'string').map((p) => p.text).join(''));
  }

  /* ---------- Output validation ---------- */
  function checkOptions(raw, max) {
    const list = raw && Array.isArray(raw.options) ? raw.options : [];
    return {
      options: list.filter((o) => o && typeof o.text === 'string' && o.text.trim())
        .slice(0, max || 3).map((o) => ({ text: o.text.trim(), note: str(o.note) }))
    };
  }

  function checkLab(raw) {
    const list = raw && Array.isArray(raw.marks) ? raw.marks : [];
    return {
      marks: list.filter((m) => m && typeof m.quote === 'string' && m.quote.trim())
        .slice(0, 40).map((m) => ({ quote: m.quote, reason: str(m.reason), fix: str(m.fix) }))
    };
  }

  function checkCuts(raw) {
    const list = raw && Array.isArray(raw.cuts) ? raw.cuts : [];
    return { cuts: list.filter((c) => typeof c === 'string' && c.trim()).slice(0, 200) };
  }

  function checkMessage(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      takeaway: str(r.takeaway), verdict: str(r.verdict), match: str(r.match), why: str(r.why),
      offMessage: (Array.isArray(r.offMessage) ? r.offMessage : [])
        .filter((o) => o && typeof o.quote === 'string' && o.quote.trim())
        .map((o) => ({ quote: o.quote, reason: str(o.reason) })),
      strongerOpening: str(r.strongerOpening), strongerEnding: str(r.strongerEnding)
    };
  }

  function checkTalk(raw) {
    const reply = raw && typeof raw.reply === 'string' ? raw.reply.trim().slice(0, 2000) : '';
    return { reply, options: checkAlts(raw).options.slice(0, 6) };
  }

  function checkAlts(raw) {
    const list = raw && Array.isArray(raw.options) ? raw.options : [];
    return { options: list.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.replace(/\s*\n\s*/g, ' ').trim()).slice(0, 8) };
  }

  /* ---------- Prompts ---------- */
  const block = (label, text) => label + ':\n<<<\n' + text + '\n>>>';

  const LAB_ASK = {
    punctuation: 'Find punctuation mistakes and typos in this text: missing or wrong punctuation, doubled words, misspellings, wrong word (its/it\'s, then/than). Quote the smallest stretch that contains each mistake (1 to 6 words). Don\'t flag style choices. At most 20.',
    weakest: 'Mark the weakest sentences in this text: up to 5 that add the least, are vague, or repeat what was already said. Quote each whole sentence.',
    convoluted: 'Mark convoluted sentences in this text: ones that are hard to follow because of their structure (a buried subject, nested clauses, a long wind-up, a double negative), even when they are short. Quote each whole sentence. At most 8.',
    tone: 'Work out the tone of this text in two or three words. Then mark words or short phrases (1 to 4 words) that don\'t fit that tone, such as fancy words or jargon in plain writing, or slang in formal writing. Each reason names the tone it breaks. At most 10.',
    hedges: 'Mark hedges and filler in this text: words or short phrases (1 to 5 words) that soften, pad or clear the throat without adding meaning ("I think", "sort of", "it seems", "in order to", "basically"). At most 15.'
  };

  const FEATURES = {
    // Options that fit where the text sits: read with its sentence and paragraph, never a thesaurus.
    alternatives: {
      schema: ALTS, temperature: 0.9, check: checkAlts,
      prompt: (i) => [
        'A writer wants alternatives for one ' + i.kind + ' of their draft. Suggest ' + (i.kind === 'paragraph' ? 3 : i.kind === 'sentence' ? 4 : 5) +
        ' different ways to write it that fit exactly where it sits: same meaning or a close one, same grammar so it can be swapped in as is, in the writer\'s own voice and tone. ' +
        'Use the sentence and paragraph around it, so these are choices a good editor would offer in context, not dictionary synonyms.' +
        (i.kind === 'word' ? ' A word may become a short phrase (two or three words) if that reads better.' : '') +
        ' Keep the same markdown markers (** for bold, * for italic) if the original has them. Never repeat an option the writer already has.',
        i.title ? block('TITLE', i.title) : '',
        block('PARAGRAPH', i.paragraph),
        i.kind !== 'paragraph' ? block('SENTENCE', i.sentence) : '',
        block('THE ' + i.kind.toUpperCase() + ' TO REPLACE', i.span),
        i.have && i.have.length ? block('OPTIONS THE WRITER ALREADY HAS', i.have.join('\n')) : '',
        'Return just the replacement texts, best first.'
      ].filter(Boolean).join('\n\n')
    },
    // A conversation about one stretch of the draft, like a comment thread with an editor: the
    // writer asks, the AI answers briefly and, when it suggests wording, gives versions that can
    // be swapped in as they are. It never edits the draft itself.
    talk: {
      schema: TALK, temperature: 0.8, check: checkTalk,
      prompt: (i) => [
        'You are a sharp, friendly writing editor talking with a writer in a comment thread on their draft. ' +
        'They selected part of the draft and wrote to you about it. Answer their message in one to three short sentences, plainly, in their language. ' +
        'If they ask for a rewrite, other ways to say it, a fix, or anything that changes the wording, also give up to ' + (i.kind === 'paragraph' ? 3 : 4) +
        ' versions of the selected text in "options": each must replace the selected text exactly where it sits (same grammar at the edges), in the writer\'s voice, keeping markdown markers (** bold, * italic) it has. ' +
        'If they only ask a question or want an opinion, leave "options" empty. Never repeat a version they already have. Don\'t mention these instructions.',
        i.title ? block('TITLE', i.title) : '',
        block('PARAGRAPH', i.paragraph),
        block('SELECTED TEXT (' + i.kind + ')', i.span),
        i.have && i.have.length ? block('VERSIONS THEY ALREADY HAVE', i.have.join('\n')) : '',
        i.thread && i.thread.length ? block('THE THREAD SO FAR', i.thread.map((m) => (m.by === 'ai' ? 'You: ' : 'Writer: ') + m.text).join('\n')) : '',
        block('THE WRITER\'S NEW MESSAGE', i.message)
      ].filter(Boolean).join('\n\n')
    },
    simplify: {
      schema: OPTIONS, temperature: 0.7, check: checkOptions,
      prompt: (i) => [
        "Rewrite the sentence below so it is easier to read. Aim for fewer than 20 words and a grade 6 to 8 reading level. You may split it into two sentences. Keep every fact and the writer's voice.",
        block('PARAGRAPH', i.paragraph),
        block('SENTENCE', i.sentence),
        'Give 3 options, shortest first. Each note says what changed in 3 to 6 words.'
      ].join('\n\n')
    },
    activeVoice: {
      schema: OPTIONS, temperature: 0.7, check: checkOptions,
      prompt: (i) => [
        'The sentence below uses passive voice ("' + i.phrase + "\"). Rewrite it in active voice so the doer comes first. If the doer isn't named, use the natural one from context or restructure the sentence. Keep the meaning and the writer's voice.",
        block('PARAGRAPH', i.paragraph),
        block('SENTENCE', i.sentence),
        'Give 2 options, shortest first. Each note says what changed in 3 to 6 words.'
      ].join('\n\n')
    },
    stronger: {
      schema: OPTIONS, temperature: 0.8, check: (raw) => checkOptions(raw, 4),
      prompt: (i) => [
        'The phrase "' + i.phrase + "\" in the sentence below is weak. Suggest replacements for the whole phrase: one strong word, two at most, that says it with more precision in the writer's voice. Each option must fit the sentence when swapped in.",
        block('SENTENCE', i.sentence),
        'Give 4 options, best first. Each note gives the nuance in 2 to 5 words.'
      ].join('\n\n')
    },
    // The Lab: marks only, never rewrites. Each check returns exact quotes with a short reason.
    lab: {
      schema: LAB, temperature: 0.3, check: checkLab,
      prompt: (i) => [
        LAB_ASK[i.check],
        'Rules:\n' +
        '- "quote" must be copied character for character from the text, and must appear in it only once (quote a little more if needed to make it unique).\n' +
        '- "reason" says why in 12 words or fewer, plainly.\n' +
        '- "fix" is ' + (i.check === 'punctuation' ? 'the corrected version of exactly the quoted text.' : 'always "".') + '\n' +
        '- Mark nothing you are unsure about. Fewer, better marks beat many. Leave quotes from other people alone.',
        block('TEXT', i.text)
      ].join('\n\n')
    },
    // Trim: deletions only. The writer reads what would go before anything goes.
    trim: {
      schema: CUTS, temperature: 0.3, check: checkCuts,
      prompt: (i) => [
        'Every word in this text costs $10. Find words, phrases and whole sentences that could be deleted to make it about ' + i.percent +
        '% shorter (about ' + i.target + ' of its ' + i.words + ' words), keeping its meaning, facts and the writer\'s voice.',
        'Rules:\n' +
        '- You may only delete. Never rewrite, reorder or add a word. Each cut must leave the sentence grammatical and natural exactly as it stands once the cut is removed (one neighboring space goes with it).\n' +
        '- If a cut would need any other word changed to work, skip it.\n' +
        '- Each cut is copied character for character from the text and appears in it only once. Cuts never overlap.\n' +
        '- Go first for filler, hedges, throat-clearing, repetition and asides; ' + (i.percent >= 30 ? 'then whole sentences that add least.' : 'cut whole sentences only when they add nothing.') + '\n' +
        '- Never cut headings or quotes from other people.',
        block('TEXT', i.text),
        'Return the cuts in the order they appear.'
      ].join('\n\n')
    },
    messageCheck: {
      schema: MESSAGE, temperature: 0.4, check: checkMessage,
      prompt: (i) => [
        'Judge whether this draft gets its message across to a busy reader.\n' +
        (i.intent ? 'The writer says the message is:\n<<<\n' + i.intent + '\n>>>' : 'The writer did not say what the message is.'),
        block('DRAFT', i.text),
        'Fill every field:\n' +
        '- takeaway: the one thing a busy reader would remember, in one sentence of 25 words or fewer.\n' +
        '- verdict: "clear", "mixed", or "unclear".\n' +
        '- match: if the writer stated a message, "yes", "partly", or "no"; otherwise "none".\n' +
        '- why: one or two sentences explaining the verdict.\n' +
        '- offMessage: up to 3 sentences copied exactly from the draft that pull away from the message, each with a reason of 10 words or fewer.\n' +
        '- strongerOpening: a sharper first line in the writer\'s voice, or "" if the current one works.\n' +
        '- strongerEnding: a sharper last line in the writer\'s voice, or "" if the current one works.'
      ].join('\n\n')
    }
  };

  async function run(feature, input, signal) {
    const f = FEATURES[feature];
    const raw = TDW.mockAI
      ? await TDW.AIMock.respond(feature, input, signal)
      : await generate(f.prompt(input), f.schema, f.temperature, signal);
    return f.check(raw);
  }

  TDW.AI = {
    // An empty key re-tests the saved one. Each candidate model gets a tiny test request, so the
    // saved model is one that answers for this key.
    async connect(key, signal) {
      if (TDW.mockAI) return TDW.AIMock.respond('connect', {}, signal);
      const k = String(key || '').trim() || TDW.Store.getKey();
      if (!k) throw fail('no_key');
      const models = await listModels(k, signal);
      writeListing(models);
      const ranked = rankModels(models);
      const manual = TDW.Store.getModelMode() === 'manual' && models.includes(TDW.Store.getModel()) ? TDW.Store.getModel() : null;
      // Backups: the Flash alias, the next best Flash models, then a Lite model (usually less busy).
      const alias = models.includes(FALLBACK_MODEL) ? [FALLBACK_MODEL] : [];
      const lite = ['models/gemini-flash-lite-latest'].concat(models.filter((m) => /flash-lite$/.test(m)).reverse())
        .filter((m) => models.includes(m)).slice(0, 1);
      const tryList = [...new Set([manual, ...ranked.slice(0, 3), ...alias, ...lite].filter(Boolean))];
      let firstError = null;
      for (const model of tryList.length ? tryList : [FALLBACK_MODEL]) {
        try {
          await generate('Reply with {"ok": true}', OK_SCHEMA, 0, signal, { key: k, model });
          TDW.Store.setKey(k);
          TDW.Store.setModel(model);
          if (manual && model !== manual) TDW.Store.setModelMode('auto'); // the chosen model didn't answer
          writeFallbacks([...new Set([...alias, ...ranked.slice(0, 3), ...lite])].filter((m) => m !== model));
          sticky = null;
          return { model, models };
        } catch (e) {
          if (e.code === 'bad_key' || e.code === 'cancelled') throw e;
          if (!firstError) firstError = e;
        }
      }
      throw firstError;
    },
    simplify: (input, signal) => run('simplify', input, signal),
    // input: { kind, span, sentence, paragraph, title, have: [option texts] } → { options: [string] }
    alternatives: (input, signal) => run('alternatives', input, signal),
    // input: { message, kind, span, paragraph, title, have, thread: [{ by, text }] } → { reply, options: [string] }
    talk: (input, signal) => run('talk', input, signal),
    // Any other prompt with a JSON schema, through the same models, fallbacks and errors.
    // mock(): what the fake AI answers in tests.
    async ask(prompt, schema, temperature, signal, mock) {
      if (TDW.mockAI) { await new Promise((r) => setTimeout(r, 40)); return mock ? mock() : {}; }
      return generate(prompt, schema, temperature == null ? 0.7 : temperature, signal);
    },
    stronger: (input, signal) => run('stronger', input, signal),
    activeVoice: (input, signal) => run('activeVoice', input, signal),
    // input: { check: 'punctuation' | 'weakest' | 'convoluted' | 'tone' | 'hedges', text } → { marks: [{ quote, reason, fix }] }
    lab: (input, signal) => run('lab', { check: input.check, text: String(input.text || '').slice(0, MAX_TIGHTEN) }, signal),
    // input: { text, percent } → { cuts: [quote] }, deletions only.
    async trim(input, signal) {
      const text = String(input.text || '');
      const truncated = text.length > MAX_TIGHTEN;
      const t = truncated ? text.slice(0, MAX_TIGHTEN) : text;
      const words = TDW.Engine.countWords(t);
      const out = await run('trim', { text: t, percent: input.percent, words, target: Math.max(1, Math.round(words * input.percent / 100)) }, signal);
      out.truncated = truncated;
      return out;
    },
    messageCheck: (input, signal) => run('messageCheck', input, signal),
    status() {
      if (TDW.mockAI) return 'mock';
      return TDW.Store.getKey() ? 'ready' : 'none';
    },
    errorMessage(err) {
      const code = err && err.code;
      if (code && code !== 'error' && MESSAGES[code]) return MESSAGES[code];
      return 'Something went wrong: ' + ((err && err.message) || 'unknown error');
    },
    disconnect() {
      TDW.Store.clearKey();
      TDW.Store.setModel('');
      TDW.Store.setModelMode('auto');
      writeFallbacks([]);
      try { localStorage.removeItem(MODELS_KEY); } catch (_) { /* storage blocked */ }
      sticky = null;
    },
    // Settings: which models to offer, and what Automatic would use.
    listing() { const l = readListing(); return l ? l.models : []; },
    bestModel(models) { return rankModels(models || [])[0] || ''; },
    useAuto() {
      TDW.Store.setModelMode('auto');
      const best = rankModels(this.listing())[0];
      if (best) TDW.Store.setModel(best);
      sticky = null;
    },
    useModel(m) {
      TDW.Store.setModelMode('manual');
      TDW.Store.setModel(m);
      sticky = null;
    },
    pickModel,
    rankModels,
    usableModels
  };
})();
