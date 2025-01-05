console.log("Le fichier JavaScript est bien chargé");

document.addEventListener("DOMContentLoaded", function() {
    const searchInput = document.getElementById("search-input");
    const suggestionsContainer = document.getElementById("suggestions");
    const searchButton = document.getElementById("search-button");
    const suggestionLinks = Array.from(suggestionsContainer.getElementsByTagName("a"));
    let selectedSuggestionIndex = -1; // Index de la suggestion actuellement sélectionnée

    searchInput.addEventListener("input", function() {
        const query = removeAccents(searchInput.value.trim().toLowerCase());

        // Masquer les suggestions si le champ est vide
        if (query === "") {
            suggestionsContainer.style.display = "none";
            return;
        }

        // Filtrer les suggestions dynamiques et afficher celles qui correspondent
        getSuggestions(query).then(suggestions => {
            displaySuggestions(suggestions);
        });
    });

    searchInput.addEventListener("keydown", function(event) {
        const suggestions = suggestionsContainer.getElementsByClassName("suggestion-item");
        
        if (event.key === "ArrowDown") {
            event.preventDefault(); // Empêche le défilement de la page
            selectedSuggestionIndex = (selectedSuggestionIndex + 1) % suggestions.length; // Sélectionne la suggestion suivante
            updateSuggestionHighlight(suggestions);
        } else if (event.key === "ArrowUp") {
            event.preventDefault(); // Empêche le défilement de la page
            selectedSuggestionIndex = (selectedSuggestionIndex - 1 + suggestions.length) % suggestions.length; // Sélectionne la suggestion précédente
            updateSuggestionHighlight(suggestions);
        } else if (event.key === "Enter") {
            if (selectedSuggestionIndex >= 0 && suggestions.length > 0) {
                event.preventDefault(); // Empêche l'envoi du formulaire
                const selectedLink = suggestions[selectedSuggestionIndex];
                if (selectedLink) {
                    window.open(selectedLink.href, '_blank'); // Ouvrir dans un nouvel onglet
                    suggestionsContainer.style.display = "none"; // Masque les suggestions
                }
            }
        }
    });

    searchButton.addEventListener("click", function() {
        const query = searchInput.value.trim();
        if (query) {
            console.log("Recherche pour : " + query);
            // Ici, vous pouvez ajouter une redirection ou une action de recherche
        }
    });

    function displaySuggestions(suggestions) {
        suggestionsContainer.innerHTML = ""; // Vider les suggestions actuelles
        suggestions.forEach(suggestion => {
            const suggestionLink = document.createElement("a");
            suggestionLink.href = suggestion.href; // Utiliser l'URL de suggestion
            suggestionLink.textContent = suggestion.text; // Utiliser le texte de suggestion
            suggestionLink.classList.add("suggestion-item");
            suggestionLink.target = "_blank"; // Ouvrir les liens dans un nouvel onglet
            suggestionLink.addEventListener("click", function(event) {
                event.preventDefault(); // Empêche le comportement par défaut
                window.open(suggestionLink.href, '_blank'); // Ouvrir dans un nouvel onglet
                suggestionsContainer.style.display = "none"; // Masquer les suggestions
            });
            suggestionsContainer.appendChild(suggestionLink);
        });
        selectedSuggestionIndex = -1; // Réinitialiser l'index de sélection
        suggestionsContainer.style.display = suggestions.length > 0 ? "block" : "none";
    }

    async function getSuggestions(query) {
        // Liste de suggestions statiques
        const suggestions = suggestionLinks.map(link => ({
            href: link.href,
            text: link.textContent
        }));

        // Filtrer les suggestions pour inclure uniquement celles qui correspondent à la saisie
        return suggestions.filter(suggestion =>
            removeAccents(suggestion.text.toLowerCase()).includes(query)
        );
    }

    // Fonction pour retirer les accents d'une chaîne
    function removeAccents(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    // Mettre à jour la mise en surbrillance de la suggestion sélectionnée
    function updateSuggestionHighlight(suggestions) {
        for (let i = 0; i < suggestions.length; i++) {
            suggestions[i].classList.remove("highlighted"); // Retirer la classe de surbrillance
        }
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
            suggestions[selectedSuggestionIndex].classList.add("highlighted"); // Ajouter la classe de surbrillance
        }
    }

    // Masquer les suggestions lorsqu'on clique en dehors du champ de recherche
    document.addEventListener("click", function(e) {
        if (!suggestionsContainer.contains(e.target) && e.target !== searchInput) {
            suggestionsContainer.style.display = "none";
        }
    });
});
// Détection de la langue du navigateur
const userLanguage = navigator.language || navigator.userLanguage;
gtag('event', 'user_language', { 'language': userLanguage });

