
console.log("✅ JavaScript chargé avec succès");

/* =======================================================
   ACCUEIL PERSONNALISÉ
   ======================================================= */

(function () {
  let welcomeUser = null;
  let welcomeProfile = null;

  function shortName(value) {
    const name = String(value || "").trim();
    if (!name || name.includes("@")) return "";
    return name.split(/\s+/)[0].replace(/[,.]+$/, "");
  }

  function safePhotoUrl(value) {
    try {
      const url = new URL(String(value || ""), document.baseURI);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function renderWelcome() {
    const welcome = document.getElementById("accueil-bienvenue");
    if (!welcome) return;

    const hour = new Date().getHours();
    const greeting = hour >= 5 && hour < 18 ? "Bonjour" : "Bonsoir";
    const user = welcomeUser && !welcomeUser.isAnonymous ? welcomeUser : null;
    const profile = welcomeProfile || {};

    const name = shortName(user && user.displayName)
      || shortName(profile.prenom)
      || shortName(profile.firstName)
      || shortName(profile.nom);

    const photoUrl = safePhotoUrl(profile.photo)
      || safePhotoUrl(profile.photoURL)
      || safePhotoUrl(user && user.photoURL);

    const message = welcome.querySelector(".accueil-bienvenue-message");
    const avatar = welcome.querySelector(".accueil-bienvenue-avatar");
    const image = welcome.querySelector(".accueil-bienvenue-photo");

    if (message) {
      message.textContent = greeting + (name ? " " + name : "");
    }

    if (!avatar || !image) return;

    if (!photoUrl) {
      image.hidden = true;
      image.removeAttribute("src");
      image.dataset.photoUrl = "";
      avatar.hidden = false;
      return;
    }

    if (image.dataset.photoUrl === photoUrl) {
      if (image.complete && image.naturalWidth > 0) {
        image.hidden = false;
        avatar.hidden = true;
      }
      return;
    }

    image.hidden = true;
    avatar.hidden = false;
    image.dataset.photoUrl = photoUrl;

    image.onload = function () {
      if (image.dataset.photoUrl !== photoUrl) return;
      image.hidden = false;
      avatar.hidden = true;
    };

    image.onerror = function () {
      if (image.dataset.photoUrl !== photoUrl) return;
      image.hidden = true;
      image.removeAttribute("src");
      image.dataset.photoUrl = "";
      avatar.hidden = false;
    };

    image.src = photoUrl;
  }

  window.actualiserAccueilPersonnalise = function (user, profile) {
    if (arguments.length) {
      welcomeUser = user || null;
      welcomeProfile = profile || null;
    }

    renderWelcome();
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderWelcome();
    window.setInterval(renderWelcome, 60000);
  }, { once: true });

})();


/* =======================================================
   SERVICE WORKER - MODE HORS CONNEXION
   ======================================================= */

if ("serviceWorker" in navigator) {

  window.addEventListener("load", () => {

    navigator.serviceWorker
      .register("service-worker.js")

      .then((registration) => {

        console.log(
          "✅ Service Worker enregistré avec succès :",
          registration.scope
        );

      })

      .catch((error) => {

        console.error(
          "❌ Erreur lors de l’enregistrement du Service Worker :",
          error
        );

      });

  });

}


/* =======================================================
   1. GESTION DU CHAMP DE RECHERCHE ET DES SUGGESTIONS
   ======================================================= */

document.addEventListener("DOMContentLoaded", async function () {

  const searchInput =
    document.getElementById("search-input");

  const suggestionsContainer =
    document.getElementById("suggestions");

  const searchButton =
    document.getElementById("search-button");


  /* =====================================================
     VÉRIFICATION DES ÉLÉMENTS
     ===================================================== */

  if (
    !searchInput ||
    !suggestionsContainer ||
    !searchButton
  ) {

    console.warn(
      "⚠️ Éléments de recherche introuvables."
    );

    return;

  }


  /* =====================================================
     TABLEAU QUI CONTIENDRA TOUTES LES SUGGESTIONS
     ===================================================== */

  let suggestionLinks = [];


  /* =====================================================
     ÉTAT DU CHARGEMENT
     ===================================================== */

  let suggestionsLoaded = false;


  /* =====================================================
     INDEX DE LA SUGGESTION SÉLECTIONNÉE
     ===================================================== */

  let selectedSuggestionIndex = -1;


  /* =====================================================
     PARAMÈTRES DU CHARGEMENT
     ===================================================== */

  const MAX_FILES = 100;

  const MAX_CONSECUTIVE_NO_NEW = 5;

  const REQUEST_TIMEOUT_MS = 15000;


  /* =====================================================
     NORMALISATION DES SUGGESTIONS
     ===================================================== */

  function normalizeSuggestionText(value) {

    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("fr");

  }


  /* =====================================================
     IDENTIFICATION DES SUGGESTIONS UNIQUES
     ===================================================== */

  function getSuggestionKey(href, text) {

    try {

      const destination = new URL(
        href,
        document.baseURI
      );

      // Retirer le fragment pour éviter de compter
      // deux fois la même destination.
      destination.hash = "";

      return (
        destination.href +
        "\u0000" +
        normalizeSuggestionText(text)
      );

    }

    catch (error) {

      return null;

    }

  }


  /* =====================================================
     EMPREINTE DU CONTENU D'UN FICHIER
     PERMET DE REPÉRER LES RÉPONSES RÉPÉTÉES
     ===================================================== */

  function getContentFingerprint(content) {

    let hash = 2166136261;

    for (let i = 0; i < content.length; i++) {

      hash ^= content.charCodeAt(i);

      hash = Math.imul(hash, 16777619);

    }

    return (
      content.length +
      "-" +
      (hash >>> 0).toString(16)
    );

  }


  /* =====================================================
     CHARGEMENT AUTOMATIQUE DES FICHIERS

     Le script cherche :

     suggestions1.html
     suggestions2.html
     suggestions3.html
     suggestions4.html
     ...

     Il conserve toutes les suggestions uniques,
     même lorsque leur nombre dépasse 1 000.
     ===================================================== */

  async function loadSuggestions() {

    let numero = 1;

    let consecutiveNoNew = 0;

    let totalFiles = 0;

    let totalDuplicates = 0;

    let totalInvalides = 0;

    let lastFingerprint = "";

    let consecutiveIdentical = 0;

    let stopReason = "";

    const loadedSuggestions = [];

    const seenSuggestionKeys = new Set();


    /* ===================================================
       BOUCLE DE CHARGEMENT
       =================================================== */

    while (numero <= MAX_FILES) {

      const file =
        "suggestions" + numero + ".html";


      try {

        /* ==============================================
           AFFICHAGE DU PROGRÈS
           ============================================== */

        if (
          numero <= 10 ||
          numero % 25 === 0
        ) {

          console.log(
            "🔎 Recherche de : " + file
          );

        }


        /* ==============================================
           CONSTRUIRE LE CHEMIN CORRECT
           ============================================== */

        const fileURL =
          new URL(
            file,
            document.baseURI
          );


        /* ==============================================
           PROTECTION CONTRE LES REQUÊTES BLOQUÉES
           ============================================== */

        const controller = new AbortController();

        const timeoutId = window.setTimeout(
          () => controller.abort(),
          REQUEST_TIMEOUT_MS
        );

        let response;
        let html;

        try {

          response = await fetch(
            fileURL.href,
            {
              cache: "no-store",
              credentials: "same-origin",
              signal: controller.signal
            }
          );

          html = await response.text();

        }

        finally {

          window.clearTimeout(timeoutId);

        }


        /* ==============================================
           VÉRIFIER LA RÉPONSE HTTP
           ============================================== */

        if (!response.ok) {

          if (response.status === 404) {

            console.log(
              "🛑 " + file + " introuvable."
            );

            stopReason = "Premier fichier absent";

          }

          else {

            console.error(
              "❌ Erreur HTTP " +
              response.status +
              " pour " +
              file
            );

            stopReason = "Erreur HTTP " + response.status;

          }

          break;

        }


        /* ==============================================
           VÉRIFIER LES REDIRECTIONS
           ============================================== */

        if (response.redirected) {

          const finalURL = new URL(response.url);

          if (
            finalURL.origin !== fileURL.origin ||
            finalURL.pathname !== fileURL.pathname
          ) {

            console.warn(
              "⚠️ Redirection inattendue pour " + file
            );

            stopReason = "Redirection inattendue";

            break;

          }

        }


        /* ==============================================
           VÉRIFIER LE CONTENU
           ============================================== */

        if (
          !html ||
          !html.trim()
        ) {

          console.warn(
            "⚠️ Fichier vide : " + file
          );

          stopReason = "Fichier vide";

          break;

        }


        /* ==============================================
           DÉTECTER LES FICHIERS QUI RENVOIENT
           EXACTEMENT LE MÊME CONTENU
           ============================================== */

        const fingerprint =
          getContentFingerprint(html);


        if (
          fingerprint === lastFingerprint
        ) {

          consecutiveIdentical++;

        }

        else {

          consecutiveIdentical = 0;

        }


        lastFingerprint = fingerprint;


        if (
          consecutiveIdentical >= 2
        ) {

          console.warn(
            "🛑 Plusieurs fichiers successifs renvoient " +
            "exactement le même contenu."
          );

          console.warn(
            "⚠️ Arrêt pour éviter le chargement répété " +
            "d'une page de remplacement."
          );

          stopReason = "Contenu HTML répétitif";

          break;

        }


        /* ==============================================
           ANALYSER LE HTML
           ============================================== */

        const parsedDocument =
          new DOMParser().parseFromString(
            html,
            "text/html"
          );


        /* ==============================================
           RÉCUPÉRER LES LIENS <a>
           ============================================== */

        const links =
          parsedDocument.querySelectorAll("a[href]");


        /* ==============================================
           FICHIER EXISTANT MAIS SANS LIENS
           ============================================== */

        if (links.length === 0) {

          console.warn(
            "⚠️ " +
            file +
            " ne contient aucune balise <a>."
          );

          stopReason = "Aucun lien dans le fichier";

          break;

        }


        /* ==============================================
           AJOUTER LES SUGGESTIONS UNIQUES
           ============================================== */

        let nombreAjoutees = 0;

        let nombreDoublons = 0;

        let nombreInvalides = 0;


        links.forEach((link) => {

          const href =
            (link.getAttribute("href") || "").trim();

          const text =
            (link.textContent || "")
              .trim()
              .replace(/\s+/g, " ");


          /* ============================================
             IGNORER LES LIENS INCORRECTS
             ============================================ */

          if (
            !href ||
            !text
          ) {

            nombreInvalides++;

            return;

          }


          /* ============================================
             VALIDER LA DESTINATION
             ============================================ */

          const key =
            getSuggestionKey(href, text);

          if (!key) {

            nombreInvalides++;

            return;

          }


          const destination =
            new URL(href, document.baseURI);


          const allowedProtocols = [
            "http:",
            "https:",
            "mailto:",
            "tel:"
          ];


          if (
            !allowedProtocols.includes(
              destination.protocol
            )
          ) {

            nombreInvalides++;

            return;

          }


          /* ============================================
             ÉVITER LES DOUBLONS
             ============================================ */

          if (
            seenSuggestionKeys.has(key)
          ) {

            nombreDoublons++;

            return;

          }


          seenSuggestionKeys.add(key);


          /* ============================================
             ENREGISTRER LA SUGGESTION
             ============================================ */

          loadedSuggestions.push({

            href: href,

            text: text

          });


          nombreAjoutees++;

        });


        /* ==============================================
           METTRE À JOUR LES COMPTEURS
           ============================================== */

        totalFiles++;

        totalDuplicates += nombreDoublons;

        totalInvalides += nombreInvalides;


        /* ==============================================
           AFFICHER LE RÉSULTAT
           ============================================== */

        if (
          numero <= 10 ||
          numero % 25 === 0
        ) {

          console.log(
            "✅ " +
            file +
            " chargé : " +
            nombreAjoutees +
            " nouvelle(s) suggestion(s), " +
            nombreDoublons +
            " doublon(s)"
          );

        }


        /* ==============================================
           AUCUNE SUGGESTION VALIDE
           ============================================== */

        if (
          nombreAjoutees === 0 &&
          nombreDoublons === 0
        ) {

          console.warn(
            "⚠️ Aucune suggestion valide dans " + file
          );

          stopReason = "Aucune suggestion valide";

          break;

        }


        /* ==============================================
           DÉTECTER LES FICHIERS SANS NOUVELLES
           SUGGESTIONS
           ============================================== */

        if (nombreAjoutees === 0) {

          consecutiveNoNew++;

        }

        else {

          consecutiveNoNew = 0;

        }


        if (
          consecutiveNoNew >= MAX_CONSECUTIVE_NO_NEW
        ) {

          console.warn(
            "🛑 Arrêt : " +
            MAX_CONSECUTIVE_NO_NEW +
            " fichiers successifs sans nouvelle suggestion."
          );

          stopReason = "Fichiers sans nouvelles suggestions";

          break;

        }


        /* ==============================================
           PASSER AU FICHIER SUIVANT
           ============================================== */

        numero++;

      }


      catch (error) {

        if (error.name === "AbortError") {

          console.error(
            "⏱️ Délai dépassé pendant le chargement de " +
            file
          );

          stopReason = "Délai de chargement dépassé";

        }

        else {

          console.error(
            "❌ Erreur lors du chargement de " +
            file +
            " :",
            error
          );

          stopReason = "Erreur de chargement";

        }

        break;

      }

    }


    /* ===================================================
       LIMITE DE SÉCURITÉ ATTEINTE
       =================================================== */

    if (numero > MAX_FILES) {

      stopReason =
        "Limite de sécurité des fichiers atteinte";

      console.warn(
        "⚠️ Limite de " +
        MAX_FILES +
        " fichiers examinés."
      );

    }


    /* ===================================================
       ENREGISTRER LES SUGGESTIONS
       =================================================== */

    suggestionLinks =
      loadedSuggestions;

    suggestionsLoaded = true;


    /* ===================================================
       RAPPORT FINAL
       =================================================== */

    console.log(
      "=========================================="
    );

    console.log(
      "✅ CHARGEMENT DES SUGGESTIONS TERMINÉ"
    );

    console.log(
      "📁 Fichiers examinés : " +
      totalFiles
    );

    console.log(
      "✅ Suggestions uniques : " +
      suggestionLinks.length
    );

    console.log(
      "♻️ Doublons ignorés : " +
      totalDuplicates
    );

    console.log(
      "⚠️ Liens invalides ignorés : " +
      totalInvalides
    );

    console.log(
      "🛑 Motif d'arrêt : " +
      (stopReason || "Fin du chargement")
    );

    console.log(
      "=========================================="
    );

  }


  /* =====================================================
     CHARGEMENT INITIAL
     ===================================================== */

  await loadSuggestions();


  /* =====================================================
     MESSAGE SI AUCUNE SUGGESTION N'A ÉTÉ CHARGÉE
     ===================================================== */

  if (
    suggestionLinks.length === 0
  ) {

    console.warn(
      "⚠️ Aucune suggestion n'a été chargée."
    );

    console.warn(
      "⚠️ Vérifie que suggestions1.html existe."
    );

  }


  /* =====================================================
     SAISIE DANS LA BARRE DE RECHERCHE
     ===================================================== */

  searchInput.addEventListener(
    "input",
    function () {

      const query =
        removeAccents(
          searchInput.value
            .trim()
            .toLowerCase()
        );


      /* ================================================
         CHAMP VIDE
         ================================================ */

      if (
        query === ""
      ) {

        suggestionsContainer.style.display =
          "none";

        selectedSuggestionIndex = -1;

        return;

      }


      /* ================================================
         VÉRIFIER LE CHARGEMENT
         ================================================ */

      if (
        !suggestionsLoaded
      ) {

        console.log(
          "⏳ Les suggestions sont encore en cours de chargement..."
        );

        return;

      }


      /* ================================================
         RECHERCHER
         ================================================ */

      const suggestions =
        getSuggestions(query);


      /* ================================================
         AFFICHER
         ================================================ */

      displaySuggestions(suggestions);

    }
  );


  /* =====================================================
     NAVIGATION AVEC LES TOUCHES DU CLAVIER
     ===================================================== */

  searchInput.addEventListener(
    "keydown",
    function (event) {

      const suggestions =
        suggestionsContainer.getElementsByClassName(
          "suggestion-item"
        );


      /* ================================================
         AUCUNE SUGGESTION
         ================================================ */

      if (
        suggestions.length === 0
      ) {

        return;

      }


      /* ================================================
         FLÈCHE BAS
         ================================================ */

      if (
        event.key === "ArrowDown"
      ) {

        event.preventDefault();

        selectedSuggestionIndex =
          (
            selectedSuggestionIndex + 1
          ) % suggestions.length;

        updateSuggestionHighlight(suggestions);

      }


      /* ================================================
         FLÈCHE HAUT
         ================================================ */

      else if (
        event.key === "ArrowUp"
      ) {

        event.preventDefault();

        selectedSuggestionIndex =
          (
            selectedSuggestionIndex -
            1 +
            suggestions.length
          ) % suggestions.length;

        updateSuggestionHighlight(suggestions);

      }


      /* ================================================
         TOUCHE ENTRÉE
         ================================================ */

      else if (
        event.key === "Enter" &&
        selectedSuggestionIndex >= 0
      ) {

        event.preventDefault();

        const selectedLink =
          suggestions[selectedSuggestionIndex];


        if (selectedLink) {

          window.open(
            selectedLink.href,
            "_blank"
          );

          suggestionsContainer.style.display =
            "none";

        }

      }

    }
  );


  /* =====================================================
     BOUTON DE RECHERCHE
     ===================================================== */

  searchButton.addEventListener(
    "click",
    function () {

      const query =
        searchInput.value.trim();

      if (query) {

        console.log(
          "🔎 Recherche pour : " + query
        );

      }

    }
  );


  /* =====================================================
     AFFICHAGE DES SUGGESTIONS
     ===================================================== */

  function displaySuggestions(suggestions) {

    suggestionsContainer.innerHTML = "";


    /* ================================================
       CRÉATION DES LIENS
       ================================================ */

    suggestions.forEach((suggestion) => {

      const suggestionLink =
        document.createElement("a");


      /* ==============================================
         DESTINATION
         ============================================== */

      suggestionLink.href =
        suggestion.href;


      /* ==============================================
         TEXTE
         ============================================== */

      suggestionLink.textContent =
        suggestion.text;


      /* ==============================================
         CLASSE CSS
         ============================================== */

      suggestionLink.classList.add(
        "suggestion-item"
      );


      /* ==============================================
         OUVERTURE DANS UN NOUVEL ONGLET
         ============================================== */

      suggestionLink.target = "_blank";

      suggestionLink.rel = "noopener noreferrer";


      /* ==============================================
         CLIC SUR UNE SUGGESTION
         ============================================== */

      suggestionLink.addEventListener(
        "click",
        function (e) {

          e.preventDefault();

          window.open(
            suggestionLink.href,
            "_blank",
            "noopener"
          );

          suggestionsContainer.style.display =
            "none";

        }
      );


      /* ==============================================
         AJOUTER AU CONTENEUR
         ============================================== */

      suggestionsContainer.appendChild(
        suggestionLink
      );

    });


    /* ===================================================
       RÉINITIALISER LA SÉLECTION
       =================================================== */

    selectedSuggestionIndex = -1;


    /* ===================================================
       AFFICHER OU CACHER
       =================================================== */

    suggestionsContainer.style.display =
      suggestions.length > 0
        ? "block"
        : "none";

  }


  /* =====================================================
     RECHERCHE DANS LES SUGGESTIONS
     ===================================================== */

  function getSuggestions(query) {

    return suggestionLinks.filter((suggestion) => {

      return removeAccents(
        suggestion.text.toLowerCase()
      ).includes(query);

    });

  }


  /* =====================================================
     SUPPRESSION DES ACCENTS
     ===================================================== */

  function removeAccents(str) {

    return str
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      );

  }


  /* =====================================================
     MISE EN ÉVIDENCE DE LA SUGGESTION
     ===================================================== */

  function updateSuggestionHighlight(suggestions) {

    /* ================================================
       SUPPRIMER L'ANCIENNE SÉLECTION
       ================================================ */

    [
      ...suggestions
    ].forEach((element) => {

      element.classList.remove("highlighted");

    });


    /* ================================================
       AJOUTER LA NOUVELLE SÉLECTION
       ================================================ */

    if (
      selectedSuggestionIndex >= 0 &&
      selectedSuggestionIndex < suggestions.length
    ) {

      suggestions[
        selectedSuggestionIndex
      ].classList.add("highlighted");

    }

  }


  /* =====================================================
     FERMER LES SUGGESTIONS EN CLIQUANT AILLEURS
     ===================================================== */

  document.addEventListener(
    "click",
    function (e) {

      if (
        !suggestionsContainer.contains(e.target) &&
        e.target !== searchInput
      ) {

        suggestionsContainer.style.display =
          "none";

      }

    }
  );

});


