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
// CHARGEMENT DES JSON
// ========================================

async function chargerDocuments() {

    loading.style.display = "block";

    documents = [];

    let numero = 1;


    try {

        while (true) {

            const chemin = `tapc/index${numero}.json`;

            console.log(
                `📥 Chargement de ${chemin}...`
            );


            const reponse = await fetch(chemin);


            // ------------------------------------------------
            // Si le fichier n'existe pas, on arrête.
            // Exemple : index1, index2, index3 existent,
            // mais index4 n'existe pas.
            // ------------------------------------------------

            if (!reponse.ok) {

                if (reponse.status === 404) {

                    console.log(
                        `ℹ️ ${chemin} n'existe pas. Fin du chargement.`
                    );

                    break;

                }


                throw new Error(
                    `Erreur ${reponse.status} lors du chargement de ${chemin}`
                );

            }


            const partie = await reponse.json();


            // ------------------------------------------------
            // Vérifier que le fichier contient bien un tableau
            // ------------------------------------------------

            if (!Array.isArray(partie)) {

                throw new Error(
                    `${chemin} ne contient pas un tableau JSON valide.`
                );

            }


            // ------------------------------------------------
            // Ajouter les documents de cette partie
            // ------------------------------------------------

            documents.push(...partie);


            console.log(

                `✅ ${chemin} chargé :`,

                partie.length,

                "document(s)"

            );


            numero++;

        }


        // ================================================
        // VÉRIFICATION FINALE
        // ================================================

        console.log(
            "========================================"
        );

        console.log(
            "✅ CHARGEMENT TERMINÉ"
        );

        console.log(
            "Nombre de fichiers JSON chargés :",
            numero - 1
        );

        console.log(
            "Nombre total de documents :",
            documents.length
        );

        console.log(
            "========================================"
        );


    } catch (e) {

        resultats.innerHTML =
            "<div class='aucun'>Impossible de charger les fichiers de documents.</div>";


        console.error(
            "❌ Erreur :",
            e
        );

    }


    loading.style.display = "none";

}


// Lancer le chargement
chargerDocuments();


// ========================================
// RECHERCHE
// ========================================

function rechercher() {

    const valeur = normaliserMatricule(
        input.value
    );


    resultats.innerHTML = "";


    // Champ vide
    if (valeur === "") {

        return;

    }


    // Vérifier que les JSON sont bien chargés
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


        // Le JSON utilise "pages"
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


                // Normaliser le contenu
                const contenuNormalise =
                    normaliserMatricule(
                        contenuPage
                    );


                // Vérifier si le matricule est présent
                if (
                    contenuNormalise.includes(
                        valeur
                    )
                ) {

                    pagesTrouvees.push(
                        numeroPage
                    );

                }

            }
        );


        // ========================================
        // DOCUMENT TROUVÉ
        // ========================================

        if (
            pagesTrouvees.length > 0
        ) {

            trouves.push({

                ...doc,

                pagesTrouvees:
                    pagesTrouvees

            });

        }

    });


    // ========================================
    // AUCUN RÉSULTAT
    // ========================================

    if (
        trouves.length === 0
    ) {

        resultats.innerHTML =
            "<div class='aucun'>Aucun document trouvé.</div>";

        return;

    }


    // ========================================
    // AFFICHAGE DES RÉSULTATS
    // ========================================

    trouves.forEach(doc => {


        const carte =
            document.createElement("div");


        carte.className =
            "resultat";


        // Liste des pages
        const pages =
            doc.pagesTrouvees
                .map(
                    page => `Page ${page}`
                )
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

        carte.addEventListener(
            "click",
            () => {

                if (doc.lien) {

                    window.open(
                        doc.lien,
                        "_blank"
                    );

                }

            }
        );


        resultats.appendChild(
            carte
        );

    });

}


// ========================================
// RECHERCHE AUTOMATIQUE
// ========================================

input.addEventListener(
    "input",
    () => {

        clearTimeout(timer);


        timer = setTimeout(
            () => {

                rechercher();

            },
            250
        );

    }
);
