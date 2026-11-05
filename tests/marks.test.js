// Alternatives and ghosts follow edits, survive remote changes, and swap with a/an.
//   node --test tests/marks.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/js/marks.js');

const TEXT = 'Much of the tension in product development comes from trying.';
const at = (t, w) => ({ start: t.indexOf(w), end: t.indexOf(w) + w.length });

function wordAlt(t, w, extra) {
  const r = at(t, w);
  return { id: 'a1', kind: 'word', start: r.start, end: r.end, active: 0, options: [{ text: w, by: 'me' }].concat((extra || []).map((x) => ({ text: x, by: 'me' }))) };
}
const shown = (t, a) => t.slice(a.start, a.end);

test('shiftRange: edits before, after, inside and over a range', () => {
  const r = { start: 10, end: 15 };
  assert.deepEqual(M.shiftRange(r, 0, 0, 'abc', 'fixed'), { start: 13, end: 18 });
  assert.deepEqual(M.shiftRange(r, 20, 22, '', 'fixed'), r);
  assert.deepEqual(M.shiftRange(r, 12, 13, 'XYZ', 'fixed'), { start: 10, end: 17 });
  assert.equal(M.shiftRange(r, 8, 16, '', 'fixed'), null);
  assert.equal(M.shiftRange(r, 10, 15, '', 'word'), null);
  assert.deepEqual(M.shiftRange(r, 8, 12, '', 'fixed'), { start: 8, end: 11 });
  assert.deepEqual(M.shiftRange(r, 13, 18, 'q', 'fixed'), { start: 10, end: 13 });
});

test('shiftRange: typing at the edges', () => {
  const r = { start: 10, end: 15 };
  assert.deepEqual(M.shiftRange(r, 15, 15, 's', 'word'), { start: 10, end: 16 }, 'a word keeps growing');
  assert.deepEqual(M.shiftRange(r, 15, 15, ' ', 'word'), r, 'a space ends it');
  assert.deepEqual(M.shiftRange(r, 15, 15, ',', 'word'), r, 'punctuation ends it');
  assert.deepEqual(M.shiftRange(r, 15, 15, 's', 'fixed'), r, 'ghosts never grow');
  assert.deepEqual(M.shiftRange(r, 10, 10, 'x', 'word'), { start: 11, end: 16 });
  assert.deepEqual(M.shiftRange(r, 10, 10, 'x', 'paragraph'), { start: 10, end: 16 });
  assert.deepEqual(M.shiftRange(r, 15, 15, ' more', 'paragraph'), { start: 10, end: 20 });
  assert.deepEqual(M.shiftRange(r, 15, 15, '\n', 'paragraph'), r);
});

test('applyChange: typing inside an alternative rewrites the option on the page', () => {
  const ann = { alts: [wordAlt(TEXT, 'tension', ['pressure'])], ghosts: [] };
  const t2 = TEXT.replace('tension', 'tensions');
  const a2 = M.applyChange(ann, TEXT, t2).alts[0];
  assert.equal(shown(t2, a2), 'tensions');
  assert.equal(a2.options[0].text, 'tensions');
  assert.equal(a2.options[1].text, 'pressure');
  const t3 = 'Oh. ' + TEXT;
  const a3 = M.applyChange(ann, TEXT, t3).alts[0];
  assert.equal(shown(t3, a3), 'tension');
});

test('applyChange: deleting the whole span drops the alternative; ghosts merge', () => {
  const ann = { alts: [wordAlt(TEXT, 'tension', ['pressure'])], ghosts: [{ id: 'g1', ...at(TEXT, 'in product') }, { id: 'g2', ...at(TEXT, 'development') }] };
  const t2 = TEXT.replace('tension ', '');
  const out = M.applyChange(ann, TEXT, t2);
  assert.equal(out.alts.length, 0);
  assert.equal(out.ghosts.length, 2);
  assert.equal(t2.slice(out.ghosts[0].start, out.ghosts[0].end), 'in product');
  const merged = M.ghost(ann, at(TEXT, 'product dev').start, at(TEXT, 'product dev').end);
  assert.equal(merged.ghosts.length, 1);
  assert.equal(TEXT.slice(merged.ghosts[0].start, merged.ghosts[0].end), 'in product development');
});

test('swap: puts an option on the page and fixes a/an', () => {
  const t = 'It does one thing, like a paperclip, for example.';
  const ann = { alts: [wordAlt(t, 'paperclip', ['thumbtack', 'eraser'])], ghosts: [] };
  let r = M.swap(t, ann, 'a1', 2);
  assert.equal(r.text, 'It does one thing, like an eraser, for example.');
  assert.equal(shown(r.text, r.ann.alts[0]), 'eraser');
  assert.equal(r.ann.alts[0].active, 2);
  r = M.swap(r.text, r.ann, 'a1', 1);
  assert.equal(r.text, 'It does one thing, like a thumbtack, for example.');
  r = M.swap(r.text, r.ann, 'a1', 0);
  assert.equal(r.text, t);
});

test('swap: other marks move with the text', () => {
  const t = 'The struggle is real. Ghost me later.';
  const ann = { alts: [wordAlt(t, 'struggle', ['enormous difficulty'])], ghosts: [{ id: 'g', ...at(t, 'Ghost me') }] };
  const r = M.swap(t, ann, 'a1', 1);
  assert.equal(r.text.slice(r.ann.ghosts[0].start, r.ann.ghosts[0].end), 'Ghost me');
});

