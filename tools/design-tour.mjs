// Screenshots of a fixed set of states, so design directions can be compared and graded on the
// same footing. It starts its own app server and fake Notion, drives the app through its public
// JS API (TDW.*), and writes one PNG per state plus tour.json (what ran, what failed, errors).
//
//   node tools/design-tour.mjs [--variant name] [--out <dir>] [--port 8811] [--notion-port 8812]
//                              [--only D04,P02] [--scale 1]
//
// The tour runs against the app at /. tools/tour-hooks.mjs may export
// `steps` ({ 'D07-slash': async (page, t) => { ... } }) to replace a step, and `extra`
// ([{ name, run, phone }]) to add states. Hooks get the same helpers as the built-in steps (t).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };

const variant = arg('--variant', 'app'); // only names the output folder
const out = path.resolve(arg('--out', path.join(ROOT, '.tour', variant)));
const only = (arg('--only', '') || '').split(',').filter(Boolean);
const scale = Number(arg('--scale', '1')) || 1;

function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}

async function waitFor(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Server did not start: ' + url);
}

const port = Number(arg('--port', 0)) || await freePort();
const notionPort = Number(arg('--notion-port', 0)) || await freePort();
const kids = [
  spawn(process.execPath, [path.join(ROOT, 'tools/dev-server.mjs'), '--port', String(port)], { stdio: 'ignore' }),
  spawn(process.execPath, [path.join(ROOT, 'tests/fake-notion.mjs'), '--port', String(notionPort)], { stdio: 'ignore' })
];
const cleanup = () => { for (const k of kids) { try { k.kill(); } catch (_) { /* gone */ } } };
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

const base = 'http://127.0.0.1:' + port + '/';
await waitFor(base);
await waitFor('http://127.0.0.1:' + notionPort + '/__admin/dump');
fs.mkdirSync(out, { recursive: true });

let hooks = {};
const hookFile = path.join(ROOT, 'tools/tour-hooks.mjs');
if (fs.existsSync(hookFile)) hooks = await import(pathToFileURL(hookFile).href + '?t=' + Date.now());

const SAMPLE = [
  '# The ten dollar rule',
  'Every word you type costs ten dollars. That sounds harsh, but it is really the fastest way to learn to cut.',
  'Most people write long sentences because they are afraid that short ones will make them look simple to readers.',
  'This sentence is here to show you what happens when a writer keeps adding clauses and qualifications that the reader has to hold in their head while they wait for the point, which arrives much too late.',
  'The report was written by a committee in order to utilize every possible word.',
  "I think you already know what to do. Delete what doesn't earn its keep and watch the register quietly drop."
].join('\n');

const browser = await chromium.launch();
const report = { variant, base, steps: [], errors: [] };

async function fresh(opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale }, opts || {}));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => report.errors.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) report.errors.push('console: ' + m.text()); });
  await page.goto(base);
  await page.evaluate((np) => {
    localStorage.setItem('tdw.notionBase', 'http://127.0.0.1:' + np + '/v1');
    localStorage.setItem('tdw.geminiKey', 'tour-key');
    localStorage.setItem('tdw.geminiModel', 'gemini-flash-latest');
  }, notionPort);
  await page.reload();
  await page.waitForFunction(() => window.TDW && TDW.App && TDW.App.state.draft);
  await page.evaluate(() => { TDW.mockAI = true; });
  await page.waitForTimeout(500);
  return { ctx, page };
}

