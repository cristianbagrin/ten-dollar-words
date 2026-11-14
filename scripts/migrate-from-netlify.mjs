/* Moves the accounts from Netlify Blobs to the Cloudflare D1 database (see worker/account-api.mjs).

     node scripts/migrate-from-netlify.mjs dump   [--dir <folder>] [--force]
     node scripts/migrate-from-netlify.mjs import --local|--remote [--dir <folder>] [--overwrite]
     node scripts/migrate-from-netlify.mjs verify --local|--remote [--dir <folder>]

   dump    copies every site-wide Blobs store to <folder>/<store>/: one file per blob (named
           encodeURIComponent(key)) and _manifest.json, a list of { key, file, bytes, sha256, etag,
           metadata }. Needs NETLIFY_TOKEN, and `npm install --no-save @netlify/blobs@11` first.
   import  puts the "accounts" store into D1, one row per blob. A row that is already there with
           the same value is left alone, so running it again changes nothing. A row that is there
           with a different value is reported and kept, unless --overwrite.
   verify  reads it all back from D1: counts, a SHA-256 per value, metadata, and one digest over
           everything. Exits 1 if anything is missing or different. It only reads.

   --local   the database `wrangler dev` uses on this computer (.wrangler/state). Stop wrangler dev first.
   --remote  the real database, through Cloudflare's API. Needs CLOUDFLARE_API_TOKEN (D1 edit).
             The account and database come from wrangler.jsonc (by name if database_id isn't set).
   --dir     defaults to .migration/netlify (ignored by git). It may also point straight at a
             store's folder (one with _manifest.json in it).

   The dump holds emails, password hashes and encrypted account data: keep it private and delete
   it when the move is done. Nothing here prints a value, only key types and counts. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_ID = process.env.NETLIFY_SITE_ID || '0bf3eda5-6860-4dd9-985a-983e86b49129';
const STORE = 'accounts';
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i > 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR = path.resolve(opt('--dir', path.join(ROOT, '.migration/netlify')));

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const kind = (key) => key.split('/')[0] + '/…';
const short = (key) => key.split('/')[0] + '/' + (key.split('/')[1] || '').slice(0, 6) + '…';
const die = (msg) => { console.error(msg); process.exit(2); };

/* ---------- The dump on disk ---------- */

function storeDir() {
  if (fs.existsSync(path.join(DIR, '_manifest.json'))) return DIR;
  if (fs.existsSync(path.join(DIR, STORE, '_manifest.json'))) return path.join(DIR, STORE);
  return die('No dump at ' + DIR + ' (no _manifest.json there or in ' + STORE + '/). Run dump first, or pass --dir.');
}

// The dump's records, each checked against its manifest line before anything is written anywhere.
function readDump() {
  const dir = storeDir();
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '_manifest.json'), 'utf8'));
  if (!Array.isArray(manifest)) die('_manifest.json should be a list.');
  const out = [];
  for (const e of manifest) {
    if (!e || typeof e.key !== 'string' || typeof e.file !== 'string' || e.file.includes('/') || e.file.includes('\\')) die('A manifest line is malformed.');
    const buf = fs.readFileSync(path.join(dir, e.file));
    if (buf.length !== e.bytes || sha(buf) !== e.sha256) die('The file for ' + short(e.key) + " doesn't match its manifest line (size or SHA-256). Dump again.");
    const v = buf.toString('utf8');
    if (Buffer.from(v, 'utf8').compare(buf) !== 0) die('The value of ' + short(e.key) + " isn't UTF-8 text.");
    try { JSON.parse(v); } catch (_) { die('The value of ' + short(e.key) + " isn't JSON; the account API couldn't read it."); }
    const meta = e.metadata && typeof e.metadata === 'object' && Object.keys(e.metadata).length ? JSON.stringify(e.metadata) : null;
    out.push({ key: e.key, v, sha256: e.sha256, etag: typeof e.etag === 'string' && e.etag ? e.etag : '"' + e.sha256.slice(0, 24) + '"', meta });
  }
  if (new Set(out.map((r) => r.key)).size !== out.length) die('The manifest lists a key twice.');
  return { dir, records: out };
}

