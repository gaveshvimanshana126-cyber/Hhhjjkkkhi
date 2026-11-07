/* ══════════════════════════════════════════════════════════════════════════
   MovieMania LK — Service Worker
   Required for PWA installability: Chrome/Edge only fire `beforeinstallprompt`
   when the site has a registered service worker that handles `fetch`.

   Kept deliberately conservative so it can never break the site:
   • HTML pages      → network first, cached shell only as an offline fallback
   • /api/*          → never touched (always straight to the network)
   • images / fonts  → cache first (safe to serve from cache)
   • everything else → untouched, browser handles it normally
   ══════════════════════════════════════════════════════════════════════════ */

const CACHE = 'mm-static-v1';

// Small, safe precache. Each item is added individually so one failure
// (e.g. a 404) can never abort the whole service-worker install.
const PRECACHE = [
  '/index.html',
  '/manifest.webmanifest',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const isCacheableAsset = (path) =>
  /^\/(icons|ads)\//.test(path) ||
  /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i.test(path);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only plain GETs are cacheable; POST/PUT/etc. and range requests pass through.
  if (request.method !== 'GET' || request.headers.has('range')) return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // Third-party (ads, analytics, TMDB, fonts CDN…) — never intercept.
  if (url.origin !== self.location.origin) return;

  // API responses must always be fresh.
  if (url.pathname.startsWith('/api/')) return;

  // Pages: network first, cached shell only when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then(
          (hit) =>
            hit ||
            caches.match('/index.html').then((shell) => shell || Response.error())
        )
      )
    );
    return;
  }

  // Images / fonts / banners: cache first, then network (and store a copy).
  if (isCacheableAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === 'basic') {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => Response.error());
      })
    );
  }
});
