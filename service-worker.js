self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('lumesys-cache').then((cache) => {
      return cache.addAll([
        '/index.html',
        '/styles.css',
        '/scripts.js',
        '/images/icon-192x192.png',
        '/images/icon-512x512.png'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