async function dump() {
  if (!process.env.NETLIFY_TOKEN) die('Set NETLIFY_TOKEN (a Netlify personal access token).');
  let blobs;
  try { blobs = await import('@netlify/blobs'); } catch (_) { die('Run `npm install --no-save @netlify/blobs@11` first.'); }
  const base = { siteID: SITE_ID, token: process.env.NETLIFY_TOKEN };
  // For a test against Netlify's local Blobs server only.
  const url = process.env.NETLIFY_BLOBS_TEST_URL;
  if (url) Object.assign(base, { edgeURL: url, uncachedEdgeURL: url, consistency: 'strong' });
  let stores = [];
  try { stores = (await blobs.listStores(base)).stores; } catch (e) { console.warn('Could not list stores (' + e.message + '); dumping "' + STORE + '" only.'); }
  if (!stores.includes(STORE)) stores.push(STORE);
  for (const name of stores) {
    const dir = path.join(DIR, encodeURIComponent(name));
    if (fs.existsSync(path.join(dir, '_manifest.json')) && !flag('--force')) die(dir + ' already has a dump. Pass --force to replace it, or --dir somewhere else.');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const store = blobs.getStore(Object.assign({ name }, base));
    const { blobs: list } = await store.list();
    const manifest = [];
    for (const { key } of list) {
      const r = await store.getWithMetadata(key, { type: 'arrayBuffer' });
      if (!r) { console.warn('  ' + short(key) + ' vanished while dumping; skipped'); continue; }
      const buf = Buffer.from(r.data);
      const file = encodeURIComponent(key);
      fs.writeFileSync(path.join(dir, file), buf, { mode: 0o600 });
      manifest.push({ key, file, bytes: buf.length, sha256: sha(buf), etag: r.etag || '', metadata: r.metadata || {} });
    }
    fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    console.log('Dumped store "' + name + '": ' + manifest.length + ' blobs, ' + manifest.reduce((n, e) => n + e.bytes, 0) + ' bytes → ' + path.relative(process.cwd(), dir));
  }
}

/* ---------- The D1 database ---------- */

function config() {
  const text = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  // JSONC: drop // comments that start a line or follow whitespace (none sit inside strings here).
  return JSON.parse(text.replace(/(^|\s)\/\/.*$/gm, '$1'));
}

// { run(sql, params) → { results, changes }, close() }
async function target() {
  const cfg = config();
  const db = cfg.d1_databases.find((d) => d.binding === 'DB');
  if (flag('--local') === flag('--remote')) die('Say --local or --remote.');
  if (flag('--local')) {
    const { getPlatformProxy } = await import('wrangler');
    const proxy = await getPlatformProxy({ configPath: path.join(ROOT, 'wrangler.jsonc'), persist: true });
    const D = proxy.env.DB;
    return {
      where: 'the local database (.wrangler/state)',
      async run(sql, params) { const r = await D.prepare(sql).bind(...(params || [])).all(); return { results: r.results || [], changes: (r.meta && r.meta.changes) || 0 }; },
      close: () => proxy.dispose()
    };
  }
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) die('Set CLOUDFLARE_API_TOKEN (an API token with D1 edit on this account).');
  const account = process.env.CLOUDFLARE_ACCOUNT_ID || cfg.account_id;
  const api = async (method, p, body) => {
    const res = await fetch('https://api.cloudflare.com/client/v4/accounts/' + account + p, {
      method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
    });
    const out = await res.json().catch(() => null);
    if (!res.ok || !out || !out.success) die('Cloudflare API ' + method + ' ' + p + ' failed: ' + res.status + ' ' + JSON.stringify(out && out.errors));
    return out.result;
  };
  let id = db.database_id;
  if (!id || /^0{8}-/.test(id)) {
    const found = (await api('GET', '/d1/database?name=' + encodeURIComponent(db.database_name))).find((d) => d.name === db.database_name);
    if (!found) die('No D1 database named ' + db.database_name + '. Create it first: npx wrangler d1 create ' + db.database_name);
    id = found.uuid;
  }
  return {
    where: 'D1 database ' + db.database_name + ' (' + id + ')',
    async run(sql, params) {
      const r = (await api('POST', '/d1/database/' + id + '/query', { sql, params: params || [] }))[0];
      return { results: r.results || [], changes: (r.meta && r.meta.changes) || 0 };
    },
    close: async () => {}
  };
}