// Détection de la résolution d’écran
const screenResolution = { width: window.screen.width, height: window.screen.height };
gtag('event', 'screen_resolution', { 'width': screenResolution.width, 'height': screenResolution.height });

// Vérification d'AdBlock
const detectAdBlock = () => {
  const adBlockDetected = !document.createElement("div").offsetHeight;
  gtag('event', 'ad_block_detected', { 'adBlock': adBlockDetected });
  return adBlockDetected;
};
detectAdBlock();

// Type de connexion réseau
if (navigator.connection) {
  gtag('event', 'network_type', { 'connection_type': navigator.connection.effectiveType });
}

// Temps passé sur la page
let startTime = new Date();
window.addEventListener("beforeunload", () => {
  let endTime = new Date();
  let timeSpent = Math.round((endTime - startTime) / 1000); // Temps en secondes
  gtag('event', 'time_spent', { 'time': timeSpent });
});

// Pourcentage de scroll
window.addEventListener("scroll", () => {
  const scrollPercentage = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
  gtag('event', 'scroll_depth', { 'percentage': scrollPercentage });
});

// Source de la visite
const referrer = document.referrer;
gtag('event', 'referrer', { 'url': referrer ? referrer : "Accès direct" });

// Mode sombre
const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
gtag('event', 'dark_mode', { 'prefersDarkMode': prefersDarkMode });

// Informations sur l’appareil
const userDeviceInfo = () => {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const mobile = /Mobile|Android|iP(hone|ad)/i.test(userAgent) ? "Mobile" : "Desktop";
  gtag('event', 'device_info', { 'user_agent': userAgent, 'platform': platform, 'mobile': mobile });
};
userDeviceInfo();

// Adresse IP (optionnel)
fetch('https://api.ipify.org?format=json')
  .then(response => response.json())
  .then(data => {
    gtag('event', 'ip_address', { 'ip': data.ip });
  })
  .catch(error => console.error("Erreur lors de la récupération de l'IP :", error));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then((registration) => {
    console.log('Service Worker enregistré avec succès:', registration);
  }).catch((error) => {
    console.log('Erreur lors de l’enregistrement du Service Worker:', error);
  });
}
document.addEventListener("DOMContentLoaded", function () {
    const shareButton = document.getElementById("share-button");
    console.log("Script chargé et bouton trouvé :", !!shareButton);

    if (!shareButton) {
        console.error("Le bouton 'share-button' est introuvable.");
        return;
    }

    shareButton.addEventListener("click", async function () {
        console.log("Bouton cliqué !");
        const siteURL = "https://ibrahim-djime.github.io/diak/";

        if (navigator.share) {
            console.log("API Web Share disponible.");
            try {
                await navigator.share({
                    title: "Découvrez ce site",
                    text: "Visitez ce site incroyable !",
                    url: siteURL,
                });
                console.log("Lien partagé avec succès !");
            } catch (error) {
                console.error("Le partage a échoué : ", error);
            }
        } else if (navigator.clipboard) {
            console.log("API Web Share indisponible. Copie dans le presse-papier.");
            navigator.clipboard.writeText(siteURL)
                .then(() => {
                    alert("Le lien du site a été copié dans le presse-papier !");
                })
                .catch((error) => {
                    console.error("Erreur lors de la copie : ", error);
                });
        } else {
            console.log("Aucune API de partage disponible.");
            alert("Votre navigateur ne prend pas en charge le partage automatique.");
        }
    });
});
