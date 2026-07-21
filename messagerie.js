/* =========================================================
   LUMINA MESSENGER
   Firebase Authentication + Firestore
   Projet : lumina-analytics
========================================================= */


/* =========================================================
   IMPORTS FIREBASE
========================================================= */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";


/* =========================================================
   CONFIGURATION FIREBASE
   EXACTEMENT CELLE DE TON SITE
========================================================= */

const firebaseConfig = {

    apiKey: "AIzaSyAClwRQe3g4Cg9CAsn28l_sAihwlMQtGUI",

    authDomain: "lumina-analytics.firebaseapp.com",

    projectId: "lumina-analytics",

    storageBucket: "lumina-analytics.appspot.com",

    messagingSenderId: "239329398532",

    appId: "1:239329398532:web:2f68b196df0c4e6400ca51",

    measurementId: "G-J7LLPRXLJH"

};


/* =========================================================
   INITIALISATION
========================================================= */

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);


/* =========================================================
   VARIABLES GLOBALES
========================================================= */

let currentUser = null;

let selectedUser = null;

let currentChatId = null;

let unsubscribeMessages = null;

let unsubscribeChats = null;

let allUsers = [];

let allChats = [];

let currentMode = "users";


/* =========================================================
   ELEMENTS HTML
========================================================= */

const messengerContainer =
    document.querySelector(".lumina-messenger");

const emptyConversation =
    document.getElementById("emptyConversation");

const activeChat =
    document.getElementById("activeChat");

const contactsList =
    document.getElementById("contactsList");

const searchInput =
    document.getElementById("searchInput");

const messagesArea =
    document.getElementById("messagesArea");

const messageInput =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");

const currentUserAvatar =
    document.getElementById("currentUserAvatar");

const currentUserName =
    document.getElementById("currentUserName");

const currentUserEmail =
    document.getElementById("currentUserEmail");

const chatUserAvatar =
    document.getElementById("chatUserAvatar");

const chatUserName =
    document.getElementById("chatUserName");

const chatUserLocation =
    document.getElementById("chatUserLocation");


/* =========================================================
   AUTHENTIFICATION
========================================================= */

onAuthStateChanged(

    auth,

    async (user) => {

        if (!user) {

            alert(
                "Vous devez être connecté pour accéder à la messagerie."
            );

            window.location.href = "index.html";

            return;
        }


        currentUser = user;


        currentUserEmail.textContent =
            user.email;


        currentUserName.textContent =
            user.displayName ||
            user.email.split("@")[0];


        currentUserAvatar.textContent =
            getInitial(
                user.displayName ||
                user.email
            );


        if (user.photoURL) {

            currentUserAvatar.innerHTML = `

                <img
                    src="${escapeAttribute(user.photoURL)}"
                    alt="Photo de profil"
                >

            `;

        }


        await chargerProfilsPublics();


        ecouterConversations();

    }

);


/* =========================================================
   CHARGER LES UTILISATEURS DEPUIS public_profiles
========================================================= */

async function chargerProfilsPublics() {

    try {

        const profilsReference =

            collection(

                db,

                "public_profiles"

            );


        const snapshot =

            await getDocs(

                profilsReference

            );


        allUsers = [];


        snapshot.forEach(

            (documentSnapshot) => {


                const profil =

                    documentSnapshot.data();


                const email =

                    documentSnapshot.id;


                /*
                    EXCLURE L'UTILISATEUR CONNECTÉ
                */

                if (

                    email.toLowerCase() ===

                    currentUser.email.toLowerCase()

                ) {

                    return;

                }


                allUsers.push({

                    email: email,

                    profile: profil,

                    lastMessage: "",

                    updatedAt: null,

                    chatId: null

                });

            }

        );


        afficherUtilisateurs(

            allUsers

        );


    }

    catch (error) {


        console.error(

            "Erreur lors du chargement des profils :",

            error

        );


        contactsList.innerHTML = `

            <div class="no-results">

                Impossible de charger les utilisateurs.

            </div>

        `;

    }

}


/* =========================================================
   ECOUTER LES CONVERSATIONS DE L'UTILISATEUR
========================================================= */

