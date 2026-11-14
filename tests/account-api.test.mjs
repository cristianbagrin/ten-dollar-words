import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHandler, memoryKV, d1KV } from '../worker/account-api.mjs';

const auth = () => crypto.randomBytes(32).toString('base64url');
const IV = crypto.randomBytes(12).toString('base64');
const CT = crypto.randomBytes(48).toString('base64');

function setup(kv) {
  kv = kv || memoryKV();
  const clock = { t: Date.UTC(2026, 8, 1) };
  const handle = createHandler({ kv, now: () => clock.t });
  async function call(action, body, cookie, headers) {
    const req = new Request('https://x.test/api/account/' + action, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'X-TDW': '1', 'Sec-Fetch-Site': 'same-origin' }, cookie ? { Cookie: cookie } : {}, headers || {}),
      body: body === undefined ? '{}' : JSON.stringify(body)
    });
    const res = await handle(req, action);
    const set = res.headers.get('set-cookie') || '';
    return { status: res.status, body: await res.json(), cookie: set.split(';')[0], setCookie: set };
  }
  return { kv, clock, call };
}

test('sign up, sign in, pull and push the encrypted document', async () => {
  const { call } = setup();
  const a = auth();
  const up = await call('signup', { email: ' Chris@Example.com ', auth: a });
  assert.equal(up.status, 200);
  assert.equal(up.body.email, 'chris@example.com');
  assert.match(up.setCookie, /HttpOnly/);
  assert.match(up.setCookie, /SameSite=Strict/);
  assert.match(up.setCookie, /Secure/);

  const empty = await call('pull', {}, up.cookie);
  assert.deepEqual([empty.status, empty.body.rev, empty.body.ct], [200, 0, undefined]);

  const pushed = await call('push', { base: 0, iv: IV, ct: CT }, up.cookie);
  assert.deepEqual([pushed.status, pushed.body.rev], [200, 1]);

  const other = await call('login', { email: 'chris@example.com', auth: a });
  assert.equal(other.status, 200);
  assert.equal(other.body.rev, 1);
  assert.equal(other.body.ct, CT);
  assert.notEqual(other.cookie, up.cookie);
  const pulled = await call('pull', {}, other.cookie);
  assert.deepEqual([pulled.body.rev, pulled.body.iv, pulled.body.ct], [1, IV, CT]);
});

test('a push from an older revision gets the current document back', async () => {
  const { call } = setup();
  const up = await call('signup', { email: 'a@b.co', auth: auth() });
  await call('push', { base: 0, iv: IV, ct: CT }, up.cookie);
  const stale = await call('push', { base: 0, iv: IV, ct: 'AAAA' }, up.cookie);
  assert.equal(stale.status, 409);
  assert.deepEqual([stale.body.error, stale.body.rev, stale.body.ct], ['conflict', 1, CT]);
  const ok = await call('push', { base: 1, iv: IV, ct: 'AAAA' }, up.cookie);
  assert.equal(ok.body.rev, 2);
});

test('one account per email', async () => {
  const { call } = setup();
  assert.equal((await call('signup', { email: 'a@b.co', auth: auth() })).status, 200);
  const again = await call('signup', { email: 'A@B.CO', auth: auth() });
  assert.deepEqual([again.status, again.body.error], [409, 'exists']);
  assert.equal((await call('signup', { email: 'not-an-email', auth: auth() })).body.error, 'bad_email');
});

test('wrong passwords are refused, and too many lock the account for 15 minutes', async () => {
  const { call, clock } = setup();
  const a = auth();
  await call('signup', { email: 'a@b.co', auth: a });
  const wrong = await call('login', { email: 'a@b.co', auth: auth() });
  assert.deepEqual([wrong.status, wrong.body.error], [401, 'wrong']);
  const nobody = await call('login', { email: 'nobody@b.co', auth: auth() });
  assert.deepEqual([nobody.status, nobody.body.error], [401, 'wrong']); // same answer: no way to tell who has an account
  for (let k = 0; k < 7; k++) await call('login', { email: 'a@b.co', auth: auth() });
  const locked = await call('login', { email: 'a@b.co', auth: a });
  assert.deepEqual([locked.status, locked.body.error], [429, 'locked']);
  clock.t += 15 * 60e3 + 1;
  assert.equal((await call('login', { email: 'a@b.co', auth: a })).status, 200);
});

