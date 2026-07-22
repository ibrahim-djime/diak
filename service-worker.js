const CACHE_NAME = "lumesys-cache-v7";

// ============================================================
// RESSOURCES À PRÉCHARGER
// ============================================================

const urlsToCache = [
  "./",
  "./index.html",
  "./index_en.html",
  "./messagerie.html",
  "./page5.html",

  "./style4.css",
  "./messagerie.css",
  "./policescu.css",

  "./scripts.js",
  "./scripts2.js",
  "./messagerie.js",

  "./images/icon-192x192.png",
  "./images/icon-512x512.png",
  "./images/lumesys.png",
  "./images/lumesys.jpg",
  "./logo/ls.png",

  "./pol/INGAME.ttf",
  "./pol/Robot-Rebels.ttf",
  "./pol/Roboto-Regular.ttf",
  "./pol/Boul.otf",
  "./pol/PlayfairDisplaySC-Bold.ttf",
  "./pol/Sobatyan-Regular.otf",
  "./pol/Roboto-MediumItalic.ttf",
  "./pol/MilestoneBrush.otf",
  "./pol/Rostack.otf",
  "./pol/Roboto-Black.ttf",
  "./pol/Matemasie-Regular.ttf",
  "./pol/NewAmsterdam-Regular.ttf",
  "./pol/NerkoOne-Regular.ttf",
  "./pol/Roboto-Bold.ttf",
  "./pol/DMSerifText-Regular.ttf"
];

console.log("✅ Service Worker chargé");

// ============================================================
// INSTALLATION
// ============================================================

self.addEventListener("install", function (event) {

  console.log("📦 Installation du Service Worker");

  event.waitUntil(

    caches.open(CACHE_NAME).then(function (cache) {

      return Promise.all(

        urlsToCache.map(function (url) {

          return fetch(url, {
            cache: "no-cache"
          })

          .then(function (response) {

            if (!response.ok) {
              console.warn("⚠️ Ressource non disponible :", url);
              return;
            }

            return cache.put(url, response);

          })

          .catch(function (error) {

            console.warn(
              "⚠️ Impossible de mettre en cache :",
              url,
              error
            );

          });

        })

      );

    })

    .then(function () {

      console.log("✅ Installation terminée");

      return self.skipWaiting();

    })

  );

});

// ============================================================
// ACTIVATION
// ============================================================

self.addEventListener("activate", function (event) {

  console.log("🚀 Activation du Service Worker");

  event.waitUntil(

    caches.keys().then(function (cacheNames) {

      return Promise.all(

        cacheNames.map(function (cacheName) {

          if (cacheName !== CACHE_NAME) {

            console.log(
              "🗑️ Suppression ancien cache :",
              cacheName
            );

            return caches.delete(cacheName);

          }

        })

      );

    })

    .then(function () {

      return self.clients.claim();

    })

    .then(function () {

      console.log("✅ Service Worker actif");

    })

  );

});

// ============================================================
// INTERCEPTION DES REQUÊTES
// ============================================================

self.addEventListener("fetch", function (event) {

  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestURL = new URL(request.url);

  if (requestURL.origin !== self.location.origin) {
    return;
  }

  event.respondWith(

    caches.match(request).then(function (cachedResponse) {

      // ========================================================
      // CAS 1 : RESSOURCE PRÉSENTE DANS LE CACHE
      // ========================================================

      if (cachedResponse) {

        event.waitUntil(

          fetch(request)

            .then(function (networkResponse) {

              if (
                networkResponse &&
                networkResponse.ok
              ) {

                return caches.open(CACHE_NAME)

                  .then(function (cache) {

                    return cache.put(
                      request,
                      networkResponse
                    );

                  });

              }

            })

            .catch(function () {

              console.log(
                "📴 Mise à jour impossible hors connexion"
              );

            })

        );

        return cachedResponse;

      }

      // ========================================================
      // CAS 2 : RESSOURCE ABSENTE DU CACHE
      // ========================================================

      return fetch(request)

        .then(function (networkResponse) {

          if (
            networkResponse &&
            networkResponse.ok
          ) {

            const responseClone =
              networkResponse.clone();

            caches.open(CACHE_NAME)

              .then(function (cache) {

                cache.put(
                  request,
                  responseClone
                );

              });

          }

          return networkResponse;

        })

        .catch(function () {

          // ====================================================
          // CAS 3 : HORS CONNEXION
          // ====================================================

          return caches.match("./index.html");

        });

    })

  );

});