/* =======================================================
   2. AUTRES FONCTIONNALITÉS
   ======================================================= */

/* ... on garde ton code existant ... */


/* =======================================================
   3. MENU HAMBURGER PLEIN ÉCRAN
   AVEC DISPLAY NONE ET BOUTON RETOUR MOBILE
   ======================================================= */

function toggleHamburgerMenu() {

  const menu =
    document.getElementById("hamburgerDropdown");
  const trigger =
    document.querySelector(".hamburger");


  if (
    !menu.classList.contains("active")
  ) {

    /* ==============================================
       OUVRIR LE MENU
       ============================================== */

    menu.style.display = "flex";
    menu.inert = false;
    menu.setAttribute("aria-hidden", "false");
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-label", "Fermer le menu mobile");

    setTimeout(
      () => menu.classList.add("active"),
      20
    );

    document.body.style.overflow = "hidden";


    /* ==============================================
       AJOUTER UN ÉTAT HISTORIQUE
       ============================================== */

    history.pushState(
      { menuOpen: true },
      "",
      ""
    );

  }

  else {

    closeHamburgerMenu(menu, true, true);

  }

}


/* =====================================================
   FERMER LE MENU
   ===================================================== */

function closeHamburgerMenu(menu, returnHistory, restoreFocus) {

  menu.classList.remove("active");
  menu.inert = true;
  menu.setAttribute("aria-hidden", "true");

  const trigger =
    document.querySelector(".hamburger");

  if (trigger) {
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Ouvrir le menu mobile");
  }

  document.body.style.overflow = "";

  setTimeout(
    () => menu.style.display = "none",
    400
  );

  if (returnHistory && history.state && history.state.menuOpen) {
    history.back();
  }

  if (restoreFocus && trigger) {
    trigger.focus();
  }

}


/* =====================================================
   FERMER LE MENU EN CLIQUANT EN DEHORS
   ===================================================== */

document.addEventListener(
  "click",
  function(e) {

    const menu =
      document.getElementById("hamburgerDropdown");

    const hamburger =
      document.querySelector(".hamburger");


    if (
      !menu ||
      !menu.classList.contains("active")
    ) {

      return;

    }


    if (
      !menu.contains(e.target) &&
      !hamburger?.contains(e.target)
    ) {

      closeHamburgerMenu(menu, true, false);

    }

  }
);


/* =====================================================
   INTERCEPTER LE BOUTON RETOUR DU TÉLÉPHONE
   ===================================================== */

window.addEventListener(
  "popstate",
  function(event) {

    const menu =
      document.getElementById("hamburgerDropdown");


    if (
      menu &&
      menu.classList.contains("active")
    ) {

      closeHamburgerMenu(menu);

    }

  }
);

document.addEventListener("keydown", function(event) {
  const menu = document.getElementById("hamburgerDropdown");
  if (event.key === "Escape" && menu && menu.classList.contains("active")) {
    closeHamburgerMenu(menu, true, true);
  }
});
