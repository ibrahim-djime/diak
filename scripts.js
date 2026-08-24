console.log("✅ JavaScript chargé avec succès");


/* =======================================================
   SERVICE WORKER - MODE HORS CONNEXION
   ======================================================= */

if ('serviceWorker' in navigator) {

  window.addEventListener('load', () => {

    navigator.serviceWorker
      .register('service-worker.js')

      .then((registration) => {

        console.log(
          '✅ Service Worker enregistré avec succès :',
          registration.scope
        );

      })

      .catch((error) => {

        console.error(
          '❌ Erreur lors de l’enregistrement du Service Worker :',
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
     CHARGEMENT AUTOMATIQUE DES FICHIERS

     Le script cherche :

     suggestions1.html
     suggestions2.html
     suggestions3.html
     suggestions4.html
     ...

     Il s'arrête dès qu'il ne trouve plus
     le numéro suivant.
     ===================================================== */

  async function loadSuggestions() {

    let numero = 1;

    const loadedSuggestions = [];


    while (true) {

      const file =
        "suggestions" + numero + ".html";


      try {

        console.log(
          "🔎 Recherche de : " + file
        );


        /* ==============================================
           CONSTRUIRE LE CHEMIN CORRECT
           ============================================== */

        const fileURL =
          new URL(
            file,
            document.baseURI
          ).href;


        /* ==============================================
           CHARGER LE FICHIER
           ============================================== */

        const response =
          await fetch(
            fileURL,
            {
              cache: "default"
            }
          );


        /* ==============================================
           LE FICHIER N'EXISTE PAS
           ============================================== */

        if (!response.ok) {

          console.log(
            "🛑 " +
            file +
            " introuvable."
          );

          console.log(
            "ℹ️ Fin du chargement automatique."
          );

          break;

        }


        /* ==============================================
           RÉCUPÉRER LE CONTENU
           ============================================== */

        const html =
          await response.text();


        /* ==============================================
           CONTENEUR TEMPORAIRE
           ============================================== */

        const temporaryContainer =
          document.createElement("div");


        temporaryContainer.innerHTML =
          html;


        /* ==============================================
           RÉCUPÉRER LES LIENS <a>
           ============================================== */

        const links =
          temporaryContainer.querySelectorAll("a");


        /* ==============================================
           FICHIER EXISTANT MAIS VIDE
           ============================================== */

        if (links.length === 0) {

          console.log(
            "⚠️ " +
            file +
            " existe mais ne contient aucune balise <a>."
          );

          console.log(
            "ℹ️ Fin du chargement automatique."
          );

          break;

        }


        /* ==============================================
           AJOUTER LES SUGGESTIONS
           ============================================== */

        let nombreAjoutees = 0;


        links.forEach((link) => {

          const href =
            link.getAttribute("href");

          const text =
            link.textContent.trim();


          /* ============================================
             IGNORER LES LIENS INCORRECTS
             ============================================ */

          if (
            !href ||
            !text
          ) {

            return;

          }


          loadedSuggestions.push({

            href: href,

            text: text

          });


          nombreAjoutees++;

        });


        /* ==============================================
           AFFICHER LE RÉSULTAT
           ============================================== */

        console.log(
          "✅ " +
          file +
          " chargé : " +
          nombreAjoutees +
          " suggestion(s)"
        );


        /* ==============================================
           SI AUCUNE SUGGESTION VALIDE
           ============================================== */

        if (
          nombreAjoutees === 0
        ) {

          console.log(
            "⚠️ Aucune suggestion valide dans " +
            file
          );

          console.log(
            "ℹ️ Fin du chargement automatique."
          );

          break;

        }


        /* ==============================================
           PASSER AU FICHIER SUIVANT
           ============================================== */

        numero++;

      }


      catch (error) {

        console.error(
          "❌ Erreur lors du chargement de " +
          file +
          " :",
          error
        );

        break;

      }

    }


    /* ===================================================
       ENREGISTRER LES SUGGESTIONS
       =================================================== */

    suggestionLinks =
      loadedSuggestions;


    suggestionsLoaded = true;


    console.log(
      "=========================================="
    );


    console.log(
      "🔎 Nombre total de suggestions chargées : " +
      suggestionLinks.length
    );


    console.log(
      "=========================================="
    );

  }


  /* =====================================================
     CHARGEMENT INITIAL

     On attend que tous les fichiers soient chargés
     avant d'activer la recherche.
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


        selectedSuggestionIndex =
          -1;


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
        getSuggestions(
          query
        );


      /* ================================================
         AFFICHER
         ================================================ */

      displaySuggestions(
        suggestions
      );

    }
  );


  /* =====================================================
     NAVIGATION AVEC LES TOUCHES DU CLAVIER
     ===================================================== */

  searchInput.addEventListener(
    "keydown",
    function (event) {

      const suggestions =
        suggestionsContainer
          .getElementsByClassName(
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
          ) %
          suggestions.length;


        updateSuggestionHighlight(
          suggestions
        );

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
          ) %
          suggestions.length;


        updateSuggestionHighlight(
          suggestions
        );

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
          suggestions[
            selectedSuggestionIndex
          ];


        if (
          selectedLink
        ) {

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


      if (
        query
      ) {

        console.log(
          "🔎 Recherche pour : " +
          query
        );

      }

    }
  );


  /* =====================================================
     AFFICHAGE DES SUGGESTIONS
     ===================================================== */

  function displaySuggestions(
    suggestions
  ) {

    suggestionsContainer.innerHTML =
      "";


    /* ================================================
       CRÉATION DES LIENS
       ================================================ */

    suggestions.forEach(
      (suggestion) => {

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

        suggestionLink.target =
          "_blank";


        /* ==============================================
           CLIC SUR UNE SUGGESTION
           ============================================== */

        suggestionLink.addEventListener(
          "click",
          function (e) {

            e.preventDefault();


            window.open(
              suggestionLink.href,
              "_blank"
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

      }
    );


    /* ===================================================
       RÉINITIALISER LA SÉLECTION
       =================================================== */

    selectedSuggestionIndex =
      -1;


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

  function getSuggestions(
    query
  ) {

    return suggestionLinks.filter(
      (suggestion) => {

        return removeAccents(
          suggestion.text
            .toLowerCase()
        ).includes(
          query
        );

      }
    );

  }


  /* =====================================================
     SUPPRESSION DES ACCENTS
     ===================================================== */

  function removeAccents(
    str
  ) {

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

  function updateSuggestionHighlight(
    suggestions
  ) {

    /* ================================================
       SUPPRIMER L'ANCIENNE SÉLECTION
       ================================================ */

    [
      ...suggestions
    ].forEach(
      (element) => {

        element.classList.remove(
          "highlighted"
        );

      }
    );


    /* ================================================
       AJOUTER LA NOUVELLE SÉLECTION
       ================================================ */

    if (
      selectedSuggestionIndex >= 0 &&
      selectedSuggestionIndex <
      suggestions.length
    ) {

      suggestions[
        selectedSuggestionIndex
      ].classList.add(
        "highlighted"
      );

    }

  }


  /* =====================================================
     FERMER LES SUGGESTIONS EN CLIQUANT AILLEURS
     ===================================================== */

  document.addEventListener(
    "click",
    function (e) {

      if (
        !suggestionsContainer.contains(
          e.target
        ) &&
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
    document.getElementById(
      "hamburgerDropdown"
    );


  if (
    !menu.classList.contains("active")
  ) {

    /* ==============================================
       OUVRIR LE MENU
       ============================================== */

    menu.style.display =
      "flex";


    setTimeout(
      () => menu.classList.add("active"),
      20
    );


    document.body.style.overflow =
      "hidden";


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

    closeHamburgerMenu(
      menu
    );

  }

}


/* =====================================================
   FERMER LE MENU
   ===================================================== */

function closeHamburgerMenu(
  menu
) {

  menu.classList.remove(
    "active"
  );


  document.body.style.overflow =
    "";


  setTimeout(
    () => menu.style.display = "none",
    400
  );

}


/* =====================================================
   FERMER LE MENU QUAND ON CLIQUE SUR LE X
   ===================================================== */

document.addEventListener(
  "click",
  function(e) {

    const menu =
      document.getElementById(
        "hamburgerDropdown"
      );


    if (
      !menu.classList.contains("active")
    ) {

      return;

    }


    const rect =
      menu.getBoundingClientRect();


    const x =
      e.clientX -
      rect.left;


    const y =
      e.clientY -
      rect.top;


    if (
      x >= rect.width - 50 &&
      x <= rect.width &&
      y >= 0 &&
      y <= 50
    ) {

      closeHamburgerMenu(
        menu
      );


      /* ============================================
         RETIRER L'ÉTAT HISTORIQUE
         ============================================ */

      if (
        history.state &&
        history.state.menuOpen
      ) {

        history.back();

      }

    }

  }
);


/* =====================================================
   FERMER LE MENU EN CLIQUANT EN DEHORS
   ===================================================== */

document.addEventListener(
  "click",
  function(e) {

    const menu =
      document.getElementById(
        "hamburgerDropdown"
      );


    const hamburger =
      document.querySelector(
        ".hamburger"
      );


    if (
      !menu.classList.contains("active")
    ) {

      return;

    }


    if (
      !menu.contains(e.target) &&
      e.target !== hamburger
    ) {

      closeHamburgerMenu(
        menu
      );


      if (
        history.state &&
        history.state.menuOpen
      ) {

        history.back();

      }

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
      document.getElementById(
        "hamburgerDropdown"
      );


    if (
      menu.classList.contains("active")
    ) {

      closeHamburgerMenu(
        menu
      );

    }

  }
);
