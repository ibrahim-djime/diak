const CACHE_NAME = "lumesys-cache-v6";

// ============================================================
// RESSOURCES À PRÉCHARGER
// ============================================================

const urlsToCache = [

  // Pages
  "./",
  "./index.html",
  "./index_en.html",
  "./messagerie.html",
  "./page5.html",

  // Styles
  "./style4.css",
  "./messagerie.css",
  "./policescu.css",

  // Scripts
  "./scripts.js",
  "./scripts2.js",
  "./messagerie.js",

  // Images
  "./images/icon-192x192.png",
  "./images/icon-512x512.png",
  "./images/lumesys.png",
  "./images/lumesys.jpg",
  "./logo/ls.png",

  // Polices
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

self.addEventListener("install", (event) => {

  console.log("📦 Installation du Service Worker");

  event.waitUntil(

    (async () => {

      const cache = await caches.open(CACHE_NAME);

      for (const url of urlsToCache) {

        try {

          const response = await fetch(url, {
            cache: "no-cache"
          });

          if (response && response.ok) {

            await cache.put(url, response.clone());

            console.log("✅ Mis en cache :", url);

          } else {

            console.warn("⚠️ Ressource non disponible :", url);

          }

        } catch (error) {

          console.warn("⚠️ Impossible de mettre en cache :", url, error);

        }

      }

      console.log("✅ Installation terminée");

      await self.skipWaiting();

    })()

  );

});

// ============================================================
// ACTIVATION
// ============================================================

self.addEventListener("activate", (event) => {

  console.log("🚀 Activation du Service Worker");

  event.waitUntil(

    (async () => {

      const cacheNames = await caches.keys();

      await Promise.all(

        cacheNames.map((cacheName) => {

          if (cacheName !== CACHE_NAME) {

            console.log("🗑️ Suppression ancien cache :", cacheName);

            return caches.delete(cacheName);

          }

        })

      );

      await self.clients.claim();

      console.log("✅ Service Worker actif");

    })()

  );

});

// ============================================================
// INTERCEPTION DES REQUÊTES
// ============================================================

self.addEventListener("fetch", (event) => {

  const request = event.request;

  // ------------------------------------------------------------
  // Uniquement les requêtes GET
  // ------------------------------------------------------------

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // ------------------------------------------------------------
  // Uniquement les ressources du même domaine
  // ------------------------------------------------------------

  if (url.origin !== self.location.origin) return;

  event.respondWith(

    (async () => {

      const cache = await caches.open(CACHE_NAME);

      const cachedResponse = await cache.match(request);

      // ========================================================
      // CAS 1 : RESSOURCE DÉJÀ EN CACHE
      // ========================================================

      if (cachedResponse) {

        // Mise à jour en arrière-plan
        event.waitUntil(

          fetch(request)

            .then(async (networkResponse) => {

              if (networkResponse && networkResponse.ok) {

                await cache.put(
                  request,
                  networkResponse.clone()
                );

                console.log("🔄 Cache mis à jour :", request.url);

              }

            })

            .catch(() => {

              // Pas de connexion : on garde le cache

            })

        );

        // Affichage immédiat
        return cachedResponse;

      }

      // ========================================================
      // CAS 2 : RESSOURCE NON EN CACHE
      // ========================================================

      try {

        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.ok) {

          await cache.put(
            request,
            networkResponse.clone()
          );

          console.log("💾 Ajout automatique au cache :", request.url);

        }

        return networkResponse;

      }

      // ========================================================
      // CAS 3 : HORS CONNEXION
      // ========================================================

      catch (error) {

        console.warn("📴 Hors connexion :", request.url);

        const offlinePage = await cache.match("./index.html");

        if (offlinePage) {

          return offlinePage;

        }

        return new Response(
          "Aucune connexion Internet.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain"
            }
          }
        );

      }

    })()

  );

});
