/* Writing challenges: the catalog and the rules, as pure functions so Node can test them.
   A challenge checks text; it never changes it. The text it gets is the page with ghosted
   characters turned into spaces (App.masked), so ghosts never count.
   UMD: TDW.ChallengeRules in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./inline.js'), require('./data.js'));
  else { root.TDW = root.TDW || {}; root.TDW.ChallengeRules = factory(root.TDW.Engine, root.TDW.Inline, root.TDW.Data); }
})(typeof self !== 'undefined' ? self : this, function (Engine, Inline, D) {
  'use strict';

  const LEVELS = ['easy', 'medium', 'hard'];
  const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const CATEGORIES = [
    { key: 'A', name: 'Length and money' },
    { key: 'B', name: 'Sentences and rhythm' },
    { key: 'C', name: 'Words and grade' },
    { key: 'D', name: 'Time and pressure' },
    { key: 'E', name: 'Adapted to what you\u2019re writing' }
  ];

  /* ---------- Word lists ---------- */

  // C10: words that can land in almost any piece, from plain to odd.
  const DROP_WORDS = {
    easy: ['window', 'coffee', 'river', 'ladder', 'pocket', 'garden', 'engine', 'mirror', 'bridge', 'candle', 'ticket', 'island',
      'blanket', 'kitchen', 'thunder', 'bicycle', 'compass', 'harbor', 'pencil', 'orchard', 'lantern', 'meadow', 'staircase', 'suitcase'],
    medium: ['avalanche', 'origami', 'lighthouse', 'telescope', 'quicksand', 'accordion', 'cathedral', 'volcano', 'labyrinth', 'carousel',
      'submarine', 'hammock', 'glacier', 'typewriter', 'chandelier', 'scarecrow', 'trampoline', 'aquarium', 'cactus', 'metronome',
      'kaleidoscope', 'boomerang', 'jellyfish', 'satellite'],
    hard: ['platypus', 'sarcophagus', 'tuba', 'kumquat', 'zeppelin', 'abacus', 'gargoyle', 'narwhal', 'pogo', 'bagpipe', 'tiramisu',
      'periscope', 'theremin', 'yodel', 'armadillo', 'monocle', 'pinata', 'sombrero', 'catapult', 'flamingo', 'harmonica', 'walrus',
      'confetti', 'gondola']
  };

  // C11: one rare, precise word, with what it means, so it can be earned.
  const RARE_WORDS = [
    ['sonder', 'the sense that every passerby has a life as vivid as yours'],
    ['petrichor', 'the smell of rain on dry earth'],
    ['defenestrate', 'to throw out of a window'],
    ['sesquipedalian', 'given to using long words'],
    ['apricity', 'the warmth of the sun in winter'],
    ['callow', 'young and inexperienced'],
    ['lacuna', 'a gap where something is missing'],
    ['limerence', 'the state of being infatuated with someone'],
    ['crepuscular', 'of or like twilight'],
    ['ineffable', 'too great to be put into words'],
    ['mellifluous', 'sweet and smooth to hear'],
    ['obfuscate', 'to make deliberately unclear'],
    ['perspicacious', 'quick to notice and understand'],
    ['quixotic', 'idealistic to the point of being impractical'],
    ['sanguine', 'optimistic, especially in a bad situation'],
    ['ebullient', 'cheerful and full of energy'],
    ['laconic', 'using very few words'],
    ['pellucid', 'clear in meaning; easy to understand'],
    ['recalcitrant', 'stubbornly uncooperative'],
    ['susurrus', 'a whispering or rustling sound'],
    ['vellichor', 'the wistfulness of used bookshops'],
    ['hiraeth', 'homesickness for a place you can\u2019t return to'],
    ['palimpsest', 'something reused but still bearing traces of before'],
    ['apophenia', 'seeing patterns in random things'],
    ['tmesis', 'splitting a word with another word inside it'],
    ['bricolage', 'something built from whatever was at hand'],
    ['shibboleth', 'a custom or word that marks who belongs'],
    ['zeitgeist', 'the spirit of a time'],
    ['liminal', 'at a threshold between two states'],
    ['ersatz', 'a poor imitation of the real thing'],
    ['halcyon', 'calm and happy, often looking back'],
    ['jejune', 'naive and simplistic'],
    ['mendacious', 'not telling the truth'],
    ['numinous', 'having a strong spiritual quality'],
    ['pulchritude', 'beauty'],
    ['sui generis', 'unique, in a class of its own'],
    ['verisimilitude', 'the look of being true or real'],
    ['wabi-sabi', 'beauty in imperfection and impermanence'],
    ['gormless', 'lacking sense; foolish'],
    ['kerfuffle', 'a commotion or fuss']
  ];

  const FIELDS = ['cooking', 'sailing', 'chess', 'gardening', 'mountaineering', 'jazz', 'beekeeping', 'carpentry', 'astronomy', 'surgery',
    'baseball', 'architecture', 'fishing', 'theater', 'archaeology', 'plumbing', 'ballet', 'poker', 'weather forecasting', 'firefighting'];
  const GENRES = ['a recipe', 'a weather forecast', 'a court verdict', 'a sports commentary', 'a field guide entry', 'a museum placard',
    'a product review', 'a flight safety briefing', 'a nature documentary voice-over', 'a lost-and-found notice', 'an instruction manual',
    'a horoscope'];

  const WEASELS = {
    easy: ['very', 'really', 'just'],
    medium: ['very', 'really', 'just', 'quite', 'actually', 'basically', 'literally'],
    hard: ['very', 'really', 'just', 'quite', 'actually', 'basically', 'literally', 'totally', 'simply', 'somewhat', 'kind of', 'sort of', 'that']
  };

  const LIPO_LETTERS = { easy: ['z', 'q', 'j', 'x'], medium: ['k', 'w', 'v', 'b', 'p'], hard: ['e', 'a', 't', 'o'] };

  /* ---------- Reading the text ---------- */

  // What a reader sees: no markdown, no Notion blocks; one entry per non-empty line.
  function paragraphs(text) {
    return String(text || '').split('\n').map((l) => (Inline ? Inline.plain(l) : l)).map((l) => l.trim()).filter(Boolean);
  }
  const plainBody = (text) => paragraphs(text).join('\n');

  const countWords = (s) => Engine.countWords(s);
  function sentencesOf(s) {
    return Engine.splitSentences(s).map((r) => s.slice(r.start, r.end)).filter((x) => /[\p{L}\p{N}]/u.test(x));
  }
  const sentences = (text) => sentencesOf(plainBody(text));

  // The first real word of a sentence, past quotes, brackets, dashes and list bullets.
  function firstWord(sentence) {
    const m = /[\p{L}\p{N}]+(?:['\u2019][\p{L}]+)*/u.exec(String(sentence || ''));
    return m ? m[0] : '';
  }
  function firstLetter(sentence) {
    const m = /[\p{L}]/u.exec(String(sentence || ''));
    return m ? m[0] : '';
  }
  const WORD_G = /[\p{L}\p{N}]+(?:['\u2019\-][\p{L}\p{N}]+)*/gu;
  const wordsOf = (s) => String(s || '').match(WORD_G) || [];
  const lowerApos = (w) => w.toLowerCase().replace(/\u2019/g, "'");

  function syllables(word) {
    let w = lowerApos(word).replace(/'s$/, '').replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|[^laeiouydt]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = w.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  // Does the text use this word (or a simple inflection of it)?
  function uses(text, word) {
    const w = String(word || '').toLowerCase().trim();
    if (!w) return false;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]+');
    const re = new RegExp('(^|[^\\p{L}\\p{N}])' + esc + '(s|es|ed|d|ing|er|ers|\'s)?(?=$|[^\\p{L}\\p{N}])', 'iu');
    return re.test(plainBody(text));
  }

  function found(text, list) {
    return list.filter((w) => uses(text, w));
  }

  const ADVERB_EX = new Set(D.ADVERB_EXCEPTIONS || []);
  function adverbs(text) {
    return wordsOf(plainBody(text)).filter((w) => {
      const l = lowerApos(w);
      return l.length >= 4 && l.endsWith('ly') && !ADVERB_EX.has(l) && /^[a-z]+$/.test(l);
    });
  }

  const BE = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', "isn't", "aren't", "wasn't", "weren't", "ain't"]);
  const BE_CONTRACTED = /^(i'm|you're|we're|they're|(he|she|it|that|there|here|what|who|where|how|this)'s)$/;
  function toBe(text) {
    return wordsOf(plainBody(text)).filter((w) => {
      const l = lowerApos(w);
      return BE.has(l) || BE_CONTRACTED.test(l) || /'re$/.test(l);
    });
  }

  const statOf = (text) => Engine.analyze(text);

  /* ---------- Rules ---------- */

  const rule = (label, ok, detail) => ({ label, ok: !!ok, detail: detail || '' });
  const words = (n) => n + (n === 1 ? ' word' : ' words');
  const enough = (n, have) => rule('At least ' + words(n) + ' written', have >= n, have + ' so far');
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const judged = (ctx, id, label) => {
    const j = ctx.judge && ctx.judge[id];
    return Object.assign(rule(label, j && j.ok, j ? j.why : 'Press \u201cJudge it\u201d when you\u2019re done'), { judge: true });
  };

  // Every challenge: id, name, cat, desc(params, data), params by level (or one for all),
  // ai: null | 'set' | 'judge' | 'set+judge', group: at most one per combo, needs/allows: the
  // word counts it makes sense with (for combos), check(text, ctx, params) → rules.
  const LIST = [
    /* ----- A. Length and money ----- */
    {
      id: 'A1', cat: 'A', name: 'Exact change', group: 'length',
      desc: (p, d, ctx) => 'Land on exactly the budget: ' + money(ctx && ctx.budget) + ' means exactly ' + words(Math.round(((ctx && ctx.budget) || 0) / 10)) + '.',
      size: (ctx) => { const n = Math.round(((ctx && ctx.budget) || 0) / 10); return [n, n]; },
      check(text, ctx) {
        const want = Math.round((ctx.budget || 0) / 10);
        const have = countWords(text);
        return [rule('Exactly ' + words(want), have === want, have === want ? 'Spot on' : have < want ? (want - have) + ' to go' : (have - want) + ' over')];
      }
    },
    {
      id: 'A2', cat: 'A', name: 'Six-word story', group: 'length', size: () => [6, 6],
      desc: () => 'Tell the whole thing in exactly 6 words.',
      check(text) { const n = countWords(text); return [rule('Exactly 6 words', n === 6, words(n))]; }
    },
    {
      id: 'A3', cat: 'A', name: 'Drabble', group: 'length', size: () => [100, 100],
      desc: () => 'Exactly 100 words.',
      check(text) { const n = countWords(text); return [rule('Exactly 100 words', n === 100, n < 100 ? (100 - n) + ' to go' : n === 100 ? 'Spot on' : (n - 100) + ' over')]; }
    },
    {
      id: 'A4', cat: 'A', name: 'Tweet-size', group: 'length',
      params: { easy: { max: 280 }, medium: { max: 200 }, hard: { max: 140 } },
      size: (ctx, p) => [3, Math.floor(p.max / 5)],
      desc: (p) => 'Make the point in ' + p.max + ' characters or fewer.',
      check(text, ctx, p) {
        const body = plainBody(text);
        const n = [...body].length;
        return [rule(p.max + ' characters or fewer', n <= p.max && countWords(body) >= 3, n + ' characters'), rule('Say something', countWords(body) >= 3, words(countWords(body)))];
      }
    },
    {
      id: 'A5', cat: 'A', name: 'Half price', group: 'length', setsBudget: true, size: () => [10, 1e9],
      desc: (p, d) => d && d.target ? 'Your budget is now ' + money(d.target * 10) + ', half of what you had written. Cut by hand to fit.' : 'Write it, then halve it: the budget drops to half your word count, and you cut to fit by hand.',
      needsText: 10,
      // At the start: half the words written, rounded to $10.
      start(text) { const n = countWords(text); return { target: Math.max(1, Math.floor(n / 2)), from: n }; },
      check(text, ctx) {
        const n = countWords(text);
        const t = (ctx.data && ctx.data.target) || 0;
        return [rule('Cut to ' + words(t) + ' or fewer', n > 0 && n <= t, n <= t ? words(n) : (n - t) + ' to cut')];
      }
    },
    {
      id: 'A6', cat: 'A', name: 'Inflation', group: 'length', setsBudget: true, timed: true,
      params: { easy: { min: 30 }, medium: { min: 50 }, hard: { min: 80 } },
      size: (ctx, p) => [p.min, 1e9],
      desc: (p) => 'Your budget shrinks by $10 every minute you write. Get to ' + words(p.min) + ' without going over.',
      start(text, ctx) { return { startBudget: ctx.budget, startWords: countWords(text) }; },
      // The budget now: $10 less for every whole minute the tab was open and visible.
      budgetAt: (data, activeMs) => Math.max(10, (data.startBudget || 0) - 10 * Math.floor((activeMs || 0) / 60000)),
      check(text, ctx, p) {
        const n = countWords(text);
        const b = ctx.budget || 0;
        return [enough(p.min, n), rule('Under the shrinking budget', n * 10 <= b, money(n * 10) + ' of ' + money(b))];
      }
    },

    /* ----- B. Sentences and rhythm ----- */
    {
      id: 'B1', cat: 'B', name: 'Short fuse',
      params: { easy: { max: 15 }, medium: { max: 12 }, hard: { max: 8 } },
      size: () => [8, 1e9],
      desc: (p) => 'No sentence over ' + words(p.max) + '.',
      check(text, ctx, p) {
        const ss = sentences(text);
        const longest = ss.reduce((m, s) => Math.max(m, countWords(s)), 0);
        return [rule('At least 3 sentences', ss.length >= 3, ss.length + ' so far'),
          rule('Every sentence ' + words(p.max) + ' or fewer', ss.length && longest <= p.max, 'Longest: ' + words(longest))];
      }
    },
    {
      id: 'B2', cat: 'B', name: 'Music',
      params: { easy: { gap: 2 }, medium: { gap: 3 }, hard: { gap: 5 } },
      size: () => [15, 1e9],
      desc: (p) => 'Vary the rhythm: no two sentences in a row within ' + words(p.gap) + ' of each other in length.',
      check(text, ctx, p) {
        const n = sentences(text).map(countWords);
        let bad = -1;
        for (let i = 1; i < n.length; i++) if (Math.abs(n[i] - n[i - 1]) < p.gap) { bad = i; break; }
        return [rule('At least 4 sentences', n.length >= 4, n.length + ' so far'),
          rule('Lengths keep changing', n.length >= 2 && bad < 0, bad < 0 ? n.join(', ') + ' words' : 'Sentences ' + bad + ' and ' + (bad + 1) + ': ' + n[bad - 1] + ' and ' + n[bad] + ' words')];
      }
    },
    {
      id: 'B3', cat: 'B', name: 'Five-word rule',
      params: { easy: { long: 20 }, medium: { long: 25 }, hard: { long: 30 } },
      size: (ctx, p) => [p.long + 4, 1e9],
      desc: (p) => 'Include a one-word sentence, a short one (2 to 5 words) and a long one (over ' + p.long + ' words).',
      check(text, ctx, p) {
        const n = sentences(text).map(countWords);
        return [rule('A one-word sentence', n.includes(1)), rule('A short one, 2 to 5 words', n.some((x) => x >= 2 && x <= 5)),
          rule('A long one, over ' + words(p.long), n.some((x) => x > p.long), 'Longest: ' + words(n.reduce((m, x) => Math.max(m, x), 0)))];
      }
    },
    {
      id: 'B4', cat: 'B', name: 'Fresh starts', size: () => [10, 1e9],
      params: { easy: { min: 4 }, medium: { min: 6 }, hard: { min: 10 } },
      desc: (p) => 'No two sentences begin with the same word (at least ' + p.min + ' sentences).',
      check(text, ctx, p) {
        const ss = sentences(text);
        const seen = new Map();
        let dup = '';
        for (const s of ss) {
          const w = lowerApos(firstWord(s));
          if (!w) continue;
          if (seen.has(w)) { dup = firstWord(s); break; }
          seen.set(w, true);
        }
        return [rule('At least ' + p.min + ' sentences', ss.length >= p.min, ss.length + ' so far'),
          rule('Every sentence starts fresh', ss.length && !dup, dup ? '\u201c' + dup + '\u201d starts two' : '')];
      }
    },
    {
      id: 'B5', cat: 'B', name: 'Alphabet',
      params: { easy: { n: 5 }, medium: { n: 10 }, hard: { n: 26 } },
      size: (ctx, p) => [p.n * 2, 1e9],
      desc: (p) => 'Each sentence starts with the next letter: A, B, C\u2026 (' + p.n + ' sentences, ' + ABC[0] + ' to ' + ABC[p.n - 1] + ').',
      check(text, ctx, p) {
        const ss = sentences(text);
        let run = 0;
        for (const s of ss) {
          if (firstLetter(s).toUpperCase() !== ABC[run % 26]) break;
          run++;
        }
        const next = run < p.n ? ABC[run] : '';
        return [rule(p.n + ' sentences in order, ' + ABC[0] + ' to ' + ABC[p.n - 1], run >= p.n, run >= p.n ? 'Done' : run + ' in order; next starts with ' + next)];
      }
    },
    {
      id: 'B6', cat: 'B', name: 'Questions first', size: () => [8, 1e9],
      params: { easy: { n: 2 }, medium: { n: 3 }, hard: { n: 4 } },
      desc: (p) => 'The opening paragraph is only questions (at least ' + p.n + ').',
      check(text, ctx, p) {
        const first = openingParagraph(text);
        const ss = sentencesOf(first);
        const allQ = ss.length > 0 && ss.every((s) => /\?["'\u201d\u2019)\]]*$/.test(s));
        return [rule('At least ' + p.n + ' questions to open', ss.length >= p.n, ss.length + ' so far'),
          rule('Nothing but questions', allQ, allQ ? '' : 'A sentence there isn\u2019t a question'),
          rule('Then the rest', paragraphs(text).length >= 2 + (isHeading(text) ? 1 : 0))];
      }
    },
    {
      id: 'B7', cat: 'B', name: 'Two-line paragraphs', size: () => [12, 1e9],
      params: { easy: { max: 3 }, medium: { max: 2 }, hard: { max: 1 } },
      desc: (p) => 'No paragraph over ' + p.max + (p.max === 1 ? ' sentence.' : ' sentences.'),
      check(text, ctx, p) {
        const ps = paragraphs(text);
        const most = ps.reduce((m, x) => Math.max(m, sentencesOf(x).length), 0);
        return [rule('At least 3 paragraphs', ps.length >= 3, ps.length + ' so far'),
          rule('Every paragraph ' + p.max + (p.max === 1 ? ' sentence' : ' sentences') + ' or fewer', ps.length && most <= p.max, 'Most: ' + most)];
      }
    },
    {
      id: 'B8', cat: 'B', name: 'Hook in 8', size: () => [3, 1e9],
      params: { easy: { max: 10 }, medium: { max: 8 }, hard: { max: 5 } },
      desc: (p) => 'The first sentence is ' + words(p.max) + ' or fewer.',
      check(text, ctx, p) {
        const s = sentencesOf(openingParagraph(text))[0] || '';
        const n = countWords(s);
        return [rule('First sentence ' + words(p.max) + ' or fewer', n > 0 && n <= p.max, n ? words(n) : 'Not written yet')];
      }
    },

    /* ----- C. Words and grade ----- */
    {
      id: 'C1', cat: 'C', name: 'Grade 5', group: 'grade', size: () => [30, 1e9],
      params: { easy: { max: 7 }, medium: { max: 5 }, hard: { max: 3 } },
      name2: (p) => 'Grade ' + p.max,
      desc: (p) => 'The readability grade stays at ' + p.max + ' or under.',
      check(text, ctx, p) {
        const a = statOf(text);
        return [enough(30, a.words), rule('Grade ' + p.max + ' or under', a.words >= 30 && a.grade <= p.max, 'Grade ' + a.grade)];
      }
    },
    {
      id: 'C2', cat: 'C', name: 'Plain English', group: 'grade', size: () => [30, 1e9],
      desc: () => 'Zero hard or very hard sentences and zero wordy phrases.',
      check(text) {
        const a = statOf(text);
        const hard = a.counts.hard + a.counts.veryHard;
        return [enough(30, a.words), rule('No hard sentences', a.words >= 30 && hard === 0, hard ? hard + ' to fix' : ''),
          rule('No wordy phrases', a.words >= 30 && a.counts.complex === 0, a.counts.complex ? a.counts.complex + ' to fix' : '')];
      }
    },
    {
      id: 'C3', cat: 'C', name: 'No adverbs', size: () => [30, 1e9],
      desc: () => 'No -ly adverbs.',
      check(text) {
        const n = countWords(text);
        const list = adverbs(text);
        return [enough(30, n), rule('No -ly adverbs', n >= 30 && !list.length, list.length ? 'Found: ' + uniq(list).slice(0, 4).join(', ') : '')];
      }
    },
    {
      id: 'C4', cat: 'C', name: 'No weasels', size: () => [30, 1e9],
      desc: (p) => 'None of: ' + p.list.join(', ') + '.',
      params: { easy: { list: WEASELS.easy }, medium: { list: WEASELS.medium }, hard: { list: WEASELS.hard } },
      check(text, ctx, p) {
        const n = countWords(text);
        const hit = p.list.filter((w) => new RegExp('(^|[^\\p{L}])' + w.replace(/ /g, '\\s+') + '(?=$|[^\\p{L}])', 'iu').test(plainBody(text)));
        return [enough(30, n), rule('No weasel words', n >= 30 && !hit.length, hit.length ? 'Found: ' + hit.join(', ') : '')];
      }
    },
    {
      id: 'C5', cat: 'C', name: 'Active only', size: () => [30, 1e9],
      desc: () => 'Zero passive voice.',
      check(text) {
        const a = statOf(text);
        return [enough(30, a.words), rule('No passive voice', a.words >= 30 && !a.counts.passive, a.counts.passive ? a.counts.passive + ' to fix' : '')];
      }
    },
    {
      id: 'C6', cat: 'C', name: 'E-Prime', size: () => [30, 1e9],
      desc: () => 'No form of \u201cto be\u201d: is, are, was, were, be, been, being, am (and I\u2019m, it\u2019s, they\u2019re\u2026).',
      check(text) {
        const n = countWords(text);
        const list = toBe(text);
        return [enough(30, n), rule('No \u201cto be\u201d', n >= 30 && !list.length, list.length ? 'Found: ' + uniq(list.map(lowerApos)).slice(0, 5).join(', ') : '')];
      }
    },
    {
      id: 'C7', cat: 'C', name: 'One syllable',
      params: { easy: { min: 15 }, medium: { min: 30 }, hard: { min: 50 } },
      size: (ctx, p) => [p.min, 1e9],
      desc: (p) => 'One paragraph of at least ' + words(p.min) + ', every one of them a single syllable.',
      check(text, ctx, p) {
        let best = 0, culprit = '';
        for (const para of paragraphs(text)) {
          const ws = wordsOf(para);
          const bad = ws.find((w) => /\p{L}/u.test(w) && syllables(w) > 1);
          if (!bad) best = Math.max(best, ws.length);
          else if (ws.length >= p.min && !culprit) culprit = bad;
        }
        return [rule('A one-syllable paragraph of ' + words(p.min), best >= p.min, best ? 'Longest so far: ' + words(best) : culprit ? '\u201c' + culprit + '\u201d has more than one' : '')];
      }
    },
    {
      id: 'C8', cat: 'C', name: 'Lipogram',
      params: { easy: { letters: LIPO_LETTERS.easy, min: 30 }, medium: { letters: LIPO_LETTERS.medium, min: 40 }, hard: { letters: LIPO_LETTERS.hard, min: 50 } },
      size: (ctx, p) => [p.min, 1e9],
      name2: (p, d) => 'Lipogram: no ' + ((d && d.letter) || '?').toUpperCase(),
      desc: (p, d) => 'Write without the letter ' + ((d && d.letter) || '?').toUpperCase() + '.',
      start(text, ctx, p, rand) { return { letter: pick(p.letters, rand) }; },
      check(text, ctx, p) {
        const L = ((ctx.data && ctx.data.letter) || 'e').toLowerCase();
        const body = plainBody(text);
        const n = countWords(body);
        const hits = wordsOf(body).filter((w) => w.toLowerCase().includes(L));
        return [enough(p.min, n), rule('No ' + L.toUpperCase() + ' anywhere', n >= p.min && !hits.length, hits.length ? 'Found in: ' + uniq(hits).slice(0, 4).join(', ') : '')];
      }
    },
    {
      id: 'C9', cat: 'C', name: 'No I', size: () => [10, 1e9],
      desc: () => 'No sentence starts with \u201cI\u201d.',
      check(text) {
        const ss = sentences(text);
        const bad = ss.filter((s) => /^(i|i'm|i've|i'd|i'll)$/.test(lowerApos(firstWord(s))) && firstWord(s)[0] === 'I');
        return [rule('At least 4 sentences', ss.length >= 4, ss.length + ' so far'), rule('None starts with I', ss.length && !bad.length, bad.length ? bad.length + ' do' : '')];
      }
    },
    {
      id: 'C10', cat: 'C', name: 'Random word drop', size: () => [20, 1e9],
      params: { easy: { pool: 'easy' }, medium: { pool: 'medium' }, hard: { pool: 'hard' } },
      desc: (p, d) => 'Use these naturally: ' + ((d && d.words) || []).join(', ') + '.',
      start(text, ctx, p, rand) { return { words: pickN(DROP_WORDS[p.pool], 3, rand) }; },
      check(text, ctx) {
        const list = (ctx.data && ctx.data.words) || [];
        return list.length ? list.map((w) => rule('Use \u201c' + w + '\u201d', uses(text, w))) : [rule('Waiting for the words', false)];
      }
    },
    {
      id: 'C11', cat: 'C', name: 'Ten-dollar word', ai: 'judge', size: () => [20, 1e9], judge: () => '',
      desc: (p, d) => d && d.word ? 'Use \u201c' + d.word + '\u201d (' + d.meaning + ') and earn it.' : 'Use one rare, precise word, and earn it.',
      start(text, ctx, p, rand) { const w = pick(RARE_WORDS, rand); return { word: w[0], meaning: w[1] }; },
      check(text, ctx) {
        const w = ctx.data && ctx.data.word;
        return [rule('Use \u201c' + w + '\u201d', uses(text, w)), judged(ctx, 'C11', 'It fits naturally')];
      }
    },

    /* ----- D. Time and pressure ----- */
    {
      id: 'D1', cat: 'D', name: 'Sprint', group: 'timer', timed: true,
      params: { easy: { words: 100, min: 5 }, medium: { words: 150, min: 5 }, hard: { words: 250, min: 5 } },
      size: (ctx, p) => [p.words, 1e9],
      desc: (p) => words(p.words) + ' in ' + p.min + ' minutes. The clock starts now.',
      start(text) { return { startWords: countWords(text) }; },
      limitMs: (p) => p.min * 60000,
      check(text, ctx, p) {
        const n = Math.max(0, countWords(text) - ((ctx.data && ctx.data.startWords) || 0));
        const left = p.min * 60000 - (ctx.elapsedMs || 0);
        return [rule(words(p.words) + ' written', n >= p.words, n + ' new'), rule('Before the clock runs out', left > 0, left > 0 ? mmss(left) + ' left' : 'Time\u2019s up')];
      }
    },
    {
      id: 'D2', cat: 'D', name: 'No looking back', group: 'timer', timed: true, setsBackspace: true,
      params: { easy: { min: 5, words: 50 }, medium: { min: 10, words: 100 }, hard: { min: 20, words: 200 } },
      size: (ctx, p) => [p.words, 1e9],
      desc: (p) => p.min + ' minutes with No backspace on. You may ghost, not delete.',
      start(text) { return { startWords: countWords(text) }; },
      limitMs: (p) => p.min * 60000,
      check(text, ctx, p) {
        const n = Math.max(0, countWords(text) - ((ctx.data && ctx.data.startWords) || 0));
        const left = p.min * 60000 - (ctx.elapsedMs || 0);
        return [rule('Keep going for ' + p.min + ' minutes', left <= 0, left > 0 ? mmss(left) + ' left' : 'Done'), rule(words(p.words) + ' along the way', n >= p.words, n + ' new')];
      }
    },
    {
      id: 'D3', cat: 'D', name: 'Don\u2019t stop', group: 'timer', timed: true,
      params: { easy: { min: 3, pause: 8 }, medium: { min: 5, pause: 5 }, hard: { min: 10, pause: 3 } },
      size: () => [20, 1e9],
      desc: (p) => 'Pause for more than ' + p.pause + ' seconds and your last sentence ghosts itself. Keep going for ' + p.min + ' minutes.',
      start(text) { return { startWords: countWords(text), ghosted: 0 }; },
      limitMs: (p) => p.min * 60000,
      pauseMs: (p) => p.pause * 1000,
      check(text, ctx, p) {
        const left = p.min * 60000 - (ctx.elapsedMs || 0);
        const n = Math.max(0, countWords(text) - ((ctx.data && ctx.data.startWords) || 0));
        const g = (ctx.data && ctx.data.ghosted) || 0;
        return [rule('Keep going for ' + p.min + ' minutes', left <= 0, left > 0 ? mmss(left) + ' left' : 'Done'),
          rule('Something written', n >= 20, n + ' new words' + (g ? ' \u00b7 ' + g + ' ghosted' : ''))];
      }
    },

    /* ----- E. Adapted to what you're writing (AI) ----- */
    {
      id: 'E1', cat: 'E', name: 'Ban the obvious', ai: 'set', size: () => [30, 1e9],
      desc: (p, d) => d && d.words ? 'Don\u2019t use: ' + d.words.join(', ') + '.' : 'The AI names the 5 words everyone uses for this topic. You can\u2019t use them.',
      set: {
        ask: (topic) => 'Name the 5 most obvious, overused words anyone writing about this topic would reach for. Single words, lowercase.',
        schema: 'words', mock: () => ({ words: ['really', 'important', 'great', 'thing', 'very'] })
      },
      check(text, ctx) {
        const list = (ctx.data && ctx.data.words) || [];
        const hit = found(text, list);
        return [enough(30, countWords(text)), rule('None of the obvious words', countWords(text) >= 30 && !hit.length, hit.length ? 'Used: ' + hit.join(', ') : '')];
      }
    },
    {
      id: 'E2', cat: 'E', name: 'Jargon jail', ai: 'set', size: () => [30, 1e9], needsText: 20,
      desc: (p, d) => d && d.words ? 'Rewrite without: ' + d.words.join(', ') + '.' : 'The AI lists your field\u2019s jargon in this draft, and you rewrite without it.',
      set: {
        ask: () => 'List the jargon, buzzwords and insider terms in this draft that a general reader might not know or that sound like corporate speak. Use the exact words or short phrases as they appear. Up to 8. If there are fewer, list what there is.',
        schema: 'words', mock: () => ({ words: ['leverage', 'synergy', 'stakeholders'] })
      },
      check(text, ctx) {
        const list = (ctx.data && ctx.data.words) || [];
        const hit = found(text, list);
        return [rule('No jargon left', !hit.length, hit.length ? 'Still there: ' + hit.join(', ') : list.length ? 'All gone' : '')];
      }
    },
    {
      id: 'E3', cat: 'E', name: 'Surprise words', ai: 'set', size: () => [30, 1e9],
      desc: (p, d) => d && d.words ? 'Work these in: ' + d.words.join(', ') + '.' : '3 unexpected but usable words picked for your topic. Work them in.',
      set: {
        ask: () => 'Pick 3 surprising words that rarely appear in writing about this topic but that a clever writer could work in naturally. Concrete, vivid words. Lowercase single words.',
        schema: 'words', mock: () => ({ words: ['lighthouse', 'marmalade', 'compass'] })
      },
      check(text, ctx) {
        const list = (ctx.data && ctx.data.words) || [];
        return list.length ? list.map((w) => rule('Use \u201c' + w + '\u201d', uses(text, w))) : [rule('Waiting for the words', false)];
      }
    },
    {
      id: 'E4', cat: 'E', name: 'Borrowed field', ai: 'judge', size: () => [30, 1e9],
      desc: (p, d) => 'Explain your point with an analogy from ' + ((d && d.field) || 'another field') + '.',
      start(text, ctx, p, rand) { return { field: pick(FIELDS, rand) }; },
      judge: (d) => 'The writer had to explain their point with an analogy from ' + d.field + '. Does the draft contain a clear, working analogy from ' + d.field + ' that carries the point?',
      check(text, ctx) { return [enough(30, countWords(text)), judged(ctx, 'E4', 'An analogy from ' + ((ctx.data && ctx.data.field) || 'the field') + ' carries the point')]; }
    },
    {
      id: 'E5', cat: 'E', name: 'Write to the ending', ai: 'set', size: () => [30, 1e9],
      desc: (p, d) => d && d.line ? 'End on this line: \u201c' + d.line + '\u201d' : 'The AI gives you a last line, and you write toward it.',
      set: {
        ask: () => 'Write one strong last line for a short piece on this topic: a closing sentence of 6 to 14 words that a writer would have to earn. Return it as "line".',
        schema: 'line', mock: () => ({ line: 'And that is why the small things never stay small.' })
      },
      check(text, ctx) {
        const line = (ctx.data && ctx.data.line) || '';
        const ps = paragraphs(text);
        const last = ps[ps.length - 1] || '';
        const ok = !!line && squash(last).endsWith(squash(line));
        return [enough(30, countWords(text)), rule('It ends on that line', ok, ok ? '' : 'Make it your last sentence')];
      }
    },
    {
      id: 'E6', cat: 'E', name: 'Start in the middle', ai: 'set+judge', size: () => [30, 1e9],
      desc: (p, d) => d && d.moment ? 'Open right here, no setup: ' + d.moment : 'The AI picks a vivid moment from your topic, and you open there with no setup.',
      set: {
        ask: () => 'Pick one vivid, specific moment from this topic for the writer to open on, in the middle of the action, with no setup. Describe it in one sentence of under 20 words. Return it as "line".',
        schema: 'line', mock: () => ({ line: 'The moment the first customer emailed to say it was broken.' }), key: 'moment'
      },
      judge: (d) => 'The writer had to open in the middle of this moment, with no setup or throat-clearing: "' + d.moment + '". Does the first paragraph drop the reader straight into it?',
      check(text, ctx) { return [enough(30, countWords(text)), judged(ctx, 'E6', 'It opens in the moment')]; }
    },
    {
      id: 'E7', cat: 'E', name: 'Argue the other side first', ai: 'set+judge', size: () => [60, 1e9],
      desc: (p, d) => d && d.counter ? 'Open with the best case against you: ' + d.counter + ' Then win anyway.' : 'Open with the best case against your point, then win anyway.',
      set: {
        ask: () => 'State the single strongest counterargument to the writer\u2019s point, in one or two sentences, as a smart opponent would. Return it as "line".',
        schema: 'line', mock: () => ({ line: 'Most people never notice the difference, so the effort is wasted.' }), key: 'counter'
      },
      judge: (d) => 'The writer had to open with the strongest case against their own point ("' + d.counter + '"), stated fairly, and then win the argument anyway. Did they do both?',
      check(text, ctx) { return [enough(60, countWords(text)), judged(ctx, 'E7', 'Opens with the other side, then wins')]; }
    },
    {
      id: 'E8', cat: 'E', name: 'Explain it to a 10-year-old', ai: 'judge', group: 'grade', size: () => [40, 1e9],
      params: { easy: { max: 5 }, medium: { max: 4 }, hard: { max: 3 } },
      desc: (p) => 'Grade ' + p.max + ' or under, and nothing important lost.',
      judge: () => 'The writer had to explain their topic so a 10-year-old understands it, without losing anything important. Would a bright 10-year-old follow it, and does it still carry the key points an adult would need?',
      check(text, ctx, p) {
        const a = statOf(text);
        return [enough(40, a.words), rule('Grade ' + p.max + ' or under', a.words >= 40 && a.grade <= p.max, 'Grade ' + a.grade), judged(ctx, 'E8', 'Nothing important got lost')];
      }
    },
    {
      id: 'E9', cat: 'E', name: 'Skeptic in the room', ai: 'ask', size: () => [60, 1e9], skeptic: true,
      params: { easy: { n: 2 }, medium: { n: 3 }, hard: { n: 5 } },
      desc: (p) => 'After each paragraph, a skeptical reader asks a question. Your next paragraph answers it. ' + p.n + ' rounds.',
      // Each question remembers how many paragraphs there were when it was asked; it counts as
      // answered once a paragraph comes after that.
      check(text, ctx, p) {
        const qs = (ctx.data && ctx.data.questions) || [];
        const count = paragraphs(text).length;
        const answered = qs.filter((q) => count > q.after).length;
        return [rule(p.n + ' skeptic questions answered', answered >= p.n, answered + ' of ' + p.n + (qs.length > answered ? ' \u00b7 one waiting' : ''))];
      }
    },
    {
      id: 'E10', cat: 'E', name: 'Show, don\u2019t claim', ai: 'set+judge', size: () => [40, 1e9], needsText: 20,
      desc: (p, d) => d && d.claims && d.claims.length ? 'Back each of these with a concrete example: ' + d.claims.map((c) => '\u201c' + c + '\u201d').join('; ') : 'The AI marks each abstract claim, and you back every one with a concrete example.',
      set: {
        ask: () => 'List the abstract claims in this draft: statements that assert something without a concrete example, number or story behind them. Quote each one exactly, a short phrase or sentence. Up to 5.',
        schema: 'words', key: 'claims', mock: () => ({ words: ['Good design matters'] })
      },
      judge: (d) => 'The writer had to back every abstract claim with a concrete example, number or story. Is every claim in the draft now backed by something concrete?',
      check(text, ctx) { return [judged(ctx, 'E10', 'Every claim has an example')]; }
    },
    {
      id: 'E11', cat: 'E', name: 'The story', ai: 'judge', size: () => [40, 1e9],
      desc: () => 'Include one personal story from your own life that carries the point.',
      judge: () => 'The writer had to include one personal story from their own life (a specific moment, with a place, a time or a person) that carries the point. Is there one, and does it carry the point?',
      check(text, ctx) { return [enough(40, countWords(text)), judged(ctx, 'E11', 'A personal story carries the point')]; }
    },
    {
      id: 'E12', cat: 'E', name: 'Contrarian title', ai: 'set+judge', size: () => [40, 1e9],
      desc: (p, d) => d && d.title ? 'Title: \u201c' + d.title + '\u201d. Write the piece that earns it.' : 'The AI suggests a counterintuitive angle on your topic, and you write the piece that earns it.',
      set: {
        ask: () => 'Suggest one counterintuitive, contrarian angle on this topic as a short title (under 10 words) that a writer would have to argue for. Return it as "line".',
        schema: 'line', key: 'title', mock: () => ({ line: 'Why the Best Teams Ship Less' })
      },
      judge: (d) => 'The writer had to write a piece that earns this contrarian title: "' + d.title + '". Does the draft make a convincing case for it?',
      check(text, ctx) { return [enough(40, countWords(text)), judged(ctx, 'E12', 'It earns the title')]; }
    },
    {
      id: 'E13', cat: 'E', name: 'Genre swap', ai: 'judge', size: () => [40, 1e9],
      desc: (p, d) => 'Write it as ' + ((d && d.genre) || 'another genre') + '.',
      start(text, ctx, p, rand) { return { genre: pick(GENRES, rand) }; },
      judge: (d) => 'The writer had to write their piece in the form of ' + d.genre + '. Does it clearly read as ' + d.genre + ' while still making their point?',
      check(text, ctx) { return [enough(40, countWords(text)), judged(ctx, 'E13', 'It reads as ' + ((ctx.data && ctx.data.genre) || 'that genre'))]; }
    },
    {
      id: 'E14', cat: 'E', name: 'Five hooks', ai: 'judge', hooks: true, size: () => [5, 1e9],
      params: { easy: { n: 3 }, medium: { n: 5 }, hard: { n: 7 } },
      desc: (p) => 'Write ' + p.n + ' openings as alternatives on your first line. The AI picks the strongest, blind.',
      judge: () => 'Here are several candidate opening lines for the same piece, in random order. Pick the strongest hook: the one that makes a busy reader keep reading. Say why in one sentence.',
      check(text, ctx, p) {
        const n = (ctx.hooks || 0);
        return [rule(p.n + ' openings written', n >= p.n, n + ' so far'), judged(ctx, 'E14', 'The AI picked one')];
      }
    },
    {
      id: 'E15', cat: 'E', name: 'Letter to one person', ai: 'set+judge', size: () => [40, 1e9],
      desc: (p, d) => d && d.reader ? 'Write only to ' + d.reader + '.' : 'The AI suggests a specific reader for this topic. Write only to them.',
      set: {
        ask: () => 'Suggest one specific reader this piece should be written to: a vivid, particular person described in under 10 words (like "a nervous first-time founder"). Return it as "line".',
        schema: 'line', key: 'reader', mock: () => ({ line: 'a nervous first-time founder' })
      },
      judge: (d) => 'The writer had to write only to this one reader: ' + d.reader + '. Does it read as written to that person, in what it explains and how?',
      check(text, ctx) { return [enough(40, countWords(text)), judged(ctx, 'E15', 'Written to that one person')]; }
    }
  ];

  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const BY_ID = new Map(LIST.map((c) => [c.id, c]));
  const get = (id) => BY_ID.get(id) || null;
  const paramsOf = (c, level) => (c.params ? c.params[LEVELS.includes(level) ? level : 'medium'] : {});

  function money(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }
  function uniq(a) { return [...new Set(a)]; }
  const squash = (s) => String(s || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N}']+/gu, ' ').trim();
  const isHeading = (text) => { const l = String(text || '').split('\n').find((x) => x.trim()); return !!l && /^#{1,3} /.test(l); };
  // The first paragraph that isn't a heading (a title doesn't count as the opening).
  function openingParagraph(text) {
    for (const l of String(text || '').split('\n')) {
      if (!l.trim()) continue;
      const b = Inline.block(l);
      if (b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || b.type === 'hr' || b.type === 'opaque') continue;
      const p = Inline.plain(l).trim();
      if (p) return p;
    }
    return '';
  }

  /* ---------- Randomness: seeded, so the daily challenge is the same everywhere ---------- */

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(seed) {
    let a = typeof seed === 'number' ? seed >>> 0 : hash(String(seed));
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (list, rand) => list[Math.floor((rand || Math.random)() * list.length) % list.length];
  function pickN(list, n, rand) {
    const a = list.slice();
    const r = rand || Math.random;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  }

  /* ---------- Combos (F1) ---------- */

  // Pairs that fight each other, beyond the word-count ranges and groups.
  const CLASHES = [['C11', 'C1'], ['C11', 'C2'], ['C11', 'E8'], ['B1', 'B3'], ['C7', 'C8'], ['B5', 'B4'], ['B5', 'B6'], ['B5', 'C9'],
    ['B6', 'B8'], ['E14', 'B8'], ['E14', 'B6'], ['E5', 'B7']];
  const clash = (a, b) => CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

  function compatible(ids, ctx, level) {
    const cs = ids.map(get);
    if (cs.some((c) => !c)) return false;
    if (new Set(ids).size !== ids.length) return false;
    const groups = cs.map((c) => c.group).filter(Boolean);
    if (new Set(groups).size !== groups.length) return false;
    if (cs.filter((c) => c.ai).length > 1) return false;
    if (cs.filter((c) => c.timed).length > 1) return false;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (clash(ids[i], ids[j])) return false;
    let lo = 0, hi = Infinity;
    for (const c of cs) {
      const [a, b] = c.size ? c.size(ctx || {}, paramsOf(c, level)) : [0, Infinity];
      lo = Math.max(lo, a); hi = Math.min(hi, b);
    }
    return lo <= hi;
  }

  // opts: { n: 2 or 3, ai: allow AI challenges, rand, ctx, level }
  function combo(opts) {
    const o = opts || {};
    const rand = o.rand || Math.random;
    const n = o.n || (rand() < 0.5 ? 2 : 3);
    const pool = LIST.filter((c) => o.ai !== false || !c.ai).map((c) => c.id);
    for (let tries = 0; tries < 60; tries++) {
      const order = pickN(pool, pool.length, rand);
      const out = [];
      for (const id of order) {
        if (compatible(out.concat(id), o.ctx, o.level)) out.push(id);
        if (out.length === n) return out;
      }
    }
    return pickN(pool, 1, rand);
  }

  function roll(opts) {
    const o = opts || {};
    const pool = LIST.filter((c) => o.ai !== false || !c.ai);
    return pick(pool, o.rand).id;
  }

  /* ---------- Daily (D4) ---------- */

  // The same challenge for everyone on a given day: local ones only (no key needed), and none
  // that changes the budget or needs a clock running.
  const DAILY_POOL = LIST.filter((c) => !c.ai && !c.setsBudget && !c.timed && c.id !== 'A1').map((c) => c.id);
  function daily(iso) {
    const rand = seeded('tdw-daily-' + iso);
    return { id: DAILY_POOL[Math.floor(rand() * DAILY_POOL.length)], level: 'medium', seed: hash('tdw-daily-' + iso) };
  }

  /* ---------- Streak (F3) ---------- */

  const dayIso = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function prevDay(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return dayIso(new Date(y, m - 1, d - 1).getTime());
  }
  // A challenge met on `iso`: the streak grows once a day, and starts over after a missed day.
  function recordStreak(s, iso) {
    const cur = s && typeof s === 'object' ? s : { last: '', count: 0, best: 0 };
    if (cur.last === iso) return cur;
    const count = cur.last && cur.last === prevDay(iso) ? (cur.count || 0) + 1 : 1;
    return { last: iso, count, best: Math.max(cur.best || 0, count) };
  }
  // What the streak reads today: it's still alive if the last one was today or yesterday.
  function streakNow(s, iso) {
    if (!s || !s.last) return 0;
    return s.last === iso || s.last === prevDay(iso) ? s.count || 0 : 0;
  }

  /* ---------- Running one ---------- */

  // A running challenge as saved on the draft: { items: [{ id, level, data }], startedAt, … }.
  // ctx: { budget, elapsedMs, judge: { id: { ok, why } }, hooks }. Returns each item with its
  // rules, and whether everything passes.
  function evaluate(ch, text, ctx) {
    const out = [];
    let all = true;
    for (const it of (ch && ch.items) || []) {
      const c = get(it.id);
      if (!c) continue;
      const p = paramsOf(c, it.level);
      const rules = c.check(String(text || ''), Object.assign({}, ctx, { data: it.data || {}, judge: (ch.judge || (ctx && ctx.judge) || {}) }), p);
      const ok = rules.length > 0 && rules.every((r) => r.ok);
      if (!ok) all = false;
      out.push({ id: c.id, name: nameOf(c, it), desc: c.desc(p, it.data || {}, ctx), rules, ok });
    }
    return { items: out, ok: all && out.length > 0 };
  }

  const nameOf = (c, it) => (c.name2 ? c.name2(paramsOf(c, it.level), it.data || {}) : c.name);

  // A new item: what it needs saved at the start (rolled letter, words, starting count…).
  function startItem(id, level, text, ctx, rand) {
    const c = get(id);
    if (!c) return null;
    const lv = c.params ? (LEVELS.includes(level) ? level : 'medium') : null;
    const data = c.start ? c.start(String(text || ''), ctx || {}, paramsOf(c, lv), rand || Math.random) : {};
    return { id, level: lv, data: data || {} };
  }

  /* ---------- AI prompts ---------- */

  const SCHEMAS = {
    words: { type: 'OBJECT', properties: { words: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['words'] },
    line: { type: 'OBJECT', properties: { line: { type: 'STRING' } }, required: ['line'] },
    judge: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' }, why: { type: 'STRING' } }, required: ['ok', 'why'] },
    pick: { type: 'OBJECT', properties: { pick: { type: 'INTEGER' }, why: { type: 'STRING' } }, required: ['pick', 'why'] },
    question: { type: 'OBJECT', properties: { question: { type: 'STRING' } }, required: ['question'] }
  };
  const fence = (label, t) => label + ':\n<<<\n' + t + '\n>>>';

  // What the AI is asked to set a challenge up: { prompt, schema, mock, key, kind }.
  function setRequest(id, topic, text) {
    const c = get(id);
    if (!c || !c.set) return null;
    const ctxText = String(text || '').trim();
    const prompt = [
      c.set.ask(topic),
      topic ? fence('WHAT THE PIECE IS ABOUT', topic) : '',
      ctxText ? fence('THE DRAFT SO FAR', ctxText.slice(0, 12000)) : ''
    ].filter(Boolean).join('\n\n');
    return { prompt, schema: SCHEMAS[c.set.schema], mock: c.set.mock, key: c.set.key || (c.set.schema === 'words' ? 'words' : 'line'), kind: c.set.schema };
  }

  // Turn the AI's answer into the item's data.
  function setData(id, raw) {
    const c = get(id);
    if (!c || !c.set) return {};
    const key = c.set.key || (c.set.schema === 'words' ? 'words' : 'line');
    if (c.set.schema === 'words') {
      const list = (raw && Array.isArray(raw.words) ? raw.words : []).map((w) => String(w || '').trim()).filter(Boolean);
      return { [key]: uniq(list).slice(0, 8) };
    }
    const line = String((raw && raw.line) || '').trim().replace(/^["\u201c]|["\u201d]$/g, '');
    return { [key]: line };
  }

  function judgeRequest(id, data, text, extra) {
    const c = get(id);
    if (!c || !c.judge) return null;
    if (c.hooks) {
      const opts = (extra && extra.options) || [];
      return {
        prompt: [c.judge(data || {}), fence('OPENINGS', opts.map((o, k) => (k + 1) + '. ' + o).join('\n')), 'Return "pick" as the number of the strongest one, and "why".'].join('\n\n'),
        schema: SCHEMAS.pick, mock: () => ({ pick: 1, why: 'It opens on a concrete moment instead of a claim.' })
      };
    }
    let prompt = [c.judge(data || {}), fence('DRAFT', String(text || '').slice(0, 15000)),
      'Be a fair but honest judge. Return "ok" (true only if they really did it) and "why" in one short sentence addressed to the writer.'].join('\n\n');
    if (id === 'C11') prompt = ['The writer had to use the word "' + data.word + '" (' + data.meaning + ') naturally, so it earns its place instead of showing off. Does it fit naturally where it is used?',
      fence('DRAFT', String(text || '').slice(0, 15000)), 'Return "ok" and "why" in one short sentence addressed to the writer.'].join('\n\n');
    return { prompt, schema: SCHEMAS.judge, mock: () => ({ ok: true, why: 'Nicely done: it does what the challenge asked.' }) };
  }

  function skepticRequest(paragraph, text) {
    return {
      prompt: ['You are a smart, skeptical reader. Read the latest paragraph of this draft and ask the one sharp question it leaves unanswered, in under 20 words. Return it as "question".',
        fence('THE DRAFT SO FAR', String(text || '').slice(0, 12000)), fence('THE LATEST PARAGRAPH', paragraph)].join('\n\n'),
      schema: SCHEMAS.question, mock: () => ({ question: 'But how do you know that works for anyone besides you?' })
    };
  }

  return {
    LEVELS, LEVEL_NAMES, CATEGORIES, LIST, CLASHES, DAILY_POOL, DROP_WORDS, RARE_WORDS, FIELDS, GENRES,
    get, paramsOf, nameOf, evaluate, startItem, compatible, combo, roll, daily, recordStreak, streakNow, dayIso, prevDay,
    seeded, hash, setRequest, setData, judgeRequest, skepticRequest,
    // helpers, for tests
    paragraphs, sentences, firstWord, firstLetter, syllables, uses, adverbs, toBe, openingParagraph
  };
});
