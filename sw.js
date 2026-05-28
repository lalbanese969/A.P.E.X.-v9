// Bump this string on every deploy so the activate handler purges the old cache.
// Format: apex-v9-YYYYMMDD-HHMM  (update the date/time when you push)
const CACHE = 'apex-v9-20260528-0001';
const ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './honeycomb.js',
  './memory.js',
  './ai.js',
  './auth.js',
  './chat.js',
  './email.js',
  './calendar.js',
  './settings.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', e => {
  // Use individual adds so one missing file doesn't kill the whole install
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(ASSETS.map(a => c.add(a)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first: always try network, cache result, fall back to cache if offline
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() =>
      caches.match(e.request).then(cached => cached || new Response('', { status: 404 }))
    )
  );
});
