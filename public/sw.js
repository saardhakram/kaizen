/* Kaizen service worker: lets the app open with no connection.
   It only touches this site's own files and Google Fonts. Requests to your database are never intercepted. */
const CACHE = 'kaizen-shell-v1';
const ROOT = self.registration.scope;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!own && !fonts) return; // the database and everything else go straight to the network
  if (req.mode === 'navigate') return void e.respondWith(openPage(req, e));
  if (own && url.pathname.includes('/assets/')) return void e.respondWith(cacheFirst(req)); // file names change with every build
  e.respondWith(staleWhileRevalidate(req));
});

/** The page itself: fresh from the network when possible, the saved copy when offline or slow. */
async function openPage(req, e) {
  const cache = await caches.open(CACHE);
  const saved = (await cache.match(req)) || (await cache.match(ROOT));
  const fresh = fetch(req).then((res) => {
    if (res.ok) {
      cache.put(req, res.clone());
      cache.put(ROOT, res.clone());
    }
    return res;
  });
  if (!saved) return fresh; // first ever visit
  e.waitUntil(fresh.catch(() => undefined));
  return Promise.race([fresh, new Promise((r) => setTimeout(() => r(saved), 3500))]).catch(() => saved);
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || net;
}
