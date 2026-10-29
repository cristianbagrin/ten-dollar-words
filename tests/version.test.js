// The app's version lives in three places; a deploy that bumps only some of them lets the
// service worker serve old files with a new page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8');

test('app.js, sw.js and every ?v= in index.html carry the same version', () => {
  const app = /APP_VERSION = '([^']+)'/.exec(read('js/app.js'))[1];
  const sw = /VERSION = 'tdw-([^']+)'/.exec(read('sw.js'))[1];
  const html = [...read('index.html').matchAll(/\?v=([\d.]+)/g)].map((m) => m[1]);
  assert.equal(sw, app);
  assert.ok(html.length > 10);
  for (const v of html) assert.equal(v, app);
});
