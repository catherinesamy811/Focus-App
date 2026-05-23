const CACHE = 'focus-v1';

// App shell — cached on install for instant offline load
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: pre-cache the app shell ───────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete stale caches ──────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Same-origin assets: cache-first, network fallback, then cache the response
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          }
          return res;
        }).catch(() => {
          // Navigation fallback: serve index.html when offline
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
    );
    return;
  }

  // CDN assets (fonts, FullCalendar): stale-while-revalidate
  const isCDN =
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'    ||
    url.hostname === 'cdn.jsdelivr.net';

  if (isCDN) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((cached) => {
          const fromNet = fetch(e.request).then((res) => {
            if (res && res.status === 200) c.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fromNet;
        })
      )
    );
  }
});