function ecouterConversations() {


    const chatsReference =

        collection(

            db,

            "chats"

        );


    const chatsQuery =

        query(

            chatsReference,

            where(

                "participants",

                "array-contains",

                currentUser.email

            )

        );


    unsubscribeChats =

        onSnapshot(

            chatsQuery,

            (snapshot) => {


                allChats = [];


                snapshot.forEach(

                    (chatDocument) => {


                        const chat =

                            chatDocument.data();


                        allChats.push({

                            id:

                                chatDocument.id,

                            ...chat

                        });

                    }

                );


                /*
                    METTRE À JOUR LES DERNIERS MESSAGES
                    DANS LES PROFILS
                */

                allUsers =

                    allUsers.map(

                        (user) => {


                            const chat =

                                allChats.find(

                                    (chat) =>

                                        chat.participants &&

                                        chat.participants.includes(

                                            user.email

                                        )

                                );


                            if (chat) {


                                return {

                                    ...user,

                                    lastMessage:

                                        chat.dernierMessage ||

                                        "",

                                    updatedAt:

                                        chat.updatedAt ||

                                        null,

                                    chatId:

                                        chat.id

                                };

                            }


                            return user;

                        }

                    );


                if (

                    currentMode === "recent"

                ) {


                    afficherConversationsRecentes();

                }

                else {


                    afficherUtilisateurs(

                        filtrerUtilisateurs()

                    );

                }

            },


            (error) => {


                console.error(

                    "Erreur d'écoute des conversations :",

                    error

                );

            }

        );

}


/* =========================================================
   AFFICHER TOUS LES UTILISATEURS
========================================================= */

function afficherUtilisateurs(

    utilisateurs

) {


    contactsList.innerHTML = "";


    if (

        utilisateurs.length === 0

    ) {


        contactsList.innerHTML = `

            <div class="no-results">

                Aucun utilisateur trouvé.

            </div>

        `;


        return;

    }


    utilisateurs.forEach(

        (user) => {


            const element =

                creerElementUtilisateur(

                    user

                );


            contactsList.appendChild(

                element

            );

        }

    );

}


/* =========================================================
   CREER UNE CARTE UTILISATEUR
========================================================= */

function creerElementUtilisateur(

    user

) {


    const profile =

        user.profile;


    const element =

        document.createElement(

            "div"

        );


    element.className =

        "contact-item";


    const fullName =

        `${profile.prenom || ""} ${profile.nom || ""}`

            .trim() ||

        user.email;


    const initial =

        getInitial(

            fullName

        );


    let avatarHTML = `

        <div class="contact-avatar">

            ${initial}

        </div>

    `;


    if (

        profile.photo &&

        profile.photo.trim() !== ""

    ) {


        avatarHTML = `

            <div class="contact-avatar">

                <img

                    src="${escapeAttribute(profile.photo)}"

                    alt="${escapeAttribute(fullName)}"

                >

            </div>

        `;

    }


    const location =

        [

            profile.ville,

            profile.pays

        ]

        .filter(Boolean)

        .join(", ");


    const dernierMessage =

        user.lastMessage &&

        user.lastMessage.trim() !== ""

        ? user.lastMessage

        : "Commencer une conversation";


    element.innerHTML = `

        ${avatarHTML}

        <div class="contact-information">

            <div class="contact-name">

                ${escapeHTML(fullName)}

            </div>

            <div class="contact-location">

                ${escapeHTML(

                    location ||

                    "Utilisateur Lumina"

                )}

            </div>

            <div class="contact-last-message">

                ${escapeHTML(

                    dernierMessage

                )}

            </div>

        </div>

    `;


    element.addEventListener(

        "click",

        () => {


            document

                .querySelectorAll(

                    ".contact-item"

                )

                .forEach(

                    item =>

                        item.classList.remove(

                            "active"

                        )

                );


            element.classList.add(

                "active"

            );


            ouvrirConversation(

                user

            );

        }

    );


    return element;

}


/* =========================================================
   CREER UN CHAT ID STABLE
========================================================= */

function creerChatId(

    email1,

    email2

) {


    return [

        email1.toLowerCase(),

        email2.toLowerCase()

    ]

    .sort()

    .join("_")

    .replace(

        /[^a-zA-Z0-9_@.-]/g,

        ""

    );

}


/* =========================================================
   OUVRIR UNE CONVERSATION
========================================================= */

