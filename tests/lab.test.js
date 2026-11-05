// The Lab's core: quotes placed only where they're unique, and cuts that leave clean text.
//   node --test tests/lab.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../app/js/lab.js');
const Marks = require('../app/js/marks.js');
const Engine = require('../app/js/engine.js');
const Inline = require('../app/js/inline.js');
const deps = { Marks, Engine, Inline };

test('place: unique quotes only, outside ghosts, never overlapping', () => {
  const t = 'I think it works. It really works. It works.';
  const out = L.place(t, [{ quote: 'I think' }, { quote: 'works' }, { quote: 'really' }, { quote: 'missing' }, { quote: 'It really works.' }], [], []);
  assert.deepEqual(out.map((m) => t.slice(m.start, m.end)), ['I think', 'really']);
  const ghosted = L.place(t, [{ quote: 'really' }], [{ start: 0, end: 30 }], []);
  assert.equal(ghosted.length, 0);
  const two = 'just one. just two.';
  assert.equal(L.place(two, [{ quote: 'just two' }], [{ start: 0, end: 9 }], []).length, 1);
});

test('applyCuts: one neighboring space goes, sentences stay capitalized, empty lines go', () => {
  const t = 'It really works. Filler sentence here. The end.\nA whole line to cut.\nLast line.';
  const cuts = ['really', 'Filler sentence here.', 'A whole line to cut.'].map((q) => ({ start: t.indexOf(q), end: t.indexOf(q) + q.length }));
  const out = L.applyCuts(t, Marks.EMPTY, cuts, deps);
  assert.equal(out.text, 'It works. The end.\nLast line.');
  const cap = 'So basically we ship it.';
  const r = L.applyCuts(cap, Marks.EMPTY, [{ start: 0, end: 2 }], deps);
  assert.equal(r.text, 'Basically we ship it.');
});

test('applyCuts: alternatives between cuts survive', () => {
  const t = 'Very much the tension is real and also quite true.';
  const s = t.indexOf('tension');
  const ann = { alts: [{ id: 'a', kind: 'word', start: s, end: s + 7, active: 0, options: [{ text: 'tension', by: 'me' }, { text: 'pressure', by: 'me' }] }], ghosts: [] };
  const cuts = [{ start: 0, end: 9 }, { start: t.indexOf('quite'), end: t.indexOf('quite') + 5 }];
  const out = L.applyCuts(t, ann, cuts, deps);
  assert.equal(out.text, 'The tension is real and also true.');
  const a = out.ann.alts[0];
  assert.equal(out.text.slice(a.start, a.end), 'tension');
});
