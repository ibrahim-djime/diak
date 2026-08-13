const input = document.getElementById("matricule");
const resultats = document.getElementById("resultats");
const loading = document.getElementById("loading");

let documents = [];
let timer = null;


// ========================================
// NORMALISATION DU MATRICULE
// ========================================

function normaliserMatricule(texte) {

    return texte
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[-_.]/g, "");

}


// ========================================
// CHARGEMENT DU JSON
// ========================================

async function chargerDocuments() {

    loading.style.display = "block";

    try {

        const reponse = await fetch("index.json");

        if (!reponse.ok) {
            throw new Error(
                "Impossible de charger index.json : " +
                reponse.status
            );
        }

        documents = await reponse.json();

        console.log(
            "✅ index.json chargé :",
            documents.length,
            "document(s)"
        );

    } catch (e) {

        resultats.innerHTML =
            "<div class='aucun'>Impossible de charger index.json</div>";

        console.error("❌ Erreur :", e);

    }

    loading.style.display = "none";

}


// Lancer le chargement
chargerDocuments();


// ========================================
// RECHERCHE
// ========================================

function rechercher() {

    const valeur = normaliserMatricule(input.value);

    resultats.innerHTML = "";

    // Champ vide
    if (valeur === "") {
        return;
    }

    // Vérifier que le JSON est bien chargé
    if (!documents.length) {

        resultats.innerHTML =
            "<div class='aucun'>Les documents sont encore en cours de chargement.</div>";

        return;
    }

    const trouves = [];


    // ========================================
    // PARCOURIR LES DOCUMENTS
    // ========================================

    documents.forEach(doc => {

        // Le nouveau JSON utilise "pages"
        if (!doc.pages) {
            return;
        }

        const pagesTrouvees = [];


        // ========================================
        // PARCOURIR LES PAGES
        // ========================================

        Object.entries(doc.pages).forEach(
            ([numeroPage, contenuPage]) => {

                if (!contenuPage) {
                    return;
                }


                // Normaliser également le contenu de la page
                const contenuNormalise =
                    normaliserMatricule(contenuPage);


                // Vérifier si le matricule est présent
                if (contenuNormalise.includes(valeur)) {

                    pagesTrouvees.push(numeroPage);

                }

            }
        );


        // ========================================
        // DOCUMENT TROUVÉ
        // ========================================

        if (pagesTrouvees.length > 0) {

            trouves.push({

                ...doc,

                pagesTrouvees: pagesTrouvees

            });

        }

    });


    // ========================================
    // AUCUN RÉSULTAT
    // ========================================

    if (trouves.length === 0) {

        resultats.innerHTML =
            "<div class='aucun'>Aucun document trouvé.</div>";

        return;

    }


    // ========================================
    // AFFICHAGE DES RÉSULTATS
    // ========================================

    trouves.forEach(doc => {

        const carte = document.createElement("div");

        carte.className = "resultat";


        // Liste des pages
        const pages = doc.pagesTrouvees
            .map(page => `Page ${page}`)
            .join(" • ");


        carte.innerHTML = `

            <h3>📄 ${doc.nom}</h3>

            <p>
                📑 <strong>${pages}</strong>
            </p>

            <p>
                🔗 Cliquez pour ouvrir le document
            </p>

        `;


        // ========================================
        // OUVRIR LE DOCUMENT
        // ========================================

        carte.addEventListener("click", () => {

            if (doc.lien) {

                window.open(doc.lien, "_blank");

            }

        });


        resultats.appendChild(carte);

    });

}


// ========================================
// RECHERCHE AUTOMATIQUE
// ========================================

input.addEventListener("input", () => {

    clearTimeout(timer);

    timer = setTimeout(() => {

        rechercher();

    }, 250);

});