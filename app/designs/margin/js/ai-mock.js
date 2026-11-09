/* Fake AI for tests. Active only when a test sets TDW.mockAI = true from JS; never touches the network. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};

  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject({ code: 'cancelled' }); return; }
      const timer = setTimeout(resolve, ms);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); reject({ code: 'cancelled' }); }, { once: true });
    });
  }

  const firstWords = (s, n) => String(s || '').trim().split(/\s+/).slice(0, n).join(' ').replace(/[\s.,;:!?]+$/, '');

  function firstSentence(text) {
    const r = TDW.Engine.splitSentences(text)[0];
    return r ? text.slice(r.start, r.end) : '';
  }

  const once = (text, q) => !!q && text.indexOf(q) >= 0 && text.indexOf(q) === text.lastIndexOf(q);
  const sentences = (text) => TDW.Engine.splitSentences(text).map((r) => text.slice(r.start, r.end)).filter((q) => !/^#/.test(q));

  function labMarks(input) {
    const t = String(input.text || '');
    const out = [];
    const add = (quote, reason, fix) => { if (once(t, quote) && !out.some((m) => m.quote === quote)) out.push({ quote, reason, fix: fix || '' }); };
    if (input.check === 'punctuation') {
      for (const m of t.matchAll(/\b(\w+) \1\b/g)) add(m[0], 'Doubled word', m[1]);
      for (const m of t.matchAll(/ ,/g)) add(t.slice(Math.max(0, m.index - 5), m.index + 2).trim(), 'Space before a comma', t.slice(Math.max(0, m.index - 5), m.index + 2).trim().replace(' ,', ','));
      for (const m of t.matchAll(/\bteh\b/g)) add('teh', 'Typo', 'the');
    } else if (input.check === 'tone') {
      for (const w of ['utilize', 'leverage', 'synergy', 'paradigm']) add(w, 'Too formal for a plain, direct tone');
    } else if (input.check === 'hedges') {
      for (const w of ['I think', 'sort of', 'basically', 'in order to', 'it seems']) add(w, 'Softens without adding meaning');
    } else {
      const list = sentences(t).sort((x, y) => y.length - x.length).slice(0, input.check === 'weakest' ? 2 : 1);
      for (const q of list) add(q, input.check === 'weakest' ? 'Adds little the reader needs' : 'Hard to follow: too many turns');
    }
    return out;
  }

  function trimCuts(input) {
    const t = String(input.text || '');
    const target = input.target || 1;
    const cuts = [];
    let n = 0;
    const add = (q) => { if (once(t, q) && !cuts.some((c) => c.includes(q) || q.includes(c))) { cuts.push(q); n += TDW.Engine.countWords(q); } };
    for (const w of ['really ', 'very ', 'just ', 'basically ', 'I think ', 'quite ']) { if (n >= target) break; add(w.trim()); }
    const list = sentences(t);
    for (let k = list.length - 1; k > 0 && n < target; k--) add(list[k]);
    return cuts.sort((a, b) => t.indexOf(a) - t.indexOf(b));
  }

  function answer(feature, input) {
    switch (feature) {
      case 'simplify':
        return { options: [
          { text: firstWords(input.sentence, 10) + '.', note: 'Cut the second half' },
          { text: 'A shorter take on the same point.', note: 'Rewritten from scratch' }
        ] };
      case 'alternatives':
        return { options: input.kind === 'word'
          ? ['judgments', 'decisions', 'trade-offs', 'choices', 'bets']
          : ['A plainer way to say it.', 'Another take, in the same voice.', 'The short version.'] };
      case 'talk':
        return /\?\s*$/.test(input.message || '') && !/rewrite|other way|say it/i.test(input.message || '')
          ? { reply: 'It reads fine to me; the point lands.', options: [] }
          : { reply: 'Here are a few tighter takes.', options: input.kind === 'word' ? ['choices', 'bets'] : ['A tighter version.', 'A bolder version.', 'A plainer version.'] };
      case 'stronger':
        return { options: [{ text: 'remarkable', note: 'Mock option' }, { text: 'striking', note: 'Mock option' }] };
      case 'activeVoice':
        return { options: [{ text: 'The team wrote it.', note: 'Doer comes first' }] };
      case 'lab': return { marks: labMarks(input) };
      case 'trim': return { cuts: trimCuts(input) };
      case 'messageCheck':
        return {
          takeaway: 'Cut words and your writing gets clearer.',
          verdict: 'mixed',
          match: input.intent ? 'partly' : 'none',
          why: 'Mock answer for testing.',
          offMessage: [{ quote: firstSentence(input.text), reason: 'Mock reason' }],
          strongerOpening: 'Every word costs you.',
          strongerEnding: 'Cut one more word.'
        };
      case 'connect':
        return { model: 'models/mock-flash', models: ['models/mock-flash'] };
      default:
        throw { code: 'error', message: 'unknown feature' };
    }
  }

  TDW.AIMock = {
    respond(feature, input, signal) {
      return wait(700, signal).then(() => answer(feature, input || {}));
    }
  };
})();