test('calls need the header, POST, a session, and a same-origin page', async () => {
  const { call } = setup();
  const up = await call('signup', { email: 'a@b.co', auth: auth() });
  assert.equal((await call('pull', {}, up.cookie, { 'X-TDW': '' })).status, 403);
  assert.equal((await call('pull', {}, up.cookie, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await call('pull', {})).status, 401);
  assert.equal((await call('pull', {}, 'tdw_session=' + '0'.repeat(32) + '.' + 'x'.repeat(43))).status, 401);
  assert.equal((await call('nope', {}, up.cookie)).status, 404);
  assert.equal((await call('constructor', {}, up.cookie)).status, 404);
  assert.equal((await call('push', { base: 0, iv: 'short', ct: CT }, up.cookie)).status, 400);
});

test('signing out ends that session only', async () => {
  const { call } = setup();
  const a = auth();
  const one = await call('signup', { email: 'a@b.co', auth: a });
  const two = await call('login', { email: 'a@b.co', auth: a });
  const out = await call('logout', {}, one.cookie);
  assert.match(out.setCookie, /Max-Age=0/);
  assert.equal((await call('pull', {}, one.cookie)).status, 401);
  assert.equal((await call('pull', {}, two.cookie)).status, 200);
});

test('sessions last a year from the last visit', async () => {
  const { call, clock } = setup();
  const up = await call('signup', { email: 'a@b.co', auth: auth() });
  clock.t += 300 * 86400e3;
  const seen = await call('pull', {}, up.cookie);
  assert.equal(seen.status, 200);
  assert.match(seen.setCookie, /Max-Age=31536000/); // moved forward
  clock.t += 300 * 86400e3;
  assert.equal((await call('pull', {}, up.cookie)).status, 200);
  clock.t += 366 * 86400e3;
  assert.equal((await call('pull', {}, up.cookie)).status, 401);
});

test('changing the password re-encrypts the document and signs other devices out', async () => {
  const { call } = setup();
  const a = auth(), b = auth();
  const one = await call('signup', { email: 'a@b.co', auth: a });
  const two = await call('login', { email: 'a@b.co', auth: a });
  await call('push', { base: 0, iv: IV, ct: CT }, one.cookie);
  const wrong = await call('password', { auth: b, newAuth: b, base: 1, iv: IV, ct: 'BBBB' }, one.cookie);
  assert.equal(wrong.status, 401);
  const stale = await call('password', { auth: a, newAuth: b, base: 0, iv: IV, ct: 'BBBB' }, one.cookie);
  assert.equal(stale.status, 409);
  const ok = await call('password', { auth: a, newAuth: b, base: 1, iv: IV, ct: 'BBBB' }, one.cookie);
  assert.deepEqual([ok.status, ok.body.rev], [200, 2]);
  assert.equal((await call('pull', {}, one.cookie)).body.ct, 'BBBB');
  assert.equal((await call('pull', {}, two.cookie)).status, 401);
  assert.equal((await call('login', { email: 'a@b.co', auth: a })).status, 401);
  assert.equal((await call('login', { email: 'a@b.co', auth: b })).status, 200);
});

test('deleting the account removes everything and frees the email', async () => {
  const { call, kv } = setup();
  const a = auth();
  const one = await call('signup', { email: 'a@b.co', auth: a });
  await call('login', { email: 'a@b.co', auth: a });
  await call('push', { base: 0, iv: IV, ct: CT }, one.cookie);
  assert.equal((await call('delete', { auth: auth() }, one.cookie)).status, 401);
  assert.equal((await call('delete', { auth: a }, one.cookie)).status, 200);
  assert.equal(kv.dump().size, 0);
  assert.equal((await call('signup', { email: 'a@b.co', auth: auth() })).status, 200);
});

test('an email left claimed by a signup that never finished can sign up again', async () => {
  const { call, kv } = setup();
  const up = await call('signup', { email: 'a@b.co', auth: auth() });
  await kv.del('user/' + up.body.userId);
  assert.equal((await call('signup', { email: 'a@b.co', auth: auth() })).status, 200);
});

// A real D1 database (wrangler's local one, in a temporary folder). Needs `npm install`; skipped without it.
async function localD1(t) {
  const wrangler = await import('wrangler').catch(() => null);
  if (!wrangler) { t.skip('run npm install first'); return null; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdw-d1-'));
  const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
  const proxy = await wrangler.getPlatformProxy({ configPath: path.join(root, 'wrangler.jsonc'), persist: { path: dir } });
  const db = proxy.env.DB;
  for (const f of fs.readdirSync(path.join(root, 'migrations')).sort()) {
    for (const sql of fs.readFileSync(path.join(root, 'migrations', f), 'utf8').replace(/--.*$/gm, '').split(';')) if (sql.trim()) await db.prepare(sql).run();
  }
  t.after(async () => { await proxy.dispose(); fs.rmSync(dir, { recursive: true, force: true }); });
  return db;
}

test('the same flows on D1', async (t) => {
  const db = await localD1(t);
  if (!db) return;
  const { call } = setup(d1KV(db));
  const a = auth(), b = auth();
  const one = await call('signup', { email: 'a@b.co', auth: a });
  assert.equal(one.status, 200);
  assert.equal((await call('signup', { email: 'a@b.co', auth: a })).status, 409);
  assert.equal((await call('push', { base: 0, iv: IV, ct: CT }, one.cookie)).body.rev, 1);
  const stale = await call('push', { base: 0, iv: IV, ct: 'AAAA' }, one.cookie);
  assert.deepEqual([stale.status, stale.body.ct], [409, CT]);
  const two = await call('login', { email: 'a@b.co', auth: a });
  assert.equal((await call('password', { auth: a, newAuth: b, base: 1, iv: IV, ct: 'BBBB' }, one.cookie)).body.rev, 2);
  assert.equal((await call('pull', {}, two.cookie)).status, 401);
  assert.equal((await call('delete', { auth: b }, one.cookie)).status, 200);
  assert.deepEqual((await db.prepare('SELECT k FROM kv').all()).results, []);
});

test('D1 writes: only-if-new, only-if-unchanged, prefixes, and no stale ETag after a delete', async (t) => {
  const db = await localD1(t);
  if (!db) return;
  const kv = d1KV(db);
  assert.equal(await kv.put('x/1', { n: 1 }, { isNew: true }), true);
  assert.equal(await kv.put('x/1', { n: 2 }, { isNew: true }), false);
  const first = await kv.get('x/1');
  assert.deepEqual(first.data, { n: 1 });
  assert.equal(await kv.put('x/1', { n: 3 }, { etag: first.etag }), true);
  assert.equal(await kv.put('x/1', { n: 4 }, { etag: first.etag }), false, 'an old ETag no longer matches');
  assert.equal(await kv.put('x/1', { n: 5 }, { etag: '' }), false, 'a checked write is never blind');
  const now = await kv.get('x/1');
  await kv.del('x/1');
  await kv.put('x/1', { n: 3 });
  assert.equal(await kv.put('x/1', { n: 6 }, { etag: now.etag }), false, 'same value again, still a new ETag');
  await kv.put('x/2', {});
  await kv.put('x_3', {});
  assert.deepEqual(await kv.keys('x/'), ['x/1', 'x/2']);
  assert.equal(await kv.get('nope'), null);
});

test('the Worker: /api/account/* reaches the account, other /api/ paths 404, the rest are files', async (t) => {
  const db = await localD1(t);
  if (!db) return;
  const worker = (await import('../worker/index.mjs')).default;
  const env = { DB: db, TDW_RESET_CODE: '', ASSETS: { fetch: (req) => new Response('file ' + new URL(req.url).pathname) } };
  const post = (url, body) => worker.fetch(new Request(url, { method: 'POST', headers: { 'X-TDW': '1', 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify(body || {}) }), env);
  const up = await post('https://tendollarwords.cristianbagrin.com/api/account/signup', { email: 'a@b.co', auth: auth() });
  assert.equal(up.status, 200);
  assert.match(up.headers.get('set-cookie'), /; Secure/);
  const local = await post('http://127.0.0.1:8787/api/account/signup', { email: 'c@d.co', auth: auth() });
  assert.doesNotMatch(local.headers.get('set-cookie'), /Secure/, 'plain http on this computer');
  const none = await post('https://x.test/api/nothing');
  assert.deepEqual([none.status, (await none.json()).error], [404, 'not_found']);
  assert.equal((await post('https://x.test/api/account/nope')).status, 404);
  assert.equal(await (await worker.fetch(new Request('https://x.test/js/app.js?v=1'), env)).text(), 'file /js/app.js');
  const off = await post('https://x.test/api/account/reset', { email: 'a@b.co', code: 'whatever-long', auth: auth() });
  assert.equal(off.status, 403, 'no TDW_RESET_CODE, no resets');
});

test('a reset needs the site code, then starts the account again under the new password', async () => {
  const { createHandler: make, memoryKV: mem } = await import('../worker/account-api.mjs');
  const AUTH1 = 'A'.repeat(43), AUTH2 = 'B'.repeat(43);
  const callOn = (h) => (action, body, cookie) => h(new Request('http://x/api/account/' + action, {
    method: 'POST', headers: Object.assign({ 'x-tdw': '1', 'content-type': 'application/json' }, cookie ? { cookie } : {}), body: JSON.stringify(body || {})
  }), action);

  const off = callOn(make({ kv: mem(), secure: false }));
  assert.equal((await off('reset', { email: 'a@b.co', code: 'anything-long', auth: AUTH2 })).status, 403);

  const kv = mem();
  const api = callOn(make({ kv, secure: false, resetCode: 'correct-horse-battery' }));
  const up = await api('signup', { email: 'a@b.co', auth: AUTH1 });
  assert.equal(up.status, 200);
  const oldId = (await up.json()).userId;
  const oldCookie = up.headers.get('set-cookie').split(';')[0];

  assert.equal((await api('reset', { email: 'a@b.co', code: 'wrong-code-entirely', auth: AUTH2 })).status, 401);
  assert.equal((await api('login', { email: 'a@b.co', auth: AUTH1 })).status, 200, 'a wrong code changes nothing');

  const res = await api('reset', { email: 'a@b.co', code: 'correct-horse-battery', auth: AUTH2 });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.notEqual(body.userId, oldId);
  assert.equal(body.rev, 0);
  assert.equal((await api('login', { email: 'a@b.co', auth: AUTH1 })).status, 401, 'the old password is gone');
  assert.equal((await api('login', { email: 'a@b.co', auth: AUTH2 })).status, 200);
  assert.equal((await api('pull', {}, oldCookie)).status, 401, 'old sessions are signed out');
  assert.ok(![...kv.dump().keys()].some((k) => k.includes(oldId)), 'nothing of the old account is left');
});

test('wrong reset codes lock the email out like wrong passwords', async () => {
  const { createHandler: make, memoryKV: mem } = await import('../worker/account-api.mjs');
  const h = make({ kv: mem(), secure: false, resetCode: 'correct-horse-battery' });
  const api = (body) => h(new Request('http://x/api/account/reset', { method: 'POST', headers: { 'x-tdw': '1' }, body: JSON.stringify(body) }), 'reset');
  for (let k = 0; k < 8; k++) assert.equal((await api({ email: 'a@b.co', code: 'nope-nope-nope', auth: 'B'.repeat(43) })).status, 401);
  assert.equal((await api({ email: 'a@b.co', code: 'correct-horse-battery', auth: 'B'.repeat(43) })).status, 429);
});
