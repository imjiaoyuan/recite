// recite-sync — a Cloudflare Worker that serves the app AND is its data store.
//
// Deploy it with the "Deploy to Cloudflare" button in the repo README. The
// pipeline builds the site (dist/) and uploads it as Worker static assets;
// the KV namespace bound at deploy time IS the storage — no URLs to configure
// anywhere, because the app and its data live on the same origin by design:
//
//   GET /:key            → 200 {v, date, data}   (data:null if the key is unused)
//   PUT /:key  body:json → 200 {ok:true}
//   OPTIONS *            → CORS preflight (for cross-origin users of the
//                          GitHub Pages demo, who paste this URL by hand)
//   anything else        → static assets from dist/ (SPA fallback to index.html)
//
// HTML responses are stamped with <meta name="recite-sync"> — the served page
// thereby KNOWS "the origin I came from has a KV behind it", and the app hides
// the server-URL field entirely: on a deployment you only ever set a sync code.
// Works identically on workers.dev and on any custom domain bound later,
// because nothing anywhere hard-codes a URL.
//
// Auth: the sync code IS the credential (it is the KV key and unguessable).
// Optionally set a TOKEN secret (`wrangler secret put TOKEN` or the dashboard's
// Settings → Variables) to additionally require an `Authorization: Bearer TOKEN`
// header — useful when several people share one deployment.
//
// No rate limiting beyond the sync code's unguessability: each deployment runs
// on the owner's own free-tier quota (100k reads / 1k writes per day).

// Type-only stand-in for wrangler's generated `KVNamespace` (created on deploy
// as worker-configuration.d.ts); avoids a devDependency on @cloudflare/workers-types.
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

// Provided by the runtime when the wrangler config declares an assets binding.
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// The declaration stamped into every served HTML page (see header comment).
const STORE_META = '<meta name="recite-sync" content="kv">';

async function serveAsset(request: Request, env: { ASSETS?: Fetcher }): Promise<Response> {
  if (!env.ASSETS) return json({ error: 'assets binding missing — re-run the deploy setup' }, 500);
  const res = await env.ASSETS.fetch(request);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return res; // hashed assets pass through untouched
  let html = await res.text();
  if (!html.includes('recite-sync')) html = html.replace(/<head[^>]*>/i, (m) => m + STORE_META);
  return new Response(html, { status: res.status, headers: res.headers });
}

export default {
  async fetch(request: Request, env: { KV?: KVNamespace; TOKEN?: string; ASSETS?: Fetcher }): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
    const key = new URL(request.url).pathname.slice(1);

    // Sync-code routes: dotless single-segment paths. Every real asset has an
    // extension (/assets/index-abc.js, /data/gre.json, /favicon.ico …), and the
    // app's router is hash-based, so this can't shadow a page.
    if ((request.method === 'GET' || request.method === 'PUT') && /^[A-Za-z0-9_-]{4,128}$/.test(key)) {
      if (!env.KV) return json({ error: 'KV binding missing — re-run the deploy setup' }, 500);
      // Optional shared-secret layer (enable by setting the TOKEN secret).
      if (env.TOKEN && request.headers.get('authorization') !== `Bearer ${env.TOKEN}`) return json({ error: 'unauthorized' }, 401);
      if (request.method === 'GET') {
        const raw = await env.KV.get(key);
        if (raw == null) return json({ v: 1, data: null });
        return new Response(raw, { status: 200, headers: JSON_HEADERS });
      }
      const body = await request.text();
      if (!body || body.length > 25 * 1024 * 1024) return json({ error: 'bad body' }, 400); // KV value cap is 25 MB
      await env.KV.put(key, body);
      return json({ ok: true });
    }
    return serveAsset(request, env);
  },
};
