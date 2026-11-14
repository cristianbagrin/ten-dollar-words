// A backup from one browser (or web address) opened in another: Store.exportAll and importAll.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'js', 'store.js'), 'utf8');

// store.js in a page of its own, with its own localStorage, at `origin`.
function browser(origin, items) {
  const m = new Map(Object.entries(items || {}));
  const localStorage = {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
  const window = { addEventListener() {} };
  const ctx = { window, localStorage, location: { origin }, navigator: {}, JSON, Date, Math, Number, String, Object, Array, Set, Map };
  window.TDW = {};
  vm.runInNewContext(SRC, ctx);
  return { Store: window.TDW.Store, m };
}

const draft = (id, extra) => JSON.stringify(Object.assign({ id, text: 'Text of ' + id, budget: 2000, updatedAt: 1000, textAt: 1000 }, extra));

test('everything but the account record and passing marks goes into a backup', () => {
  const { Store } = browser('https://tendollarwords.netlify.app', {
    'tdw.draft.d1': draft('d1'), 'tdw.settings': '{"skin":"x"}', 'tdw.geminiKey': 'AIza-k', 'tdw.notionToken': 'ntn_t',
    'tdw.challengeStreak': '{"n":4}', 'tdw.ignored': '{}', 'tdw.account': '{"key":"secret"}', 'tdw.syncWant': '1',
    'tdw.notionMarks': '{}', 'other.app': 'x'
  });
  const b = Store.exportAll();
  assert.equal(b.app, 'ten-dollar-words');
  assert.equal(b.from, 'https://tendollarwords.netlify.app');
  assert.deepEqual(Object.keys(b.items).sort(), ['tdw.challengeStreak', 'tdw.draft.d1', 'tdw.geminiKey', 'tdw.ignored', 'tdw.notionToken', 'tdw.settings']);
});

test('a backup fills an empty browser at the new address', () => {
  const old = browser('https://tendollarwords.netlify.app', {
    'tdw.draft.d1': draft('d1'), 'tdw.draft.d2': draft('d2', { notionId: 'n2', overflow: 'spare words' }),
    'tdw.settings': '{"skin":"x"}', 'tdw.geminiKey': 'AIza-k', 'tdw.last': 'd2'
  });
  const fresh = browser('https://tendollarwords.cristianbagrin.com', { 'tdw.draft.new': draft('new', { text: '' }), 'tdw.last': 'new' });
  const done = fresh.Store.importAll(JSON.parse(JSON.stringify(old.Store.exportAll())));
  assert.deepEqual([done.drafts, done.kept, done.failed], [2, 0, 0]);
  assert.equal(fresh.m.get('tdw.draft.d1'), old.m.get('tdw.draft.d1'));
  assert.equal(JSON.parse(fresh.m.get('tdw.draft.d2')).overflow, 'spare words');
  assert.equal(fresh.m.get('tdw.geminiKey'), 'AIza-k');
  assert.equal(fresh.m.get('tdw.last'), 'd2', 'opens where you left off');
  assert.equal(fresh.Store.listDrafts().length, 3);
});

test('a backup never overwrites anything newer, and takes the place of a page just pulled from Notion', () => {
  const backup = {
    app: 'ten-dollar-words', backup: 1, items: {
      'tdw.draft.a': draft('a', { updatedAt: 500 }), 'tdw.draft.b': draft('b', { updatedAt: 3000 }),
      'tdw.draft.c': draft('c', { notionId: 'nc', textAt: 900, overflow: 'kept aside' }),
      'tdw.draft.e': draft('e', { notionId: 'ne', textAt: 900 }),
      'tdw.settings': '{"skin":"old"}', 'tdw.geminiKey': 'old-key', 'tdw.account': '{"key":"x"}'
    }
  };
  const here = browser('https://tendollarwords.cristianbagrin.com', {
    'tdw.draft.a': draft('a', { updatedAt: 2000, text: 'newer here' }), 'tdw.draft.b': draft('b', { updatedAt: 2000 }),
    'tdw.draft.p': draft('p', { notionId: 'nc', textAt: 100 }),                      // fetched from Notion here
    'tdw.draft.q': draft('q', { notionId: 'ne', textAt: 5000, dirty: true, text: 'typed here' }), // typed here since
    'tdw.settings': '{"skin":"new"}'
  });
  const done = here.Store.importAll(backup);
  assert.deepEqual([done.drafts, done.kept], [2, 2]);
  assert.equal(JSON.parse(here.m.get('tdw.draft.a')).text, 'newer here');
  assert.equal(JSON.parse(here.m.get('tdw.draft.b')).updatedAt, 3000);
  assert.ok(!here.m.has('tdw.draft.p'), 'one draft per Notion page');
  assert.equal(JSON.parse(here.m.get('tdw.draft.c')).overflow, 'kept aside');
  assert.equal(JSON.parse(here.m.get('tdw.draft.q')).text, 'typed here');
  assert.ok(!here.m.has('tdw.draft.e'));
  assert.equal(here.m.get('tdw.settings'), '{"skin":"new"}');
  assert.equal(here.m.get('tdw.geminiKey'), 'old-key');
  assert.ok(!here.m.has('tdw.account'));
  assert.equal(JSON.stringify(here.Store.importAll(backup)), JSON.stringify({ drafts: 0, kept: 4, other: 0, failed: 0 }), 'opening it twice changes nothing');
  assert.equal(here.Store.importAll({ hello: 1 }), null);
});
