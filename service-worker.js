const CACHE_NAME = 'lumesys-cache-v3';

const urlsToCache = [

// ============================================================
// PAGES PRINCIPALES
// ============================================================

'/',
'/index.html',
'/index_en.html',
'/messagerie.html',
'/page5.html',

// ============================================================
// STYLES
// ============================================================

'/style4.css',
'/messagerie.css',
'/policescu.css',

// ============================================================
// SCRIPTS
// ============================================================

'/scripts.js',
'/scripts2.js',
'/messagerie.js',

// ============================================================
// LOGOS ET IMAGES
// ============================================================

'/images/icon-192x192.png',
'/images/icon-512x512.png',
'/images/lumesys.png',
'/images/lumesys.jpg',
'/logo/ls.png',

// ============================================================
// POLICES
// ============================================================

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

// ============================================================
// INSTALLATION
// ============================================================

self.addEventListener('install', (event) => {

event.waitUntil(

```
caches.open(CACHE_NAME)

  .then((cache) => {

    return cache.addAll(urlsToCache);

  })

  .then(() => {

    return self.skipWaiting();

  })
```

);

});

// ============================================================
// ACTIVATION
// ============================================================

self.addEventListener('activate', (event) => {

event.waitUntil(

```
caches.keys()

  .then((cacheNames) => {

    return Promise.all(

      cacheNames.map((cacheName) => {

        if (cacheName !== CACHE_NAME) {

          return caches.delete(cacheName);

        }

      })

    );

  })

  .then(() => {

    return self.clients.claim();

  })
```

);

});

// ============================================================
// FETCH
// ============================================================

self.addEventListener('fetch', (event) => {

const request = event.request;

// ------------------------------------------------------------
// TRAITER UNIQUEMENT LES REQUÊTES GET
// ------------------------------------------------------------

if (request.method !== 'GET') {

```
return;
```

}

// ------------------------------------------------------------
// NE PAS INTERCEPTER CERTAINES REQUÊTES EXTERNES
// ------------------------------------------------------------

const requestURL = new URL(request.url);

const isSameOrigin =
requestURL.origin === self.location.origin;

// Pour les requêtes externes, on laisse le navigateur gérer
if (!isSameOrigin) {

```
return;
```

}

// ------------------------------------------------------------
// CACHE FIRST + MISE À JOUR EN ARRIÈRE-PLAN
// ------------------------------------------------------------

event.respondWith(

```
caches.match(request)

  .then((cachedResponse) => {

    // ========================================================
    // CAS 1 : LA RESSOURCE EXISTE DÉJÀ DANS LE CACHE
    // ========================================================

    if (cachedResponse) {

      // ------------------------------------------------------
      // MISE À JOUR SILENCIEUSE EN ARRIÈRE-PLAN
      // ------------------------------------------------------

      fetch(request)

        .then((networkResponse) => {

          if (

            networkResponse &&

            networkResponse.status === 200 &&

            networkResponse.type === 'basic'

          ) {

            caches.open(CACHE_NAME)

              .then((cache) => {

                cache.put(

                  request,

                  networkResponse.clone()

                );

              });

          }

        })

        .catch(() => {

          // Internet indisponible :
          // on conserve la version existante du cache

        });

      // ------------------------------------------------------
      // AFFICHAGE IMMÉDIAT DE LA VERSION EN CACHE
      // ------------------------------------------------------

      return cachedResponse;

    }

    // ========================================================
    // CAS 2 : LA RESSOURCE N'EXISTE PAS ENCORE DANS LE CACHE
    // ========================================================

    return fetch(request)

      .then((networkResponse) => {

        if (

          !networkResponse ||

          networkResponse.status !== 200 ||

          networkResponse.type !== 'basic'

        ) {

          return networkResponse;

        }

        // ----------------------------------------------------
        // COPIE DE LA RÉPONSE POUR LE CACHE
        // ----------------------------------------------------

        const responseToCache =
          networkResponse.clone();

        caches.open(CACHE_NAME)

          .then((cache) => {

            cache.put(

              request,

              responseToCache

            );

          });

        return networkResponse;

      })

      .catch(() => {

        // ----------------------------------------------------
        // SI INTERNET EST ABSENT
        // ----------------------------------------------------

        return caches.match('/index.html');

      });

  })
```

);

});