async function tableReady(db) {
  const r = await db.run("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kv'");
  if (!r.results.length) {
    die('The kv table isn\'t there yet. Run: npx wrangler d1 migrations apply tendollarwords ' + (flag('--local') ? '--local' : '--remote'));
  }
}

async function importDump() {
  const { dir, records } = readDump();
  const db = await target();
  try {
    await tableReady(db);
    console.log('Importing ' + records.length + ' records from ' + path.relative(process.cwd(), dir) + ' into ' + db.where);
    const tally = { added: 0, same: 0, replaced: 0, differs: 0 };
    for (const r of records) {
      const ins = await db.run('INSERT INTO kv (k, v, etag, meta) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (k) DO NOTHING', [r.key, r.v, r.etag, r.meta]);
      if (ins.changes) { tally.added++; continue; }
      const cur = (await db.run('SELECT v, meta FROM kv WHERE k = ?1', [r.key])).results[0];
      if (cur && cur.v === r.v && (cur.meta || null) === r.meta) { tally.same++; continue; }
      if (flag('--overwrite')) {
        await db.run('UPDATE kv SET v = ?2, etag = ?3, meta = ?4 WHERE k = ?1', [r.key, r.v, r.etag, r.meta]);
        tally.replaced++;
        console.log('  replaced ' + short(r.key));
      } else {
        tally.differs++;
        console.log('  kept ' + short(r.key) + ': D1 already has a different value (newer use of the new site?). --overwrite replaces it.');
      }
    }
    console.log('added ' + tally.added + ', already there ' + tally.same + ', replaced ' + tally.replaced + ', kept because different ' + tally.differs);
  } finally {
    await db.close();
  }
}

async function verify() {
  const { records } = readDump();
  const db = await target();
  let bad = 0;
  try {
    await tableReady(db);
    const rows = new Map((await db.run('SELECT k, v, meta FROM kv')).results.map((r) => [r.k, r]));
    const lines = { dump: [], d1: [] };
    const byKind = {};
    for (const r of records) {
      const row = rows.get(r.key);
      const k = byKind[kind(r.key)] = byKind[kind(r.key)] || { dump: 0, ok: 0 };
      k.dump++;
      lines.dump.push(r.key + '\0' + r.sha256 + '\0' + (r.meta || ''));
      if (!row) { bad++; console.log('  missing in D1: ' + short(r.key)); continue; }
      const h = sha(Buffer.from(row.v, 'utf8'));
      lines.d1.push(r.key + '\0' + h + '\0' + (row.meta || ''));
      if (h !== r.sha256) { bad++; console.log('  different value: ' + short(r.key)); continue; }
      if ((row.meta || null) !== r.meta) { bad++; console.log('  different metadata: ' + short(r.key)); continue; }
      k.ok++;
    }
    const extra = [...rows.keys()].filter((k) => !records.some((r) => r.key === k));
    const digest = (l) => sha(l.sort().join('\n')).slice(0, 16);
    console.log('Checked against ' + db.where + ':');
    for (const [k, n] of Object.entries(byKind)) console.log('  ' + k.padEnd(10) + ' dump ' + n.dump + ', matching in D1 ' + n.ok);
    console.log('  dump ' + records.length + ' records, D1 ' + rows.size + ' rows (' + extra.length + ' not in the dump: made on the new site since)');
    console.log('  digest of the dump ' + digest(lines.dump) + ', of the same keys in D1 ' + digest(lines.d1));
    console.log(bad ? 'NOT OK: ' + bad + ' records missing or different.' : 'OK: every record in the dump is in D1, byte for byte.');
  } finally {
    await db.close();
  }
  process.exit(bad ? 1 : 0);
}

const run = { dump, import: importDump, verify }[cmd];
if (!run) die('Usage: node scripts/migrate-from-netlify.mjs dump|import|verify [--local|--remote] [--dir <folder>]  (see the top of this file)');
await run();
