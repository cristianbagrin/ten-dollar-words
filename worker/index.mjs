/* The Cloudflare Worker: app/ is served as static assets (with app/_headers), and this code
   answers only /api/* (wrangler.jsonc sends those here first). /api/account/<action> is the
   account; the logic lives in account-api.mjs and the records in the D1 database bound as DB. */
import { createHandler, d1KV } from './account-api.mjs';

const ACCOUNT = /^\/api\/account\/([^/]+)$/;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const m = ACCOUNT.exec(url.pathname);
    if (!m) return json(404, { error: 'not_found', message: 'No such action.' });
    // TDW_RESET_CODE (a Worker secret: npx wrangler secret put TDW_RESET_CODE) turns on "Forgot your password?".
    const handle = createHandler({ kv: d1KV(env.DB), resetCode: env.TDW_RESET_CODE || '', secure: url.protocol === 'https:' });
    try {
      return await handle(req, m[1]);
    } catch (e) {
      console.error('account', m[1], e && e.stack ? e.stack : e);
      return json(500, { error: 'server', message: 'Something went wrong on the server. Try again in a moment.' });
    }
  }
};
