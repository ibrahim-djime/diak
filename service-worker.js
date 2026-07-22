const CACHE_NAME = 'lumesys-cache-v4';

// ============================================================
// RESSOURCES ESSENTIELLES À METTRE EN CACHE
// ============================================================

const urlsToCache = [

// ============================================================
// PAGES PRINCIPALES
// ============================================================

'./',
'./index.html',
'./index_en.html',
'./messagerie.html',
'./page5.html',

// ============================================================
// STYLES
// ============================================================

'./style4.css',
'./messagerie.css',
'./policescu.css',

// ============================================================
// SCRIPTS
// ============================================================

'./scripts.js',
'./scripts2.js',
'./messagerie.js',

// ============================================================
// LOGOS ET IMAGES
// ============================================================

'./images/icon-192x192.png',
'./images/icon-512x512.png',
'./images/lumesys.png',
'./images/lumesys.jpg',
'./logo/ls.png',

// ============================================================
// POLICES
// ============================================================

'./pol/INGAME.ttf',
'./pol/Robot-Rebels.ttf',
'./pol/Roboto-Regular.ttf',
'./pol/Boul.otf',
'./pol/PlayfairDisplaySC-Bold.ttf',
'./pol/Sobatyan-Regular.otf',
'./pol/Roboto-MediumItalic.ttf',
'./pol/MilestoneBrush.otf',
'./pol/Rostack.otf',
'./pol/Roboto-Black.ttf',
'./pol/Matemasie-Regular.ttf',
'./pol/NewAmsterdam-Regular.ttf',
'./pol/NerkoOne-Regular.ttf',
'./pol/Roboto-Bold.ttf',
'./pol/DMSerifText-Regular.ttf'

];

// ============================================================
// INSTALLATION
// ============================================================

self.addEventListener('install', (event) => {

event.waitUntil(

```
caches.open(CACHE_NAME)

  .then(async (cache) => {

    // On essaie de mettre chaque fichier en cache
    // individuellement afin qu'une ressource manquante
    // n'empêche pas tout le Service Worker de fonctionner.

    for (const url of urlsToCache) {

      try {

        const response = await fetch(url);

        if (response.ok) {

          await cache.put(url, response);

          console.log(
            '✅ Ressource mise en cache :',
            url
          );

        } else {

          console.warn(
            '⚠️ Ressource introuvable :',
            url
          );

        }

      } catch (error) {

        console.warn(
          '⚠️ Impossible de mettre en cache :',
          url
        );

      }

    }

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

          console.log(
            '🗑️ Suppression ancien cache :',
            cacheName
          );

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

// ============================================================
// UNIQUEMENT LES REQUÊTES GET
// ============================================================

if (request.method !== 'GET') {

```
return;
```

}

// ============================================================
// UNIQUEMENT LES RESSOURCES DU SITE
// ============================================================

const requestURL = new URL(request.url);

const isSameOrigin =
requestURL.origin === self.location.origin;

if (!isSameOrigin) {

```
return;
```

}

// ============================================================
// CACHE FIRST + MISE À JOUR EN ARRIÈRE-PLAN
// ============================================================

event.respondWith(

```
caches.match(request)

  .then((cachedResponse) => {


    // ========================================================
    // CAS 1 : LA RESSOURCE EXISTE DANS LE CACHE
    // ========================================================

    if (cachedResponse) {


      // ------------------------------------------------------
      // MISE À JOUR SILENCIEUSE
      // ------------------------------------------------------

      fetch(request)

        .then((networkResponse) => {

          if (

            networkResponse &&

            networkResponse.ok

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

          // Pas de connexion :
          // la version locale reste disponible.

        });


      // ------------------------------------------------------
      // AFFICHAGE IMMÉDIAT
      // ------------------------------------------------------

      return cachedResponse;

    }


    // ========================================================
    // CAS 2 : LA RESSOURCE N'EST PAS ENCORE DANS LE CACHE
    // ========================================================

    return fetch(request)

      .then((networkResponse) => {


        if (

          !networkResponse ||

          !networkResponse.ok

        ) {

          return networkResponse;

        }


        // ----------------------------------------------------
        // ENREGISTREMENT AUTOMATIQUE
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


        // ====================================================
        // FALLBACK HORS CONNEXION
        // ====================================================

        return caches.match('./index.html');

      });

  })
```

);

});
