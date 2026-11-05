// Writing challenges: every local rule, combos, the daily pick, streaks and difficulty.
//   node --test tests/challenges.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/js/challenges.js');

// Run one challenge on text: { ok, rules }.
function run(id, text, o) {
  const opts = o || {};
  const item = { id, level: opts.level || 'medium', data: opts.data || {} };
  const r = C.evaluate({ items: [item], judge: opts.judge }, text, Object.assign({ budget: 500, elapsedMs: 0 }, opts.ctx));
  return r.items[0];
}
const ok = (id, text, o) => run(id, text, o).ok;
const words = (n, w) => Array.from({ length: n }, () => w || 'cat').join(' ');

test('every approved challenge is in the catalog, and A7 is not', () => {
  const want = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8',
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'D1', 'D2', 'D3',
    'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', 'E13', 'E14', 'E15'];
  assert.deepEqual(C.LIST.map((c) => c.id).sort(), want.sort());
  assert.equal(C.get('A7'), null);
  for (const c of C.LIST) {
    assert.ok(c.name && typeof c.desc === 'function' && typeof c.check === 'function', c.id);
    for (const lv of C.LEVELS) {
      const it = C.startItem(c.id, lv, 'Some text here to start with. It has words.', { budget: 500 }, C.seeded(1));
      const r = C.evaluate({ items: [it] }, '', { budget: 500 });
      assert.ok(r.items[0].rules.length > 0, c.id + ' has rules');
      assert.equal(typeof r.items[0].desc, 'string');
    }
  }
});

test('A: exact lengths, tweet size, half price, inflation', () => {
  assert.ok(ok('A1', words(50), { ctx: { budget: 500 } }));
  assert.ok(!ok('A1', words(49), { ctx: { budget: 500 } }));
  assert.ok(ok('A2', 'For sale: baby shoes, never worn.'));
  assert.ok(!ok('A2', 'For sale: baby shoes, never worn, ever.'));
  assert.ok(ok('A3', words(100)));
  assert.ok(!ok('A3', words(101)));
  assert.ok(ok('A4', 'Short and sweet, under the limit.'));
  assert.ok(!ok('A4', 'x'.repeat(201) + ' a b'), 'medium is 200');
  assert.ok(ok('A4', 'a b c ' + 'x'.repeat(200), { level: 'easy' }), 'easy is 280');
  assert.equal(C.paramsOf(C.get('A4'), 'hard').max, 140);
  assert.ok(!ok('A4', 'Hi.'), 'three words at least');
  // Markdown markers don't count as characters.
  assert.ok(ok('A4', '**' + 'a'.repeat(190) + '** b c', { level: 'medium' }));
  const half = C.startItem('A5', null, words(40), {});
  assert.equal(half.data.target, 20);
  assert.ok(ok('A5', words(20), { data: half.data }));
  assert.ok(!ok('A5', words(21), { data: half.data }));
  const inf = C.get('A6');
  assert.equal(inf.budgetAt({ startBudget: 1000 }, 0), 1000);
  assert.equal(inf.budgetAt({ startBudget: 1000 }, 59999), 1000);
  assert.equal(inf.budgetAt({ startBudget: 1000 }, 180000), 970);
  assert.equal(inf.budgetAt({ startBudget: 30 }, 600000), 10, 'never below $10');
  assert.ok(ok('A6', words(50), { ctx: { budget: 500 } }));
  assert.ok(!ok('A6', words(51), { ctx: { budget: 500 } }), 'over the budget');
  assert.ok(!ok('A6', words(30), { ctx: { budget: 500 } }), 'too short for medium');
});

test('B1 short fuse and B8 hook use sentence word counts', () => {
  assert.ok(ok('B1', 'One two three. Four five six. Seven eight nine ten eleven twelve.'));
  assert.ok(!ok('B1', 'One two three. Four five six. ' + words(13) + '.'));
  assert.ok(ok('B1', 'Short. Shorter. Tiny.', { level: 'hard' }));
  assert.ok(ok('B8', 'Hook me fast. Then the long sentence can roll on and on and on as long as it likes.'));
  assert.ok(!ok('B8', 'This opening sentence has way more than eight words in it. Ok.'));
  assert.ok(ok('B8', '# A long title that has many many many words in it\nShort hook here.'), 'the title is not the hook');
});

