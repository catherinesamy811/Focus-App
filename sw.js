// Cache version — bump this to force-evict all cached CDN assets across sessions.
// Own-origin assets (HTML/JS/CSS) are always fetched fresh so they don't need a bump.
const CACHE = 'focus-v3';

// ─── Install ──────────────────────────────────────────────────────────────────
// No pre-caching here. Pre-caching during install is intercepted by the
// currently-active old SW's fetch handler, which returns stale cached content —
// defeating the entire purpose. Assets are cached lazily on first network fetch.
self.addEventListener('install', () => {
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
// Delete every cache except the current version, then claim all open clients so
// this SW controls pages that were loaded before it activated.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Own-origin assets: network-first.
  // Cache is populated on every successful fetch and serves as the offline
  // fallback only. This guarantees every online load gets the latest deployment.
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // CDN assets (fonts, FullCalendar, Supabase): stale-while-revalidate.
  // These are version-locked by URL so serving from cache is safe.
  if (isCDN(url)) {
    e.respondWith(staleWhileRevalidate(e.request));
  }
});

// ─── Strategies ───────────────────────────────────────────────────────────────

function isCDN(url) {
  return (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'    ||
    url.hostname === 'cdn.jsdelivr.net'
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // cache: 'no-cache' bypasses the HTTP cache layer and sends a conditional
    // request to the origin. Vercel responds with 304 (fast) when unchanged,
    // or the new asset when it changed. This prevents double-caching problems.
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Navigation fallback: serve the cached shell when fully offline
    if (request.mode === 'navigate') {
      return cache.match('/index.html');
    }
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fromNet = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fromNet;
}
