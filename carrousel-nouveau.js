/* ============================================================
   CARROUSEL AUTOMATIQUE LUMESHOP
   ============================================================ */

(() => {

    "use strict";


    /* ========================================================
       CONFIGURATION
       ======================================================== */

    const CONFIG = {

        /* Page contenant les produits */
        PAGE_VENTE:
            "https://lumeshop.vercel.app/",

        /* Nombre d'images par groupe */
        TAILLE_GROUPE:
            15,

        /* Changement d'image */
        DUREE_IMAGE:
            4000,

        /* Durée de transition */
        DUREE_TRANSITION:
            800,

        /* Préparer les groupes suivants */
        GROUPES_PRECHARGES:
            2,

        /* Clé du cache de sélection */
        CACHE_SELECTION:
            "lumina_carrousel_selection_v1",

        /* Statistiques locales */
        CACHE_STATS:
            "lumina_carrousel_stats_v1"

    };


    /* ========================================================
       ÉLÉMENTS
       ======================================================== */

    const zone =
        document.getElementById(
            "nouveauCarrouselZone"
        );

    const fond =
        document.getElementById(
            "nouveauCarrouselFond"
        );

    const piste =
        document.getElementById(
            "nouveauCarrouselPiste"
        );

    const indicateurs =
        document.getElementById(
            "nouveauxIndicateurs"
        );


    if (
        !zone ||
        !fond ||
        !piste ||
        !indicateurs
    ) {

        console.error(
            "Carrousel : éléments introuvables."
        );

        return;

    }


    /* ========================================================
       VARIABLES
       ======================================================== */

    let produits =
        [];

    let groupes =
        [];

    let groupeActuel =
        0;

    let imageActuelle =
        0;

    let timer =
        null;

    let momentDebutImage =
        0;


    /* ========================================================
       UTILITAIRES
       ======================================================== */

    function maintenant() {

        return Date.now();

    }


    function debutJour() {

        const d =
            new Date();

        d.setHours(
            0,
            0,
            0,
            0
        );

        return d.getTime();

    }


    function creerIdentifiant(produit) {

        const texte =
            [
                produit.nom,
                produit.image,
                produit.lien
            ]
            .join("|");

        let hash =
            0;

        for (
            let i = 0;
            i < texte.length;
            i++
        ) {

            hash =
                (
                    (
                        hash << 5
                    ) -
                    hash
                ) +
                texte.charCodeAt(i);

            hash |= 0;

        }

        return String(
            Math.abs(hash)
        );

    }


    /* ========================================================
       RÉCUPÉRATION DES CARTES LOCALES
       ======================================================== */

    function recupererCartesLocales() {

        const cartes =
            document.querySelectorAll(
                ".ccard"
            );

        const resultat =
            [];

        cartes.forEach(
            (carte) => {

                const image =
                    carte.querySelector(
                        "img.product-image"
                    );

                if (!image) {

                    return;

                }


                const lien =
                    image.closest("a");


                const titre =
                    carte.querySelector("h3");


                const produit = {

                    nom:
                        titre
                            ?.textContent
                            .trim() ||
                        image.alt ||
                        "Produit",

                    image:
                        new URL(
                            image.getAttribute("src"),
                            window.location.href
                        ).href,

                    lien:
                        lien
                            ?.href ||
                        image.src,

                    source:
                        "local"

                };


                produit.id =
                    creerIdentifiant(
                        produit
                    );


                resultat.push(
                    produit
                );

            }
        );


        return resultat;

    }


    /* ========================================================
       RÉCUPÉRATION DE LUMESHOP
       ======================================================== */

    async function recupererProduitsLumeshop() {

        try {

            const reponse =
                await fetch(
                    CONFIG.PAGE_VENTE,
                    {
                        method:
                            "GET",

                        cache:
                            "force-cache"
                    }
                );


            if (!reponse.ok) {

                throw new Error(
                    "Réponse HTTP " +
                    reponse.status
                );

            }


            const html =
                await reponse.text();


            const documentDistant =
                new DOMParser()
                    .parseFromString(
                        html,
                        "text/html"
                    );


            const cartes =
                documentDistant
                    .querySelectorAll(
                        ".ccard"
                    );


            const resultat =
                [];


            cartes.forEach(
                (carte) => {

                    const image =
                        carte.querySelector(
                            "img.product-image"
                        );


                    if (!image) {

                        return;

                    }


                    const lien =
                        image.closest("a");


                    const titre =
                        carte.querySelector("h3");


                    const src =
                        image.getAttribute(
                            "src"
                        );


                    if (!src) {

                        return;

                    }


                    const produit = {

                        nom:
                            titre
                                ?.textContent
                                .trim() ||
                            image.alt ||
                            "Produit",

                        image:
                            new URL(
                                src,
                                CONFIG.PAGE_VENTE
                            ).href,

                        lien:
                            lien
                                ? new URL(
                                    lien.getAttribute(
                                        "href"
                                    ),
                                    CONFIG.PAGE_VENTE
                                ).href
                                : CONFIG.PAGE_VENTE,

                        source:
                            "lumeshop"

                    };


                    produit.id =
                        creerIdentifiant(
                            produit
                        );


                    resultat.push(
                        produit
                    );

                }
            );


            return resultat;

        }

        catch (erreur) {

            console.warn(
                "Impossible de lire Lumeshop directement :",
                erreur
            );

            return [];

        }

    }


    /* ========================================================
       CHARGER LES PRODUITS
       ======================================================== */

    async function chargerProduits() {

        const produitsDistants =
            await recupererProduitsLumeshop();


        if (
            produitsDistants.length > 0
        ) {

            return produitsDistants;

        }


        console.warn(
            "Utilisation des cartes locales."
        );


        return recupererCartesLocales();

    }


    /* ========================================================
       STATISTIQUES
       ======================================================== */

    function chargerStatistiques() {

        try {

            const donnees =
                localStorage.getItem(
                    CONFIG.CACHE_STATS
                );


            if (!donnees) {

                return {};

            }


            return JSON.parse(
                donnees
            );

        }

        catch {

            return {};

        }

    }


    function sauvegarderStatistiques(
        statistiques
    ) {

        localStorage.setItem(
            CONFIG.CACHE_STATS,
            JSON.stringify(
                statistiques
            )
        );

    }


    /* ========================================================
       SCORE D'UN PRODUIT
       ======================================================== */

    function calculerScore(
        produit,
        statistiques
    ) {

        const stat =
            statistiques[
                produit.id
            ] || {

                vues:
                    0,

                temps:
                    0,

                clics:
                    0

            };


        return (

            stat.temps *
            1

        ) +

        (

            stat.vues *
            20

        ) +

        (

            stat.clics *
            100

        );

    }


    /* ========================================================
       CRÉATION DES GROUPES
       ======================================================== */

    function creerGroupes() {

        const statistiques =
            chargerStatistiques();


        const classement =
            [...produits];


        classement.sort(
            (a, b) => {

                const scoreA =
                    calculerScore(
                        a,
                        statistiques
                    );

                const scoreB =
                    calculerScore(
                        b,
                        statistiques
                    );


                return scoreB - scoreA;

            }
        );


        const groupesTemp =
            [];


        for (
            let i = 0;
            i < classement.length;
            i += CONFIG.TAILLE_GROUPE
        ) {

            groupesTemp.push(
                classement.slice(
                    i,
                    i +
                    CONFIG.TAILLE_GROUPE
                )
            );

        }


        /*
         * Compléter le dernier groupe
         * si nécessaire.
         */

        if (
            groupesTemp.length > 0
        ) {

            const dernier =
                groupesTemp[
                    groupesTemp.length - 1
                ];


            if (
                dernier.length <
                CONFIG.TAILLE_GROUPE
            ) {

                for (
                    const produit of classement
                ) {

                    if (
                        dernier.length >=
                        CONFIG.TAILLE_GROUPE
                    ) {

                        break;

                    }


                    if (
                        !dernier.includes(
                            produit
                        )
                    ) {

                        dernier.push(
                            produit
                        );

                    }

                }

            }

        }


        groupes =
            groupesTemp;

    }


    /* ========================================================
       PRÉCHARGEMENT D'UNE IMAGE
       ======================================================== */

    function prechargerImage(
        url
    ) {

        return new Promise(
            (resolve) => {

                const image =
                    new Image();


                image.onload =
                    () => {

                        resolve({
                            url,
                            ok: true
                        });

                    };


                image.onerror =
                    () => {

                        resolve({
                            url,
                            ok: false
                        });

                    };


                /*
                 * Le navigateur peut réutiliser
                 * son cache HTTP.
                 */

                image.src =
                    url;

            }
        );

    }


    /* ========================================================
       PRÉCHARGER UN GROUPE COMPLET
       ======================================================== */

    async function prechargerGroupe(
        groupe
    ) {

        if (
            !groupe ||
            groupe.length === 0
        ) {

            return;

        }


        /*
         * Les 15 images sont lancées
         * simultanément.
         */

        await Promise.all(
            groupe.map(
                produit =>
                    prechargerImage(
                        produit.image
                    )
            )
        );

    }


    /* ========================================================
       PRÉCHARGER LES GROUPES À L'AVANCE
       ======================================================== */

    async function preparerGroupes() {

        const promesses =
            [];


        for (
            let i = 0;
            i <
            Math.min(
                CONFIG.GROUPES_PRECHARGES,
                groupes.length
            );
            i++
        ) {

            promesses.push(
                prechargerGroupe(
                    groupes[i]
                )
            );

        }


        await Promise.all(
            promesses
        );

    }


    /* ========================================================
       CONSTRUIRE LE CARROUSEL
       ======================================================== */

    function construireCarrousel(
        groupe
    ) {

        piste.innerHTML =
            "";

        indicateurs.innerHTML =
            "";


        groupe.forEach(
            (produit, index) => {

                /* ============================================
                   SLIDE
                   ============================================ */

                const slide =
                    document.createElement(
                        "div"
                    );


                slide.className =
                    "nouvelle-slide";


                /*
                 * IMPORTANT
                 *
                 * La même image est utilisée :
                 *
                 * 1. comme arrière-plan agrandi
                 * 2. comme image nette au premier plan
                 *
                 * Le CSS récupère cette variable
                 * avec :
                 *
                 * background-image:
                 * var(--image-fond)
                 */

                slide.style.setProperty(
                    "--image-fond",
                    `url("${produit.image}")`
                );


                /*
                 * Identification du produit
                 */

                slide.dataset.produitId =
                    produit.id;

                slide.dataset.produitNom =
                    produit.nom;


                /* ============================================
                   LIEN D'ACHAT
                   ============================================ */

                const lien =
                    document.createElement(
                        "a"
                    );


                lien.href =
                    produit.lien;


                lien.target =
                    "_blank";


                lien.rel =
                    "noopener noreferrer";


                /* ============================================
                   IMAGE NETTE AU PREMIER PLAN
                   ============================================ */

                const image =
                    document.createElement(
                        "img"
                    );


                image.src =
                    produit.image;


                image.alt =
                    produit.nom;


                /*
                 * Toutes les images sont chargées
                 * immédiatement car elles ont déjà
                 * été préchargées.
                 */

                image.loading =
                    "eager";


                image.decoding =
                    "async";


                /*
                 * Données produit
                 */

                image.dataset.produitId =
                    produit.id;


                image.dataset.produitNom =
                    produit.nom;


                /*
                 * Empêcher le navigateur de
                 * remplacer l'image par une
                 * miniature paresseuse.
                 */

                image.fetchPriority =
                    index === 0
                        ? "high"
                        : "auto";


                /* ============================================
                   ASSEMBLAGE
                   ============================================ */

                lien.appendChild(
                    image
                );


                slide.appendChild(
                    lien
                );


                piste.appendChild(
                    slide
                );


                /* ============================================
                   INDICATEUR
                   ============================================ */

                const bouton =
                    document.createElement(
                        "button"
                    );


                bouton.type =
                    "button";


                bouton.className =
                    "nouvel-indicateur";


                bouton.dataset.slide =
                    index;


                bouton.setAttribute(
                    "aria-label",
                    "Produit " +
                    (index + 1)
                );


                bouton.addEventListener(
                    "click",
                    () => {

                        afficherImage(
                            index
                        );

                        redemarrerTimer();

                    }
                );


                indicateurs.appendChild(
                    bouton
                );

            }
        );


        /*
         * Première image
         */

        afficherImage(
            0
        );

    }


    /* ========================================================
       AFFICHER UNE IMAGE
       ======================================================== */

    function afficherImage(
        index
    ) {

        const nombre =
            piste.children.length;


        if (
            nombre === 0
        ) {

            return;

        }


        if (
            index >= nombre
        ) {

            index = 0;

        }


        if (
            index < 0
        ) {

            index =
                nombre - 1;

        }


        imageActuelle =
            index;


        piste.style.transition =
            `transform ${CONFIG.DUREE_TRANSITION}ms ease-in-out`;


        piste.style.transform =
            `translate3d(-${index * 100}%, 0, 0)`;


        /*
         * Indicateurs
         */

        document
            .querySelectorAll(
                ".nouvel-indicateur"
            )
            .forEach(
                (bouton, i) => {

                    bouton.classList.toggle(
                        "actif",
                        i === index
                    );

                }
            );


        momentDebutImage =
            maintenant();

    }


    /* ========================================================
       IMAGE SUIVANTE
       ======================================================== */

    function imageSuivante() {

        const nombre =
            piste.children.length;


        if (
            nombre <= 1
        ) {

            return;

        }


        /*
         * Dernière image :
         * retour invisible au premier élément.
         */

        if (
            imageActuelle >=
            nombre - 1
        ) {

            piste.style.transition =
                `transform ${CONFIG.DUREE_TRANSITION}ms ease-in-out`;


            piste.style.transform =
                `translate3d(-${(nombre - 1) * 100}%, 0, 0)`;


            setTimeout(
                () => {

                    piste.style.transition =
                        "none";


                    piste.style.transform =
                        "translate3d(0, 0, 0)";


                    imageActuelle =
                        0;


                    document
                        .querySelectorAll(
                            ".nouvel-indicateur"
                        )
                        .forEach(
                            (bouton, i) => {

                                bouton.classList.toggle(
                                    "actif",
                                    i === 0
                                );

                            }
                        );


                    void piste.offsetWidth;


                    piste.style.transition =
                        `transform ${CONFIG.DUREE_TRANSITION}ms ease-in-out`;


                    momentDebutImage =
                        maintenant();

                },

                CONFIG.DUREE_TRANSITION
            );


            return;

        }


        afficherImage(
            imageActuelle + 1
        );

    }


    /* ========================================================
       STATISTIQUES :
       TEMPS DE CONSULTATION
       ======================================================== */

    function enregistrerTempsProduit() {

        if (
            !produits ||
            produits.length === 0
        ) {

            return;

        }


        const groupe =
            groupes[
                groupeActuel
            ];


        if (
            !groupe
        ) {

            return;

        }


        const produit =
            groupe[
                imageActuelle
            ];


        if (
            !produit
        ) {

            return;

        }


        const temps =
            Math.max(
                0,
                maintenant() -
                momentDebutImage
            );


        const statistiques =
            chargerStatistiques();


        if (
            !statistiques[
                produit.id
            ]
        ) {

            statistiques[
                produit.id
            ] = {

                vues:
                    0,

                temps:
                    0,

                clics:
                    0

            };

        }


        statistiques[
            produit.id
        ].temps +=
            Math.round(
                temps / 1000
            );


        sauvegarderStatistiques(
            statistiques
        );

    }


    /* ========================================================
       VUE DU PRODUIT
       ======================================================== */

    function enregistrerVue() {

        const groupe =
            groupes[
                groupeActuel
            ];


        const produit =
            groupe?.[
                imageActuelle
            ];


        if (
            !produit
        ) {

            return;

        }


        const statistiques =
            chargerStatistiques();


        if (
            !statistiques[
                produit.id
            ]
        ) {

            statistiques[
                produit.id
            ] = {

                vues:
                    0,

                temps:
                    0,

                clics:
                    0

            };

        }


        statistiques[
            produit.id
        ].vues++;


        sauvegarderStatistiques(
            statistiques
        );

    }


    /* ========================================================
       CLIC ACHAT
       ======================================================== */

    function enregistrerClicAchat(
        produitId
    ) {

        const statistiques =
            chargerStatistiques();


        if (
            !statistiques[
                produitId
            ]
        ) {

            statistiques[
                produitId
            ] = {

                vues:
                    0,

                temps:
                    0,

                clics:
                    0

            };

        }


        statistiques[
            produitId
        ].clics++;


        sauvegarderStatistiques(
            statistiques
        );

    }


    /* ========================================================
       ÉCOUTER LES CLICS SUR LES PRODUITS
       ======================================================== */

    piste.addEventListener(
        "click",
        (event) => {

            const lien =
                event.target.closest(
                    ".nouvelle-slide a"
                );


            if (!lien) {

                return;

            }


            const image =
                lien.querySelector(
                    "img"
                );


            if (
                !image
            ) {

                return;

            }


            enregistrerClicAchat(
                image.dataset.produitId
            );

        }
    );


    /* ========================================================
       TIMER
       ======================================================== */

    function redemarrerTimer() {

        if (
            timer
        ) {

            clearInterval(
                timer
            );

        }


        timer =
            setInterval(
                () => {

                    enregistrerTempsProduit();

                    imageSuivante();

                    enregistrerVue();

                },

                CONFIG.DUREE_IMAGE
            );

    }


    /* ========================================================
       CHANGEMENT DE GROUPE
       ======================================================== */

    async function chargerGroupe(
        index
    ) {

        if (
            groupes.length === 0
        ) {

            return;

        }


        groupeActuel =
            index %
            groupes.length;


        const groupe =
            groupes[
                groupeActuel
            ];


        /*
         * Les 15 images sont garanties
         * d'être préchargées avant affichage.
         */

        await prechargerGroupe(
            groupe
        );


        construireCarrousel(
            groupe
        );


        redemarrerTimer();


        /*
         * Préparation du groupe suivant
         * en arrière-plan.
         */

        const suivant =
            (
                groupeActuel + 1
            ) %
            groupes.length;


        prechargerGroupe(
            groupes[
                suivant
            ]
        );

    }


    /* ========================================================
       CHANGEMENT AUTOMATIQUE DE GROUPE
       ======================================================== */

    function heureActuelle() {

        return new Date()
            .getHours();

    }


    function groupePourHeure() {

        if (
            groupes.length === 0
        ) {

            return 0;

        }


        /*
         * Exemple :
         *
         * 08h → groupe 0
         * 09h → groupe 1
         * 10h → groupe 2
         * etc.
         */

        return (
            heureActuelle()
        ) %
        groupes.length;

    }


    async function verifierChangementHoraire() {

        const nouveauGroupe =
            groupePourHeure();


        if (
            nouveauGroupe !==
            groupeActuel
        ) {

            enregistrerTempsProduit();


            await chargerGroupe(
                nouveauGroupe
            );

        }

    }


    /* ========================================================
       INITIALISATION
       ======================================================== */

    async function initialiser() {

        zone.classList.add(
            "chargement"
        );


        try {

            /*
             * Récupération des produits.
             */

            produits =
                await chargerProduits();


            if (
                produits.length === 0
            ) {

                console.error(
                    "Aucun produit trouvé."
                );

                return;

            }


            console.log(
                "Produits trouvés :",
                produits.length
            );


            /*
             * Calcul des groupes.
             */

            creerGroupes();


            console.log(
                "Groupes créés :",
                groupes.length
            );


            /*
             * Préchargement parallèle
             * des premiers groupes.
             */

            await preparerGroupes();


            /*
             * Choisir le groupe correspondant
             * à l'heure actuelle.
             */

            groupeActuel =
                groupePourHeure();


            await chargerGroupe(
                groupeActuel
            );


            zone.classList.remove(
                "chargement"
            );


            /*
             * Vérification du changement
             * d'heure toutes les minutes.
             */

            setInterval(
                verifierChangementHoraire,
                60 * 1000
            );

        }

        catch (erreur) {

            console.error(
                "Erreur carrousel :",
                erreur
            );

        }

    }


    /* ========================================================
       VISIBILITÉ DE LA PAGE
       ======================================================== */

    document.addEventListener(
        "visibilitychange",
        () => {

            if (
                document.hidden
            ) {

                enregistrerTempsProduit();

            }

            else {

                momentDebutImage =
                    maintenant();

            }

        }
    );


    /* ========================================================
       AVANT DE QUITTER
       ======================================================== */

    window.addEventListener(
        "beforeunload",
        () => {

            enregistrerTempsProduit();

        }
    );


    /* ========================================================
       LANCEMENT
       ======================================================== */

    initialiser();

})();