async function ouvrirConversation(

    user

) {


    selectedUser =

        user;


    currentChatId =

        creerChatId(

            currentUser.email,

            user.email

        );


    const profile =

        user.profile;


    const fullName =

        `${profile.prenom || ""} ${profile.nom || ""}`

            .trim() ||

        user.email;


    chatUserName.textContent =

        fullName;


    chatUserLocation.textContent =

        [

            profile.ville,

            profile.region,

            profile.pays

        ]

        .filter(Boolean)

        .join(" • ") ||

        "Utilisateur Lumina";


    chatUserAvatar.innerHTML =

        getInitial(

            fullName

        );


    if (

        profile.photo &&

        profile.photo.trim() !== ""

    ) {


        chatUserAvatar.innerHTML = `

            <img

                src="${escapeAttribute(profile.photo)}"

                alt="${escapeAttribute(fullName)}"

            >

        `;

    }


    emptyConversation.style.display =

        "none";


    activeChat.classList.add(

        "visible"

    );


    messengerContainer.classList.add(

        "chat-open"

    );


    await creerChatSiNecessaire();


    ecouterMessages();


    messageInput.focus();

}


/* =========================================================
   CREER LE CHAT S'IL N'EXISTE PAS
========================================================= */

async function creerChatSiNecessaire() {


    const chatReference =

        doc(

            db,

            "chats",

            currentChatId

        );


    const chatSnapshot =

        await getDoc(

            chatReference

        );


    /*
        SI LE CHAT N'EXISTE PAS,
        ON LE CRÉE.
    */

    if (

        !chatSnapshot.exists()

    ) {


        await setDoc(

            chatReference,

            {


                participants: [

                    currentUser.email,

                    selectedUser.email

                ]

                .sort(),


                dernierMessage: "",


                createdAt:

                    serverTimestamp(),


                updatedAt:

                    serverTimestamp()

            }

        );

    }

}


/* =========================================================
   ECOUTER LES MESSAGES EN TEMPS REEL
========================================================= */

function ecouterMessages() {


    if (

        unsubscribeMessages

    ) {


        unsubscribeMessages();

    }


    const messagesReference =

        collection(

            db,

            "chats",

            currentChatId,

            "messages"

        );


    const messagesQuery =

        query(

            messagesReference,

            orderBy(

                "createdAt",

                "asc"

            )

        );


    unsubscribeMessages =

        onSnapshot(

            messagesQuery,

            (snapshot) => {


                messagesArea.innerHTML = "";


                snapshot.forEach(

                    (messageDocument) => {


                        afficherMessage(

                            messageDocument.data()

                        );

                    }

                );


                messagesArea.scrollTop =

                    messagesArea.scrollHeight;

            },


            (error) => {


                console.error(

                    "Erreur des messages :",

                    error

                );

            }

        );

}


/* =========================================================
   AFFICHER UN MESSAGE
========================================================= */

function afficherMessage(

    message

) {


    const isMine =

        message.senderId ===

        currentUser.email;


    const row =

        document.createElement(

            "div"

        );


    row.className =

        isMine

        ? "message-row mine"

        : "message-row other";


    const bubble =

        document.createElement(

            "div"

        );


    bubble.className =

        "message-bubble";


    const messageText =

        document.createElement(

            "div"

        );


    /*
        textContent empêche
        l'injection HTML
    */

    messageText.textContent =

        message.text || "";


    const time =

        document.createElement(

            "div"

        );


    time.className =

        "message-time";


    if (

        message.createdAt &&

        typeof message.createdAt.toDate ===

        "function"

    ) {


        const date =

            message.createdAt.toDate();


        time.textContent =

            date.toLocaleTimeString(

                "fr-FR",

                {

                    hour: "2-digit",

                    minute: "2-digit"

                }

            );

    }


    bubble.appendChild(

        messageText

    );


    bubble.appendChild(

        time

    );


    row.appendChild(

        bubble

    );


    messagesArea.appendChild(

        row

    );

}


/* =========================================================
   ENVOYER UN MESSAGE
========================================================= */

async function envoyerMessage() {


    const text =

        messageInput.value.trim();


    if (

        !text

    ) {

        return;

    }


    if (

        !selectedUser

    ) {

        return;

    }


    if (

        !currentChatId

    ) {

        return;

    }


    try {


        const messagesReference =

            collection(

                db,

                "chats",

                currentChatId,

                "messages"

            );


        await addDoc(

            messagesReference,

            {


                senderId:

                    currentUser.email,


                text:

                    text,


                createdAt:

                    serverTimestamp()

            }

        );


        await updateDoc(

            doc(

                db,

                "chats",

                currentChatId

            ),

            {


                dernierMessage:

                    text,


                updatedAt:

                    serverTimestamp()

            }

        );


        messageInput.value = "";


        messageInput.style.height =

            "auto";


        messageInput.focus();

    }


    catch (error) {


        console.error(

            "Erreur lors de l'envoi :",

            error

        );


        alert(

            "Impossible d'envoyer le message."

        );

    }

}


