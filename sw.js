const CACHE = 'apex-v9-20260528-0008';
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
  // Let the browser handle external requests (APIs, CDN, OAuth) without interference
  if (!e.request.url.startsWith(self.registration.scope)) return;

  // Network-first for our own files: always try the local server,
  // fall back to SW cache only when offline.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || new Response('', { status: 404 })))
  );
});
