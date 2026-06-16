// WebRSS Service Worker — offline-first app shell cache
// Paths are RELATIVE to the SW's own scope so the app works under a
// GitHub Pages subpath like username.github.io/WebRSS/ as well as at a root.
const CACHE_NAME = 'webrss-v2';
// './' resolves against the registration scope (the folder sw.js lives in).
const APP_SHELL  = ['./', './index.html', './manifest.json'];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cross-origin hosts we DO want to cache at runtime so the app keeps working
// offline. The Nostr crypto library is loaded from jsdelivr as an ES module;
// without caching it, offline auto-login (which needs to sign/derive keys)
// would fail. We deliberately do NOT cache feed proxies or Blossom (those
// should always hit the network and have their own offline fallback in-app).
const RUNTIME_CACHE_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);
  if (evt.request.method !== 'GET') return;

  const sameOrigin = url.origin === self.location.origin;
  const cacheableCrossOrigin = RUNTIME_CACHE_HOSTS.includes(url.hostname);

  // Anything else (RSS proxy, Blossom, favicons, Nostr relays) → let it go
  // straight to the network untouched.
  if (!sameOrigin && !cacheableCrossOrigin) return;

  evt.respondWith(
    caches.match(evt.request).then(cached => {
      if (cached) {
        // Cache-first: serve immediately, refresh in the background.
        fetch(evt.request).then(response => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(evt.request).then(response => {
        if (response && (response.status === 200 || response.type === 'opaque')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone));
        }
        return response;
      }).catch(() => cached); // last resort if truly offline and uncached
    })
  );
});