test('B2 music: consecutive lengths must differ', () => {
  assert.ok(ok('B2', 'One. Two three four five. Six. Seven eight nine ten eleven twelve.'));
  assert.ok(!ok('B2', 'One two. Three four. Five six seven eight nine. Ten.'), '2 and 2 too close');
  assert.ok(!ok('B2', 'One. Two three four five.'), 'needs 4 sentences');
});

test('B3 five-word rule wants one, short and long', () => {
  const long = 'This sentence goes on ' + words(25, 'and') + ' until it ends.';
  assert.ok(ok('B3', 'Stop. Then go again. ' + long));
  assert.ok(!ok('B3', 'Then go again. ' + long), 'no one-word sentence');
  assert.ok(!ok('B3', 'Stop. Then go again. A medium sentence of a dozen or so words sits right here now.'));
});

test('B4 fresh starts: first words compared past quotes and case', () => {
  assert.ok(ok('B4', 'The cat sat. A dog ran. "Why?" she asked. Nobody knew. Then rain came. Everyone left.'));
  assert.ok(!ok('B4', 'The cat sat. A dog ran. "the end," she said. Nobody knew. Then rain came. Everyone left.'));
  assert.equal(C.firstWord('"Don’t," he said.'), 'Don’t');
});

test('B5 alphabet skips quotes and brackets', () => {
  assert.ok(ok('B5', 'Apples fall. "Bees buzz." (Cats nap.) Dogs dig. Eels swim.', { level: 'easy' }));
  assert.ok(!ok('B5', 'Apples fall. Cats nap. Bees buzz. Dogs dig. Eels swim.', { level: 'easy' }));
  assert.match(run('B5', 'Apples fall. Bees buzz.', { level: 'easy' }).rules[0].detail, /next starts with C/);
  assert.equal(C.paramsOf(C.get('B5'), 'hard').n, 26);
});

test('B6 questions first, B7 paragraph lengths', () => {
  assert.ok(ok('B6', '# Title\nWhy now? Why us? What changed?\nBecause the world did.'));
  assert.ok(!ok('B6', 'Why now? Because. What changed?\nThe world did.'));
  assert.ok(!ok('B6', 'Why now? Why us? What changed?'), 'needs something after');
  assert.ok(ok('B7', 'One. Two.\nThree.\nFour. Five.'));
  assert.ok(!ok('B7', 'One. Two. Three.\nFour.\nFive.'));
  assert.ok(ok('B7', 'One. Two. Three.\nFour.\nFive.', { level: 'easy' }));
});

const LONG_SIMPLE = 'The cat sat on the mat. The dog ran to the park. We had fun in the sun. It was a good day for all of us. Then we went home and ate some bread. ';

test('C1 grade and C2 plain English use the engine', () => {
  assert.ok(ok('C1', LONG_SIMPLE + LONG_SIMPLE));
  assert.ok(!ok('C1', 'Short.'), 'needs 30 words');
  const hard = 'Notwithstanding the aforementioned considerations, organizational stakeholders must systematically operationalize comprehensive methodologies facilitating interdepartmental collaboration and accountability frameworks across multinational subsidiaries. '.repeat(2);
  assert.ok(!ok('C1', hard));
  assert.ok(ok('C2', LONG_SIMPLE + LONG_SIMPLE));
  assert.ok(!ok('C2', hard));
});

