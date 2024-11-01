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