/* =========================================================
   RECHERCHE UTILISATEUR
========================================================= */

searchInput.addEventListener(

    "input",

    () => {


        if (

            currentMode !== "users"

        ) {


            currentMode =

                "users";


            document

                .getElementById(

                    "showAllUsers"

                )

                .classList

                .add(

                    "active"

                );


            document

                .getElementById(

                    "showRecentChats"

                )

                .classList

                .remove(

                    "active"

                );

        }


        afficherUtilisateurs(

            filtrerUtilisateurs()

        );

    }

);


/* =========================================================
   FILTRER LES UTILISATEURS
========================================================= */

function filtrerUtilisateurs() {


    const search =

        searchInput.value

            .toLowerCase()

            .trim();


    if (

        !search

    ) {


        return allUsers;

    }


    return allUsers.filter(

        (user) => {


            const profile =

                user.profile;


            const name =

                `${profile.prenom || ""} ${profile.nom || ""}`

                    .toLowerCase();


            const location =

                `${profile.ville || ""} ${profile.pays || ""}`

                    .toLowerCase();


            const email =

                user.email

                    .toLowerCase();


            return (

                name.includes(search) ||

                location.includes(search) ||

                email.includes(search)

            );

        }

    );

}


/* =========================================================
   TEXTAREA AUTOMATIQUE
========================================================= */

messageInput.addEventListener(

    "input",

    () => {


        messageInput.style.height =

            "auto";


        messageInput.style.height =

            `${messageInput.scrollHeight}px`;

    }

);


/* =========================================================
   ENTER POUR ENVOYER
========================================================= */

messageInput.addEventListener(

    "keydown",

    (event) => {


        if (

            event.key === "Enter" &&

            !event.shiftKey

        ) {


            event.preventDefault();


            envoyerMessage();

        }

    }

);


/* =========================================================
   BOUTON ENVOYER
========================================================= */

sendButton.addEventListener(

    "click",

    envoyerMessage

);


/* =========================================================
   CONVERSATIONS RECENTES
========================================================= */

document

    .getElementById(

        "showRecentChats"

    )

    .addEventListener(

        "click",

        () => {


            currentMode =

                "recent";


            document

                .getElementById(

                    "showRecentChats"

                )

                .classList

                .add(

                    "active"

                );


            document

                .getElementById(

                    "showAllUsers"

                )

                .classList

                .remove(

                    "active"

                );


            afficherConversationsRecentes();

        }

    );


function afficherConversationsRecentes() {


    const conversations =

        allUsers

            .filter(

                user =>

                    user.lastMessage &&

                    user.lastMessage.trim() !== ""

            )

            .sort(

                (a, b) => {


                    const dateA =

                        a.updatedAt &&

                        typeof a.updatedAt.toDate ===

                        "function"

                        ? a.updatedAt.toDate()

                        : new Date(0);


                    const dateB =

                        b.updatedAt &&

                        typeof b.updatedAt.toDate ===

                        "function"

                        ? b.updatedAt.toDate()

                        : new Date(0);


                    return dateB - dateA;

                }

            );


    if (

        conversations.length === 0

    ) {


        contactsList.innerHTML = `

            <div class="no-results">

                Aucune conversation récente.

            </div>

        `;


        return;

    }


    afficherUtilisateurs(

        conversations

    );

}


/* =========================================================
   RETOUR MOBILE
========================================================= */

document

    .getElementById(

        "mobileBackButton"

    )

    .addEventListener(

        "click",

        () => {


            messengerContainer

                .classList

                .remove(

                    "chat-open"

                );


            activeChat.classList

                .remove(

                    "visible"

                );


            emptyConversation.style.display =

                "flex";


            selectedUser =

                null;


            currentChatId =

                null;


            if (

                unsubscribeMessages

            ) {


                unsubscribeMessages();

            }

        }

    );


/* =========================================================
   UTILITAIRES
========================================================= */

function getInitial(

    name

) {


    return (

        String(name)

            .trim()

            .charAt(0)

            .toUpperCase()

        || "?"

    );

}


function escapeHTML(

    text

) {


    const div =

        document.createElement(

            "div"

        );


    div.textContent =

        text;


    return div.innerHTML;

}


function escapeAttribute(

    text

) {


    return String(text)

        .replace(

            /&/g,

            "&amp;"

        )

        .replace(

            /"/g,

            "&quot;"

        )

        .replace(

            /</g,

            "&lt;"

        )

        .replace(

            />/g,

            "&gt;"

        );

}