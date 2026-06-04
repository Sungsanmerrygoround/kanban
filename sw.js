// Service worker: caches app shell, serves offline, network-first when online.

const CACHE = 'kanban-v24';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-512.png',
  './src/main.js',
  './src/state.js',
  './src/refresh.js',
  './src/sidebar.js',
  './src/board.js',
  './src/cards.js',
  './src/modal.js',
  './src/archive.js',
  './src/utils.js',
  './src/auth.js',
  './src/sync.js',
  './src/firebase.js',
  './src/firebase-config.js',
  './src/notifications.js',
  './src/calendar.js',
  './src/query.js',
  './src/dashboard.js',
  './src/palette.js',
  './src/filterbar.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only intercept same-origin requests — let Firebase / gstatic go straight to network.
  if (url.origin !== self.location.origin) return;

  // Network-first: get fresh code when online, fall back to cache when offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match('./index.html')))
  );
});