test('C3 no adverbs, C4 weasels, C5 passive', () => {
  assert.ok(ok('C3', LONG_SIMPLE + LONG_SIMPLE + ' It was a lovely family day.'), 'lovely and family are not adverbs');
  assert.ok(!ok('C3', LONG_SIMPLE + LONG_SIMPLE + ' We quickly left.'));
  assert.ok(!ok('C4', LONG_SIMPLE + LONG_SIMPLE + ' It was really fun.'));
  assert.ok(ok('C4', LONG_SIMPLE + LONG_SIMPLE + ' That was fun.'), '"that" counts only on hard');
  assert.ok(!ok('C4', LONG_SIMPLE + LONG_SIMPLE + ' That was fun.', { level: 'hard' }));
  assert.ok(!ok('C4', LONG_SIMPLE + LONG_SIMPLE + ' It was kind of fun.', { level: 'hard' }));
  assert.ok(ok('C4', LONG_SIMPLE + LONG_SIMPLE + ' He was justified.'), 'whole words only');
  assert.ok(ok('C5', LONG_SIMPLE + LONG_SIMPLE));
  assert.ok(!ok('C5', LONG_SIMPLE + LONG_SIMPLE + ' The bread was eaten by the dog.'));
});

test('C6 E-Prime catches contractions, not possessives', () => {
  const base = 'Dogs run. Cats nap all day long in the warm sun. We eat bread and drink tea. The park opens at nine. Birds sing loud songs in tall trees near our home today. ';
  assert.ok(ok('C6', base + 'John’s hat fell.'), 'possessive is fine');
  assert.ok(!ok('C6', base + 'It’s late.'));
  assert.ok(!ok('C6', base + 'They’re here.'));
  assert.ok(!ok('C6', base + 'I am here.'));
  assert.ok(!ok('C6', base + 'That isn’t it.'));
  assert.ok(!ok('C6', base.replace('Dogs run.', 'Dogs are fast.')));
});

test('C7 one syllable and the syllable counter', () => {
  for (const [w, n] of [['cat', 1], ['time', 1], ['people', 2], ['the', 1], ['walked', 1], ['wanted', 2], ['strengths', 1], ['don’t', 1]]) {
    assert.equal(C.syllables(w), n, w);
  }
  assert.ok(C.syllables('beautiful') > 1);
  assert.ok(ok('C7', 'I went to the store and got some bread and milk and eggs for the kids at home this week in the rain.', { level: 'easy' }));
  assert.ok(!ok('C7', 'I went to the store and bought some bread and milk and eggs for the children at home this week.', { level: 'easy' }));
});

test('C8 lipogram ignores markdown markers and link targets', () => {
  const noE = 'A cat sat on a mat. A dog ran past. It was fun for all of us at this park, and many kids saw it too, as did a man with a hat and a big dog that ran far. All of us sat and had a long chat about it until dusk.';
  assert.ok(ok('C8', noE, { level: 'hard', data: { letter: 'e' } }));
  assert.ok(ok('C8', '**' + noE + '**', { level: 'hard', data: { letter: 'e' } }), 'bold markers are not letters');
  assert.ok(ok('C8', '- ' + noE + ' [link](https://example.com/here)', { level: 'hard', data: { letter: 'e' } }), 'the URL is not text');
  assert.ok(!ok('C8', noE + ' The end.', { level: 'hard', data: { letter: 'e' } }));
  const it = C.startItem('C8', 'hard', '', {}, C.seeded(7));
  assert.ok(['e', 'a', 't', 'o'].includes(it.data.letter));
  assert.ok(['z', 'q', 'j', 'x'].includes(C.startItem('C8', 'easy', '', {}, C.seeded(7)).data.letter));
});

test('C9 no I; C10 word drop with inflections; C11 needs the word and a judge', () => {
  assert.ok(ok('C9', 'We left. In time, I knew. It rained. Ice formed.'), '"In" and "Ice" are fine, "I" mid-sentence is fine');
  assert.ok(!ok('C9', 'We left. I knew. It rained. Then more.'));
  assert.ok(!ok('C9', 'We left. "I’m done," he said. It rained. Then more.'));
  assert.ok(ok('C10', 'The ladders leaned. We drank coffee by the river.', { data: { words: ['ladder', 'coffee', 'river'] } }));
  assert.ok(!ok('C10', 'We drank coffee by the riverbank.', { data: { words: ['coffee', 'river'] } }), 'riverbank is not river');
  assert.equal(new Set(C.startItem('C10', 'hard', '', {}, C.seeded(3)).data.words).size, 3);
  const d = { word: 'sonder', meaning: 'x' };
  assert.ok(!ok('C11', 'A moment of sonder hit me.', { data: d }), 'still needs the judge');
  assert.ok(ok('C11', 'A moment of sonder hit me.', { data: d, judge: { C11: { ok: true, why: 'Fits' } } }));
  assert.ok(!ok('C11', 'Nothing rare here.', { data: d, judge: { C11: { ok: true } } }));
});

