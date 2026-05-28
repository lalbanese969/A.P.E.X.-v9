const CACHE = 'apex-v9-20260528-0002';
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
      // cache:'reload' bypasses the HTTP cache so pre-cached files are always fresh
      Promise.allSettled(ASSETS.map(a => c.add(new Request(a, { cache: 'reload' }))))
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
  const url = e.request.url;
  const scope = self.registration.scope;

  // For our own app files: bypass HTTP cache so the browser never serves stale JS/CSS.
  // Falls back to SW cache only when offline.
  if (url.startsWith(scope) && !url.includes('?')) {
    e.respondWith(
      fetch(new Request(e.request, { cache: 'no-cache' }))
        .then(res => {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || new Response('', { status: 404 })))
    );
    return;
  }

  // For external requests (fonts, CDN, APIs): pass through without intercepting
  // so we don't accidentally cache or block OAuth/API calls.
  if (!url.startsWith(scope)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || new Response('', { status: 404 })))
  );
});
