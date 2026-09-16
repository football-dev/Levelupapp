// Minimal offline shell cache. CI stamps __BUILD__ with the deployed commit,
// so every deploy is a new service worker and installed apps can detect it.
const BUILD = '__BUILD__';
const CACHE_VERSION = `levelling-up-${BUILD}`;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/db.js',
  './js/xp.js',
  './js/dates.js',
  './js/backup.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// Install pre-caches the new shell but waits: the page decides when to switch
// over (via SKIP_WAITING) so an update never reloads someone mid-tap.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (type === 'REFRESH_SHELL') {
    // Re-fetch every shell file straight from the network into the current cache.
    const reply = (ok) => event.ports[0] && event.ports[0].postMessage({ ok });
    event.waitUntil(
      caches.open(CACHE_VERSION)
        .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
        .then(() => reply(true), () => reply(false)),
    );
  } else if (type === 'GET_BUILD') {
    if (event.ports[0]) event.ports[0].postMessage({ build: BUILD });
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first for same-origin GETs, refreshing the cache in the background
// (stale-while-revalidate) so updates land on the launch after next.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      return res || (request.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    }),
  );
});
