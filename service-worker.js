const CACHE_NAME = 'lumesys-cache-v1';
const urlsToCache = [
  '/index.html',
  '/index_en.html',
  '/style4.css',
  '/scripts.js',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png',
  '/images/lumesys.png',
  '/images/lumesys.jpg',
  '/logo/ls.png',
  '/pol/INGAME.ttf',
  '/pol/Robot-Rebels.ttf',
  '/pol/Roboto-Regular.ttf',
  '/pol/Boul.otf',
  '/pol/PlayfairDisplaySC-Bold.ttf',
  '/pol/Sobatyan-Regular.otf',
  '/pol/Roboto-MediumItalic.ttf',
  '/pol/MilestoneBrush.otf',
  '/pol/Rostack.otf',
  '/pol/Roboto-Black.ttf',
  '/pol/Matemasie-Regular.ttf',
  '/pol/NewAmsterdam-Regular.ttf',
  '/pol/NerkoOne-Regular.ttf',
  '/pol/Roboto-Bold.ttf',
  '/pol/DMSerifText-Regular.ttf'
];

// INSTALL : mettre en cache tous les fichiers essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE : supprimer les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// FETCH : répondre avec le cache d'abord, sinon réseau
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});
