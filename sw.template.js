/* Viewfinder Light – service worker (instalovatelná aplikace, offline režim).
   Generuje se z sw.template.js skriptem build.mjs (verzi a seznam souborů doplní build).
   - Soubory aplikace (skripty, modely, ikony) jsou v cache → aplikace běží i bez internetu.
   - Stránka aplikace se vždy nejdřív zkouší stáhnout ze serveru: e-shop tím ověří přihlášení a nákup.
     Když ověření projde, uloží se čas („lease“). Bez internetu aplikace naběhne z cache, ale jen
     po dobu OFFLINE_DAYS od posledního úspěšného ověření (počet dní posílá server v hlavičce). */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'vfl-app-' + VERSION;
const META = 'vfl-meta';
const SCOPE = self.registration.scope; // např. https://eshop.cz/viewfinder-app/
const LEASE_KEY = SCOPE + '__lease';
const PAGE_KEY = SCOPE + '__page';
const DEFAULT_DAYS = 30;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(new URL(f, SCOPE).href, { cache: 'reload', credentials: 'same-origin' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('vfl-app-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function readLease() { try { const r = await (await caches.open(META)).match(LEASE_KEY); return r ? await r.json() : null; } catch (e) { return null; } }
async function writeLease(days) { const c = await caches.open(META); await c.put(LEASE_KEY, new Response(JSON.stringify({ t: Date.now(), days }), { headers: { 'Content-Type': 'application/json' } })); }
function withTimeout(p, ms) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, er => { clearTimeout(t); rej(er); }); }); }

function lockedPage(lease) {
  const days = lease && lease.days || DEFAULT_DAYS;
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Viewfinder Light</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#ece8e0;font:15px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif}
.b{max-width:440px;padding:28px;border:1px solid #2a2a2e;border-radius:14px;background:#141416;text-align:center}
h1{font-size:19px;margin:10px 0 8px}.k{color:#d4b071;font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}
p{color:#b9b3a7;margin:0 0 18px}button{background:#d4b071;color:#111;border:0;border-radius:8px;padding:11px 20px;font-weight:700;font-size:15px;cursor:pointer}</style></head>
<body><div class="b"><div class="k">Svět v hledáčku · Viewfinder Light</div><h1>Je potřeba ověřit přístup</h1>
<p>${lease ? 'Aplikace běží bez internetu déle než ' + days + ' dní.' : 'Aplikace se ještě nepřipojila k e-shopu.'} Připojte se, prosím, k internetu – aplikace si ověří váš nákup (případně vás požádá o přihlášení do účtu v e-shopu) a pak zase poběží i offline.</p>
<button onclick="location.reload()">Zkusit znovu</button></div></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });
}

async function handlePage(req) {
  const cache = await caches.open(META);
  try {
    const res = await withTimeout(fetch(req), 10000);
    // přesměrování = nepřihlášený nebo bez nákupu → prohlížeč půjde na přihlášení / Můj účet
    if (res.type === 'opaqueredirect' || res.redirected) return res;
    if (res.ok && (res.headers.get('Content-Type') || '').includes('text/html')) {
      const days = parseInt(res.headers.get('X-SVHVL-Offline-Days') || '', 10) || DEFAULT_DAYS;
      await cache.put(PAGE_KEY, res.clone());
      await writeLease(days);
      return res;
    }
    if (res.status < 500) return res; // 4xx vrátit tak, jak jsou
    throw new Error('server ' + res.status);
  } catch (e) { // offline / výpadek serveru → z cache, jen v rámci povolené doby bez ověření
    const lease = await readLease(), page = await cache.match(PAGE_KEY);
    if (lease && page && Date.now() - lease.t < (lease.days || DEFAULT_DAYS) * 864e5) return page;
    return lockedPage(lease);
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return; // REST API, přihlášení atd. jdou normálně na síť
  if (req.mode === 'navigate') { e.respondWith(handlePage(req)); return; }
  if (req.url.split('?')[0].endsWith('/sw.js')) return;
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req.url.split('?')[0], cp)); }
    return res;
  })));
});