// Helpers handed to every step (and to hooks).
const t = {
  sample: SAMPLE,
  wait: (page, ms) => page.waitForTimeout(ms),
  async connectNotion(page) {
    await page.evaluate(async () => {
      if (TDW.Sync.isConnected()) return;
      await TDW.Sync.connect('test-secret', 'https://www.notion.so/aaaaaaaabbbbccccddddeeeeeeeeeeee');
    });
    await page.waitForTimeout(1500);
  },
  async withSample(page) {
    await page.evaluate((s) => { if (!TDW.Editor.getText().includes('ten dollar rule')) TDW.App.newDraft(s); }, SAMPLE);
    await page.waitForTimeout(300);
  },
  async mode(page, m) { await page.evaluate((x) => TDW.App.setMode(x), m); await page.waitForTimeout(450); },
  async caretAt(page, needle, offset) {
    await page.evaluate(([n, o]) => { const i = TDW.Editor.getText().indexOf(n); TDW.Editor.setCaret(i + (o || 0)); }, [needle, offset || 0]);
  },
  async select(page, needle) {
    await page.evaluate((n) => { const i = TDW.Editor.getText().indexOf(n); TDW.Editor.select(i, i + n.length); }, needle);
    await page.waitForTimeout(350);
  },
  // Select with the mouse, so selection UI that listens for pointer events shows up.
  async dragSelect(page, needle) {
    const r = await page.evaluate((n) => {
      const i = TDW.Editor.getText().indexOf(n);
      const a = TDW.Editor.rectAt(i); const b = TDW.Editor.rectAt(i + n.length);
      return a && b ? { x1: a.left + 1, y1: a.top + a.height / 2, x2: b.left - 1, y2: b.top + b.height / 2 } : null;
    }, needle);
    if (!r) throw new Error('no rect for ' + needle);
    await page.mouse.move(r.x1, r.y1); await page.mouse.down();
    await page.mouse.move(r.x2, r.y2, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(450);
  },
  async escape(page, n) { for (let i = 0; i < (n || 2); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(120); } },
  async idle(page) { await page.mouse.move(720, 640); await page.waitForTimeout(700); }
};

async function shot(page, name) { await page.screenshot({ path: path.join(out, name + '.png') }); }

async function run(name, page, fn, phone) {
  if (only.length && !only.includes(name)) return;
  const hook = hooks.steps && hooks.steps[name];
  try {
    await (hook || fn)(page, t);
    await shot(page, name);
    report.steps.push({ name, ok: true, hooked: !!hook, phone: !!phone });
  } catch (e) {
    report.steps.push({ name, ok: false, error: String(e && e.message || e).slice(0, 300), phone: !!phone });
    try { await shot(page, name + '.FAILED'); } catch (_) { /* page gone */ }
  }
}

/* ---------- Computer ---------- */
{
  const { ctx, page } = await fresh();
  await run('D01-first-run', page, async () => { await page.waitForTimeout(400); });
  await t.connectNotion(page);
  await t.withSample(page);
  await run('D02-writing', page, async () => {
    await t.caretAt(page, 'quietly drop.', 13);
    await page.keyboard.type(' So cut.', { delay: 30 });
    await page.waitForTimeout(600);
  });
  await run('D03-write-controls', page, async () => { await page.mouse.move(720, 12); await page.waitForTimeout(700); });
  await run('D04-review', page, async () => { await t.idle(page); await t.mode(page, 'edit'); });
  await run('D05-tip', page, async () => {
    const m = await page.$('.editor .hl-passive, .editor .hl-complex, .editor .hl-adverb');
    if (!m) throw new Error('no phrase mark in review');
    await m.click(); await page.waitForTimeout(500);
  });
  await t.escape(page);
  await run('D06-selection', page, async () => { await t.mode(page, 'write'); await t.dragSelect(page, 'Most people write long sentences'); });
  await t.escape(page);
  await run('D07-slash', page, async () => {
    await t.caretAt(page, 'So cut.', 7);
    await page.keyboard.press('Enter'); await page.keyboard.type('/'); await page.waitForTimeout(450);
  });
  await t.escape(page);
  await page.evaluate(() => { const s = TDW.Editor.getText(); if (/\n\/?$/.test(s)) TDW.Editor.replaceRange(s.lastIndexOf('\n'), s.length, ''); });
  await run('D08-block-menu', page, async () => {
    await page.evaluate(() => TDW.Blocks.openBlockMenu(2, 2)); await page.waitForTimeout(450);
  });
  await t.escape(page);
  await run('D09-alternatives', page, async () => {
    await t.caretAt(page, 'Delete what', 3);
    await page.evaluate(() => TDW.Alts.open('sentence')); await page.waitForTimeout(400);
    await page.keyboard.type('Cut what does not earn its keep.', { delay: 10 }); await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
  });
  await t.escape(page);
  await run('D10-context-menu', page, async () => {
    const r = await page.evaluate(() => { const i = TDW.Editor.getText().indexOf('committee'); const a = TDW.Editor.rectAt(i); return { x: a.left + 20, y: a.top + a.height / 2 }; });
    await page.mouse.click(r.x, r.y, { button: 'right' }); await page.waitForTimeout(400);
  });
  await t.escape(page);
  await run('D11-drafts', page, async () => { await page.evaluate(() => TDW.Dialogs.openDrafts()); await page.waitForTimeout(600); });
  await t.escape(page);
  await run('D12-settings', page, async () => { await page.evaluate(() => TDW.Dialogs.openSettings()); await page.waitForTimeout(600); });
  await t.escape(page);
  await run('D13-overflow', page, async () => {
    await t.caretAt(page, 'The report was', 2);
    await page.evaluate(() => TDW.Menu.stash()); await page.waitForTimeout(300);
    await page.evaluate(() => TDW.Overflow.open()); await page.waitForTimeout(500);
  });
  await page.evaluate(() => { if (TDW.Overflow.close) TDW.Overflow.close(); });
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  await t.escape(page);
  await run('D14-lab', page, async () => { await t.mode(page, 'edit'); await page.evaluate(() => TDW.Lab.open()); await page.waitForTimeout(500); });
  await run('D15-trim', page, async () => {
    const b = await page.$('.lab-level[data-level="2"]');
    if (!b) throw new Error('no trim level button');
    await b.click(); await page.waitForTimeout(2200);
  });
  await page.evaluate(() => { if (TDW.Lab.close) TDW.Lab.close(); });
  await t.escape(page, 3);
  await page.keyboard.press('Escape');
  await run('D16-challenge-picker', page, async () => {
    const b = await page.$('.ch-btn');
    if (!b) throw new Error('no challenge button');
    await b.click(); await page.waitForTimeout(400);
  });
  await t.escape(page);
  await run('D17-challenge', page, async () => { await page.evaluate(() => TDW.Challenges.start(['A1'])); await page.waitForTimeout(600); });
  await run('D18-notes', page, async () => {
    await t.mode(page, 'write');
    await t.select(page, 'afraid that short ones');
    await page.evaluate(() => TDW.Notes.compose()); await page.waitForTimeout(300);
    await page.keyboard.type('Is "afraid" too strong here?', { delay: 10 });
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await t.escape(page, 1);
    await page.evaluate(() => TDW.Notes.togglePanel()); await page.waitForTimeout(500);
  });
  await page.evaluate(() => TDW.Notes.togglePanel());
  await page.evaluate(() => TDW.Challenges.finish());
  await t.escape(page);
  await run('D19-x-thread', page, async () => {
    await page.evaluate(() => TDW.App.setFormat('x')); await page.waitForTimeout(300);
    await t.caretAt(page, 'Most people', 0);
    await page.evaluate(() => TDW.Editor.insertSeparator()); await page.waitForTimeout(500);
    await t.idle(page);
  });
  await run('D20-linkedin-review', page, async () => {
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    await page.evaluate(() => TDW.App.setFormat('linkedin')); await t.mode(page, 'edit');
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  });
  await run('D22-shortcuts', page, async () => { await page.evaluate(() => TDW.Desk.toggleSheet()); await page.waitForTimeout(500); });
  await page.evaluate(() => TDW.Desk.toggleSheet()); await t.escape(page);
  await run('D23-over-budget', page, async () => {
    await page.evaluate(() => TDW.App.setFormat('basic')); await t.mode(page, 'edit');
    await page.evaluate(() => TDW.App.setBudget(500)); await page.waitForTimeout(500);
  });
  await page.evaluate(() => TDW.App.setBudget(2000));
  for (const x of (hooks.extra || []).filter((x) => !x.phone && !x.dark)) await run(x.name, page, x.run);
  await ctx.close();
}

/* ---------- Dark ---------- */
{
  const { ctx, page } = await fresh({ colorScheme: 'dark' });
  await page.evaluate(() => TDW.App.updateSettings({ autoNight: true }));
  await t.withSample(page);
  await run('D21-dark-write', page, async () => { await t.idle(page); });
  await run('D21-dark-review', page, async () => { await t.mode(page, 'edit'); });
  for (const x of (hooks.extra || []).filter((x) => x.dark)) await run(x.name, page, x.run);
  await ctx.close();
}

/* ---------- Phone ---------- */
{
  const { ctx, page } = await fresh({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, isMobile: true, hasTouch: true });
  await t.connectNotion(page);
  await t.withSample(page);
  await run('P01-write', page, async () => { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400); }, true);
  await run('P02-review', page, async () => { await t.mode(page, 'edit'); }, true);
  await run('P03-review-open', page, async () => {
    const h = await page.$('#panel-handle');
    if (!h) throw new Error('no panel handle');
    await h.evaluate((x) => x.click()); await page.waitForTimeout(600);
  }, true);
  await t.escape(page);
  await run('P04-selection', page, async () => { await t.mode(page, 'write'); await t.select(page, 'Most people write long sentences'); await page.waitForTimeout(400); }, true);
  await run('P05-drafts', page, async () => { await page.evaluate(() => TDW.Dialogs.openDrafts()); await page.waitForTimeout(600); }, true);
  await t.escape(page);
  await run('P06-settings', page, async () => { await page.evaluate(() => TDW.Dialogs.openSettings()); await page.waitForTimeout(600); }, true);
  await t.escape(page);
  for (const x of (hooks.extra || []).filter((x) => x.phone)) await run(x.name, page, x.run, true);
  await ctx.close();
}

await browser.close();
cleanup();
fs.writeFileSync(path.join(out, 'tour.json'), JSON.stringify(report, null, 2));
const failed = report.steps.filter((s) => !s.ok);
console.log(report.steps.length + ' states, ' + failed.length + ' failed, ' + report.errors.length + ' page errors -> ' + out);
for (const f of failed) console.log('  FAILED ' + f.name + ': ' + f.error);
for (const e of report.errors.slice(0, 10)) console.log('  ERROR ' + e);
process.exit(0);