test('D: timers and starting counts', () => {
  const s = C.startItem('D1', 'medium', words(10), {});
  assert.equal(s.data.startWords, 10);
  assert.ok(ok('D1', words(160), { data: s.data, ctx: { elapsedMs: 60000 } }));
  assert.ok(!ok('D1', words(160), { data: s.data, ctx: { elapsedMs: 300001 } }), 'too late');
  assert.ok(!ok('D1', words(100), { data: s.data, ctx: { elapsedMs: 60000 } }));
  assert.ok(!ok('D2', words(200), { data: { startWords: 0 }, ctx: { elapsedMs: 60000 } }), 'the clock must run out');
  assert.ok(ok('D2', words(200), { data: { startWords: 0 }, ctx: { elapsedMs: 600000 } }));
  assert.equal(C.get('D3').pauseMs(C.paramsOf(C.get('D3'), 'hard')), 3000);
  assert.ok(ok('D3', words(30), { data: { startWords: 0 }, ctx: { elapsedMs: 300000 } }));
});

test('E: AI-set data is checked locally', () => {
  assert.ok(ok('E1', LONG_SIMPLE + LONG_SIMPLE, { data: { words: ['synergy', 'leverage'] } }));
  assert.ok(!ok('E1', LONG_SIMPLE + LONG_SIMPLE + ' Leverage it.', { data: { words: ['synergy', 'leverage'] } }));
  assert.ok(ok('E2', 'Plain words now.', { data: { words: ['synergy'] } }));
  assert.ok(ok('E3', 'A lighthouse, some marmalade, a compass.', { data: { words: ['lighthouse', 'marmalade', 'compass'] } }));
  const line = 'And that is why the small things never stay small.';
  assert.ok(ok('E5', LONG_SIMPLE + LONG_SIMPLE + '\nAnd that’s why… no. ' + line.replace('.', '!'), { data: { line } }), 'punctuation and case are forgiven');
  assert.ok(!ok('E5', LONG_SIMPLE + LONG_SIMPLE + '\n' + line + ' Then more.', { data: { line } }));
  const qs = [{ q: 'Why?', after: 1 }, { q: 'How?', after: 2 }];
  assert.ok(!ok('E9', 'One.\nTwo.', { data: { questions: qs } }));
  assert.ok(ok('E9', 'One.\nTwo.\nThree.\nFour.', { level: 'easy', data: { questions: qs } }));
  assert.ok(!ok('E14', 'Hook.', { ctx: { hooks: 4 } }));
  assert.ok(ok('E14', 'Hook.', { ctx: { hooks: 5 }, judge: { E14: { ok: true, why: 'x' } } }));
  assert.ok(!ok('E8', LONG_SIMPLE + LONG_SIMPLE), 'needs the judge too');
  assert.ok(ok('E8', LONG_SIMPLE + LONG_SIMPLE, { judge: { E8: { ok: true } } }));
});

test('AI requests: prompts, schemas and mocks for every AI challenge', () => {
  for (const c of C.LIST.filter((x) => x.ai)) {
    if (c.ai.includes('set')) {
      const r = C.setRequest(c.id, 'A post about shipping small', 'Draft text.');
      assert.ok(r && r.prompt.includes('shipping small') && r.schema && typeof r.mock === 'function', c.id);
      const data = C.setData(c.id, r.mock());
      assert.ok(Object.keys(data).length === 1, c.id);
    }
    if (c.ai.includes('judge')) {
      const it = C.startItem(c.id, 'medium', '', {}, C.seeded(2));
      const r = C.judgeRequest(c.id, Object.assign({ word: 'sonder', meaning: 'm', moment: 'x', counter: 'y', title: 't', reader: 'r' }, it.data), 'Draft.', { options: ['a', 'b'] });
      assert.ok(r && r.prompt && r.schema && typeof r.mock === 'function', c.id);
    }
  }
  assert.deepEqual(C.setData('E1', { words: [' Very ', 'very', '', 'thing'] }), { words: ['Very', 'very', 'thing'] });
  assert.deepEqual(C.setData('E5', { line: '“The end.”' }), { line: 'The end.' });
  assert.ok(C.skepticRequest('Para.', 'Draft.').prompt.includes('Para.'));
});

