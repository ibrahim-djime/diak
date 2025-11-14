console.log("✅ JavaScript chargé avec succès");

/* =======================================================
   1. GESTION DU CHAMP DE RECHERCHE ET DES SUGGESTIONS
   (inchangé, on garde ton code existant)
   ======================================================= */
document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("search-input");
  const suggestionsContainer = document.getElementById("suggestions");
  const searchButton = document.getElementById("search-button");

  if (searchInput && suggestionsContainer && searchButton) {
    const suggestionLinks = Array.from(suggestionsContainer.getElementsByTagName("a"));
    let selectedSuggestionIndex = -1;

    searchInput.addEventListener("input", function () {
      const query = removeAccents(searchInput.value.trim().toLowerCase());
      if (query === "") {
        suggestionsContainer.style.display = "none";
        return;
      }
      getSuggestions(query).then((suggestions) => displaySuggestions(suggestions));
    });

    searchInput.addEventListener("keydown", function (event) {
      const suggestions = suggestionsContainer.getElementsByClassName("suggestion-item");
      if (suggestions.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % suggestions.length;
        updateSuggestionHighlight(suggestions);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex - 1 + suggestions.length) % suggestions.length;
        updateSuggestionHighlight(suggestions);
      } else if (event.key === "Enter" && selectedSuggestionIndex >= 0) {
        event.preventDefault();
        const selectedLink = suggestions[selectedSuggestionIndex];
        if (selectedLink) {
          window.open(selectedLink.href, "_blank");
          suggestionsContainer.style.display = "none";
        }
      }
    });

    searchButton.addEventListener("click", function () {
      const query = searchInput.value.trim();
      if (query) console.log("🔎 Recherche pour : " + query);
    });

    function displaySuggestions(suggestions) {
      suggestionsContainer.innerHTML = "";
      suggestions.forEach((suggestion) => {
        const suggestionLink = document.createElement("a");
        suggestionLink.href = suggestion.href;
        suggestionLink.textContent = suggestion.text;
        suggestionLink.classList.add("suggestion-item");
        suggestionLink.target = "_blank";
        suggestionLink.addEventListener("click", (e) => {
          e.preventDefault();
          window.open(suggestionLink.href, "_blank");
          suggestionsContainer.style.display = "none";
        });
        suggestionsContainer.appendChild(suggestionLink);
      });
      selectedSuggestionIndex = -1;
      suggestionsContainer.style.display = suggestions.length > 0 ? "block" : "none";
    }

    async function getSuggestions(query) {
      const suggestions = suggestionLinks.map((link) => ({
        href: link.href,
        text: link.textContent,
      }));
      return suggestions.filter((s) =>
        removeAccents(s.text.toLowerCase()).includes(query)
      );
    }

    function removeAccents(str) {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function updateSuggestionHighlight(suggestions) {
      [...suggestions].forEach((el) => el.classList.remove("highlighted"));
      if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
        suggestions[selectedSuggestionIndex].classList.add("highlighted");
      }
    }

    document.addEventListener("click", (e) => {
      if (!suggestionsContainer.contains(e.target) && e.target !== searchInput) {
        suggestionsContainer.style.display = "none";
      }
    });
  }
});

/* =======================================================
   2. AUTRES FONCTIONNALITÉS (ANALYTICS, PARTAGE, ETC.)
   ======================================================= */
/* ... on garde ton code existant ... */

/* =======================================================
   3. MENU HAMBURGER PLEIN ÉCRAN AVEC DISPLAY NONE ET BOUTON RETOUR MOBILE
   ======================================================= */
function toggleHamburgerMenu() {
  const menu = document.getElementById("hamburgerDropdown");

  if (!menu.classList.contains("active")) {
    // Ouvrir le menu
    menu.style.display = "flex";
    setTimeout(() => menu.classList.add("active"), 20);
    document.body.style.overflow = "hidden";

    // Ajouter un état historique pour le bouton retour
    history.pushState({ menuOpen: true }, "", "");
  } else {
    closeHamburgerMenu(menu);
  }
}

function closeHamburgerMenu(menu) {
  menu.classList.remove("active");
  document.body.style.overflow = "";
  setTimeout(() => menu.style.display = "none", 400);
}

// Fermer le menu quand on clique sur le X (::before)
document.addEventListener("click", function(e) {
  const menu = document.getElementById("hamburgerDropdown");
  if (!menu.classList.contains("active")) return;

  const rect = menu.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (x >= rect.width - 50 && x <= rect.width && y >= 0 && y <= 50) {
    closeHamburgerMenu(menu);
    // Retirer l'état historique
    if (history.state && history.state.menuOpen) history.back();
  }
});

// Optionnel : fermer le menu si clic en dehors
document.addEventListener("click", function(e) {
  const menu = document.getElementById("hamburgerDropdown");
  const hamburger = document.querySelector(".hamburger");
  if (!menu.classList.contains("active")) return;
  if (!menu.contains(e.target) && e.target !== hamburger) {
    closeHamburgerMenu(menu);
    if (history.state && history.state.menuOpen) history.back();
  }
});

// Intercepter le bouton retour du téléphone
window.addEventListener("popstate", function(event) {
  const menu = document.getElementById("hamburgerDropdown");
  if (menu.classList.contains("active")) {
    closeHamburgerMenu(menu);
  }
});
