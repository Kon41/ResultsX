const CACHE_NAME = 'result-watch-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for app shell, network-first for data.json so date info stays fresh
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('data.json')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// Let the page ask the service worker to fire a system-level notification
// (this shows even if the PWA window isn't focused).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});

// Best-effort: only fires on Android Chrome when installed AND the browser
// decides conditions (battery, network, usage) allow it. Not guaranteed.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-result-status') {
    event.waitUntil(
      fetch('./data.json?ts=' + Date.now())
        .then((res) => res.json())
        .then((data) => {
          if (data.resultDeclared) {
            return self.registration.showNotification('CBSE Class 10 Second Board Result is OUT', {
              body: 'The result has been marked as declared. Open the app for official links.',
              icon: 'icons/icon-192.png',
              badge: 'icons/icon-192.png',
              vibrate: [200, 100, 200, 100, 200],
              tag: 'result-declared',
              requireInteraction: true
            });
          }
        })
        .catch(() => {})
    );
  }
});