test('articleFor: vowel sounds, not letters', () => {
  const cases = { eraser: 'an', thumbtack: 'a', hour: 'an', honest: 'an', unicorn: 'a', university: 'a', unimportant: 'an',
    unidentified: 'an', user: 'a', European: 'a', one: 'a', 'one-time': 'a', onerous: 'an', FAQ: 'an', URL: 'a', MBA: 'an', SEO: 'an',
    '8-hour': 'an', '11': 'an', '10': 'a', apple: 'an', house: 'a', '**idea**': 'an' };
  for (const [w, want] of Object.entries(cases)) assert.equal(M.articleFor(w), want, w);
  assert.deepEqual(M.articleFix('Like A paperclip', 7, 'eraser'), { start: 5, end: 6, insert: 'An' });
  assert.equal(M.articleFix('banana split', 7, 'eraser'), null, '"a" inside a word is not an article');
});

test('reanchor: follows one remote edit exactly and finds the rest by text', () => {
  const t = 'First paragraph has tension.\nSecond one has a paperclip.';
  const ann = { alts: [wordAlt(t, 'tension', ['pressure']), Object.assign(wordAlt(t, 'paperclip', ['eraser']), { id: 'a2' })], ghosts: [] };
  const remote = 'New intro.\nFirst paragraph has tension.\nSecond one has a paperclip!';
  const out = M.reanchor(ann, t, remote);
  assert.equal(out.lost.length, 0);
  for (const a of out.ann.alts) assert.equal(shown(remote, a), a.options[0].text);
  const gone = M.reanchor(ann, t, 'Nothing like before.');
  assert.equal(gone.ann.alts.length, 0);
  assert.equal(gone.lost.length, 2);
});

test('normalize: drops what no longer fits the text', () => {
  const ann = { alts: [wordAlt(TEXT, 'tension', ['pressure']), { kind: 'word', start: 0, end: 4, active: 0, options: [{ text: 'Much' }] }, { kind: 'bogus' }], ghosts: [{ start: 0, end: 4 }, { start: 5, end: 999 }] };
  const n = M.normalize(ann, TEXT);
  assert.equal(n.alts.length, 1, 'one option is just text; bad kinds go');
  assert.equal(n.ghosts.length, 1);
  assert.equal(M.normalize(ann, 'Different text entirely, nothing matches.').alts.length, 0);
  const moved = M.normalize(ann, 'Intro. ' + TEXT);
  assert.equal(moved.alts.length, 1, 'found again when the text moved');
  assert.equal(('Intro. ' + TEXT).slice(moved.alts[0].start, moved.alts[0].end), 'tension');
  assert.deepEqual(M.normalize(null, 'x'), { alts: [], ghosts: [] });
});

test('stripGhosts: no double spaces, lines that only held ghosts go', () => {
  const t = 'Keep this. Lose this. Keep that.\nGone line.\nLast.';
  const ghosts = [at(t, 'Lose this.'), at(t, 'Gone line.')];
  assert.equal(M.stripGhosts(t, ghosts), 'Keep this. Keep that.\nLast.');
  assert.equal(M.stripGhosts('one two three', [at('one two three', 'three')]), 'one two');
  assert.equal(M.stripGhosts('a b', []), 'a b');
});

test('revive splits a ghost', () => {
  const g = { alts: [], ghosts: [{ id: 'g', start: 0, end: 20 }] };
  const r = M.revive(g, 5, 10);
  assert.deepEqual(r.ghosts.map((x) => [x.start, x.end]), [[0, 5], [10, 20]]);
  assert.ok(M.ghostAt(r, 2, 2));
  assert.ok(!M.ghostAt(r, 6, 8));
});

test('scopes: word, sentence, paragraph and what a selection is', () => {
  const t = '# Title here\nOne sentence. Another sentence follows here.';
  const w = M.wordAt(t, t.indexOf('Another') + 2);
  assert.equal(t.slice(w.start, w.end), 'Another');
  const s = M.sentenceAt(t, t.indexOf('follows'));
  assert.equal(t.slice(s.start, s.end), 'Another sentence follows here.');
  const p = M.paragraphAt(t, 3);
  assert.equal(t.slice(p.start, p.end), 'Title here');
  assert.equal(M.kindOf(t, w.start, w.end), 'word');
  assert.equal(M.kindOf(t, s.start, s.end), 'sentence');
  assert.equal(M.kindOf(t, p.start, p.end), 'paragraph');
});

test('addOptions skips duplicates and keeps provenance', () => {
  const ann = { alts: [wordAlt(TEXT, 'tension', ['pressure'])], ghosts: [] };
  const out = M.addOptions(ann, 'a1', ['Pressure', 'friction', 'struggle'], 'ai');
  assert.deepEqual(out.alts[0].options.map((o) => o.text + ':' + o.by), ['tension:me', 'pressure:me', 'friction:ai', 'struggle:ai']);
});

test('reanchor: a word rewritten in Notion keeps the old one as an option', () => {
  const ann = { alts: [wordAlt(TEXT, 'tension', ['pressure'])], ghosts: [] };
  const remote = TEXT.replace('tension', 'rest');
  const a = M.reanchor(ann, TEXT, remote).ann.alts[0];
  assert.equal(shown(remote, a), 'rest');
  assert.deepEqual(a.options.map((o) => o.text), ['tension', 'rest', 'pressure']);
  assert.equal(a.active, 1);
});