test('F1 combos never pair clashing challenges', () => {
  assert.ok(!C.compatible(['A2', 'A3']), 'two lengths');
  assert.ok(!C.compatible(['A2', 'C1']), 'six words can’t carry 30');
  assert.ok(!C.compatible(['C11', 'C1']), 'rare word vs grade 5');
  assert.ok(!C.compatible(['D1', 'D3']), 'one clock at a time');
  assert.ok(!C.compatible(['E1', 'E3']), 'one AI challenge at a time');
  assert.ok(!C.compatible(['B1', 'B3']), 'short fuse vs a long sentence');
  assert.ok(!C.compatible(['A2', 'C7']), 'six words vs a 30-word paragraph');
  assert.ok(C.compatible(['B1', 'C3']));
  assert.ok(C.compatible(['C3', 'C5', 'B4']));
  for (let s = 0; s < 300; s++) {
    const rand = C.seeded(s);
    const ids = C.combo({ rand, ctx: { budget: 2000 } });
    assert.ok(ids.length >= 2 && ids.length <= 3, 'size ' + ids.join(','));
    assert.ok(C.compatible(ids, { budget: 2000 }), ids.join(','));
  }
  for (let s = 0; s < 50; s++) assert.ok(C.combo({ rand: C.seeded(s), ai: false }).every((id) => !C.get(id).ai));
});

test('D4 daily is the same all day and changes across days', () => {
  const a = C.daily('2026-11-05'), b = C.daily('2026-11-05');
  assert.deepEqual(a, b);
  assert.ok(C.DAILY_POOL.includes(a.id));
  const ids = new Set();
  for (let d = 1; d <= 28; d++) ids.add(C.daily('2026-02-' + String(d).padStart(2, '0')).id);
  assert.ok(ids.size > 5, 'varies');
  for (const id of C.DAILY_POOL) assert.ok(!C.get(id).ai && !C.get(id).timed && !C.get(id).setsBudget);
});

test('F3 streak counts days in a row', () => {
  let s = C.recordStreak(null, '2026-11-01');
  assert.equal(s.count, 1);
  s = C.recordStreak(s, '2026-11-01');
  assert.equal(s.count, 1, 'once a day');
  s = C.recordStreak(s, '2026-11-02');
  s = C.recordStreak(s, '2026-11-03');
  assert.equal(s.count, 3);
  assert.equal(C.streakNow(s, '2026-11-04'), 3, 'still alive the next day');
  assert.equal(C.streakNow(s, '2026-11-05'), 0);
  s = C.recordStreak(s, '2026-11-05');
  assert.equal(s.count, 1);
  assert.equal(s.best, 3);
  assert.equal(C.prevDay('2026-03-01'), '2026-02-28');
  assert.equal(C.prevDay('2026-01-01'), '2025-12-31');
});

test('F2 difficulty tunes the numbers', () => {
  const p = (id, lv) => C.paramsOf(C.get(id), lv);
  assert.deepEqual([p('B1', 'easy').max, p('B1', 'medium').max, p('B1', 'hard').max], [15, 12, 8]);
  assert.deepEqual([p('D1', 'easy').words, p('D1', 'medium').words, p('D1', 'hard').words], [100, 150, 250]);
  assert.equal(p('B1', 'nonsense').max, 12, 'unknown levels are medium');
  assert.equal(C.startItem('A2', 'hard', '', {}).level, null, 'challenges without levels have none');
});
