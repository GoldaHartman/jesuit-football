/* Offline cache. Stadium wifi is unreliable and half these venues are a
   concrete bowl, so the whole app is cached on first visit.

   BUILD is stamped by tools/build_web_data.py from a hash of the actual file
   contents — don't edit it by hand. Changing it both names a new cache and
   changes every asset URL, so phones cannot serve a stale schedule. */

const BUILD = 'c57d342e749a';

const CACHE = `jesuit-fb-${BUILD}`;

const ASSETS = [
  './',
  './index.html',
  `./style.css?v=${BUILD}`,
  `./app.js?v=${BUILD}`,
  `./data.js?v=${BUILD}`,
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first so a redeployed schedule reaches phones, falling back to
   cache when the stadium wifi gives up. */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
  );
});
