/* =========================================================
   LUMESYS MESSAGERIE
   Firebase Authentication + Firestore
   Projet : lumina-analytics
========================================================= */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth, db } from "../firebase-init.js";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    runTransaction,
    writeBatch,
    query,
    where,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

/* =========================================================
   ÉTAT
========================================================= */

let currentUser = null;
let selectedUser = null;
let currentChatId = null;
let unsubscribeMessages = null;
let unsubscribeChats = null;
let allUsers = [];
let allChats = [];
let currentMode = "users";
let sendInProgress = false;

/* =========================================================
   DOM
========================================================= */

const messengerContainer = document.querySelector(".lumina-messenger");
const emptyConversation = document.getElementById("emptyConversation");
const activeChat = document.getElementById("activeChat");
const contactsList = document.getElementById("contactsList");
const searchInput = document.getElementById("searchInput");
const messagesArea = document.getElementById("messagesArea");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messageForm = document.getElementById("messageForm");
const composerStatus = document.getElementById("composerStatus");
const currentUserAvatar = document.getElementById("currentUserAvatar");
const currentUserName = document.getElementById("currentUserName");
const currentUserEmail = document.getElementById("currentUserEmail");
const chatUserAvatar = document.getElementById("chatUserAvatar");
const chatUserName = document.getElementById("chatUserName");
const chatUserLocation = document.getElementById("chatUserLocation");
const showAllUsersButton = document.getElementById("showAllUsers");
const showRecentChatsButton = document.getElementById("showRecentChats");
const mobileBackButton = document.getElementById("mobileBackButton");

/* =========================================================
   AUTHENTIFICATION
========================================================= */

onAuthStateChanged(auth, async (user) => {
    if (!user || !user.email) {
        afficherStatutComposer("Connectez-vous sur Lumesys pour accéder à la messagerie.", "error");
        setTimeout(() => {
            window.location.href = "../index.html";
        }, 1200);
        return;
    }

    currentUser = user;
    currentUserEmail.textContent = user.email;
    currentUserName.textContent = user.displayName || user.email.split("@")[0];
    renderAvatar(currentUserAvatar, user.photoURL, currentUserName.textContent);

    try {
        await chargerProfilsPublics();
        ecouterConversations();
    } catch (error) {
        afficherErreurFirebase("Initialisation de la messagerie", error);
    }
});

/* =========================================================
   PROFILS PUBLICS
========================================================= */

async function chargerProfilsPublics() {
    contactsList.innerHTML = `
        <div class="loading-state">
            <div class="loader" aria-hidden="true"></div>
            <p>Chargement des utilisateurs…</p>
        </div>
    `;

    const snapshot = await getDocs(collection(db, "public_profiles"));
    allUsers = [];

    snapshot.forEach((documentSnapshot) => {
        const profil = documentSnapshot.data() || {};
        const email = String(documentSnapshot.id || "").trim();
        if (!email) return;
        if (email.toLowerCase() === String(currentUser.email).toLowerCase()) return;

        allUsers.push({
            email,
            profile: profil,
            lastMessage: "",
            updatedAt: null,
            chatId: null
        });
    });

    allUsers.sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b), "fr"));
    afficherUtilisateurs(filtrerUtilisateurs());
}

/* =========================================================
   CONVERSATIONS
========================================================= */

function ecouterConversations() {
    if (unsubscribeChats) {
        unsubscribeChats();
        unsubscribeChats = null;
    }

    const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", currentUser.email)
    );

    unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
        allChats = snapshot.docs.map((chatDocument) => ({ id: chatDocument.id, ...chatDocument.data() }));

        allUsers = allUsers.map((user) => {
            const chat = trouverChatPourUtilisateur(user.email);
            if (!chat) {
                return { ...user, lastMessage: "", updatedAt: null, chatId: null };
            }
            return {
                ...user,
                lastMessage: typeof chat.dernierMessage === "string" ? chat.dernierMessage : "",
                updatedAt: chat.updatedAt || null,
                chatId: chat.id
            };
        });

        rafraichirListe();
    }, (error) => {
        afficherErreurFirebase("Écoute des conversations", error);
    });
}

function trouverChatPourUtilisateur(email) {
    const cible = String(email || "").toLowerCase();
    const moi = String(currentUser.email || "").toLowerCase();
    const attendu = creerChatId(moi, cible);
    return allChats.find((chat) => {
        if (!Array.isArray(chat.participants) || chat.participants.length !== 2) return false;
        const p = chat.participants.map((v) => String(v).toLowerCase());
        return (p.includes(moi) && p.includes(cible)) || chat.id === attendu;
    }) || null;
}

function rafraichirListe() {
    if (currentMode === "recent") {
        afficherConversationsRecentes();
    } else {
        afficherUtilisateurs(filtrerUtilisateurs());
    }
}

/* =========================================================
   AFFICHAGE LISTE
========================================================= */

function afficherUtilisateurs(utilisateurs) {
    contactsList.innerHTML = "";

    if (!utilisateurs.length) {
        contactsList.innerHTML = `
            <div class="no-results">
                ${currentMode === "recent" ? "Aucune conversation récente." : "Aucun utilisateur trouvé."}
            </div>
        `;
        return;
    }

    utilisateurs.forEach((user) => contactsList.appendChild(creerElementUtilisateur(user)));
}

function creerElementUtilisateur(user) {
    const profile = user.profile || {};
    const element = document.createElement("button");
    element.type = "button";
    element.className = "contact-item";
    if (selectedUser && selectedUser.email === user.email) element.classList.add("active");

    const fullName = nomAffiche(user);
    const location = [profile.ville, profile.pays].filter(Boolean).join(", ");
    const dernierMessage = (user.lastMessage && String(user.lastMessage).trim())
        ? String(user.lastMessage)
        : "Commencer une conversation";

    const avatar = document.createElement("div");
    avatar.className = "contact-avatar";
    renderAvatar(avatar, profile.photo, fullName);

    const info = document.createElement("div");
    info.className = "contact-information";
    info.innerHTML = `
        <div class="contact-name">${escapeHTML(fullName)}</div>
        <div class="contact-location">${escapeHTML(location || "Utilisateur Lumesys")}</div>
        <div class="contact-last-message">${escapeHTML(dernierMessage)}</div>
    `;

    element.appendChild(avatar);
    element.appendChild(info);
    element.addEventListener("click", () => {
        document.querySelectorAll(".contact-item").forEach((item) => item.classList.remove("active"));
        element.classList.add("active");
        ouvrirConversation(user);
    });

    return element;
}

/* =========================================================
   OUVERTURE CONVERSATION
========================================================= */

async function ouvrirConversation(user) {
    if (!currentUser || !currentUser.email) return;
    if (sendInProgress) return;

    try {
        selectedUser = user;
        currentChatId = creerChatId(currentUser.email, user.email);

        const profile = user.profile || {};
        const fullName = nomAffiche(user);
        chatUserName.textContent = fullName;
        chatUserLocation.textContent = [profile.ville, profile.region, profile.pays].filter(Boolean).join(" • ") || "Conversation privée Lumesys";
        renderAvatar(chatUserAvatar, profile.photo, fullName);

        emptyConversation.style.display = "none";
        activeChat.classList.add("visible");
        messengerContainer.classList.add("chat-open");
        activerComposer(true);
        afficherStatutComposer("Chargement de la conversation…", "");

        await creerChatSiNecessaire();
        ecouterMessages();
        afficherStatutComposer("", "");
        messageInput.focus();
    } catch (error) {
        activerComposer(false);
        afficherErreurFirebase("Ouverture de la conversation", error);
    }
}

function creerChatId(email1, email2) {
    return [String(email1).toLowerCase(), String(email2).toLowerCase()]
        .sort()
        .join("__")
        .replace(/[^a-z0-9_@.-]/gi, "_");
}

async function creerChatSiNecessaire() {
    const existingChat = allChats.find((chat) =>
        participantsValides(chat.participants, currentUser.email, selectedUser.email)
    );

    if (existingChat) {
        currentChatId = existingChat.id;
        return;
    }

    const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", currentUser.email)
    );
    const chatsSnapshot = await getDocs(chatsQuery);
    const matchingChat = chatsSnapshot.docs.find((chatDocument) =>
        participantsValides(
            chatDocument.data().participants,
            currentUser.email,
            selectedUser.email
        )
    );

    if (matchingChat) {
        currentChatId = matchingChat.id;
        return;
    }

    const chatReference = doc(db, "chats", currentChatId);
    await runTransaction(db, async (transaction) => {
        const chatSnapshot = await transaction.get(chatReference);

        if (chatSnapshot.exists()) {
            const chat = chatSnapshot.data() || {};
            if (!participantsValides(chat.participants, currentUser.email, selectedUser.email)) {
                throw new Error("Cette conversation n'est pas valide pour ces participants.");
            }
            return;
        }

        transaction.set(chatReference, {
            participants: [currentUser.email, selectedUser.email].sort(),
            dernierMessage: "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    });
}

function participantsValides(participants, emailA, emailB) {
    if (!Array.isArray(participants) || participants.length !== 2) return false;
    const p = participants.map((v) => String(v).toLowerCase());
    return p.includes(String(emailA).toLowerCase()) && p.includes(String(emailB).toLowerCase());
}

/* =========================================================
   MESSAGES
========================================================= */

function ecouterMessages() {
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }

    const messagesQuery = query(collection(db, "chats", currentChatId, "messages"));
    unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        const messages = snapshot.docs
            .map((messageDocument) => ({ id: messageDocument.id, ...messageDocument.data() }))
            .sort((a, b) => horodatageMillis(a.createdAt) - horodatageMillis(b.createdAt));

        messagesArea.innerHTML = "";
        if (!messages.length) {
            messagesArea.innerHTML = `<div class="no-results">Aucun message pour le moment. Envoyez le premier message.</div>`;
        } else {
            messages.forEach(afficherMessage);
        }
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }, (error) => {
        afficherErreurFirebase("Lecture des messages", error);
    });
}

function afficherMessage(message) {
    const sender = String(message.senderId || message.expediteurId || "").toLowerCase();
    const isMine = sender === String(currentUser.email || "").toLowerCase();

    const row = document.createElement("div");
    row.className = isMine ? "message-row mine" : "message-row other";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const messageText = document.createElement("div");
    messageText.textContent = String(message.text || message.contenu || "");

    const time = document.createElement("div");
    time.className = "message-time";
    const date = horodatageDate(message.createdAt);
    time.textContent = date ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "…";

    bubble.appendChild(messageText);
    bubble.appendChild(time);
    row.appendChild(bubble);
    messagesArea.appendChild(row);
}

async function envoyerMessage(event) {
    if (event) event.preventDefault();

    const text = messageInput.value.trim();
    if (!text) return;
    if (sendInProgress) return;
    if (!currentUser || !currentUser.email) {
        afficherStatutComposer("Connexion requise pour envoyer un message.", "error");
        return;
    }
    if (!selectedUser || !currentChatId) {
        afficherStatutComposer("Sélectionnez une conversation avant d'envoyer.", "error");
        return;
    }
    if (text.length > 5000) {
        afficherStatutComposer("Le message est trop long (5000 caractères maximum).", "error");
        return;
    }

    try {
        sendInProgress = true;
        activerComposer(false);
        afficherStatutComposer("Envoi en cours…", "");

        const chatReference = doc(db, "chats", currentChatId);
        const chatSnapshot = await getDoc(chatReference);
        if (!chatSnapshot.exists()) {
            throw new Error("La conversation n'existe pas. Réouvrez la conversation.");
        }

        const chat = chatSnapshot.data() || {};
        if (!participantsValides(chat.participants, currentUser.email, selectedUser.email)) {
            throw new Error("Vous ne faites pas partie de cette conversation.");
        }

        const messageReference = doc(collection(db, "chats", currentChatId, "messages"));
        const batch = writeBatch(db);
        batch.set(messageReference, {
            senderId: currentUser.email,
            text,
            createdAt: serverTimestamp()
        });
        batch.update(chatReference, {
            dernierMessage: text,
            updatedAt: serverTimestamp()
        });
        await batch.commit();

        messageInput.value = "";
        ajusterHauteurTextarea();
        afficherStatutComposer("Message envoyé.", "success");
        setTimeout(() => {
            if (composerStatus.textContent === "Message envoyé.") afficherStatutComposer("", "");
        }, 1800);
    } catch (error) {
        afficherErreurFirebase("Envoi du message", error);
    } finally {
        sendInProgress = false;
        activerComposer(Boolean(selectedUser));
        messageInput.focus();
    }
}

/* =========================================================
   RECHERCHE / NAVIGATION
========================================================= */

function filtrerUtilisateurs() {
    const search = String(searchInput.value || "").toLowerCase().trim();
    if (!search) return allUsers;
    return allUsers.filter((user) => {
        const profile = user.profile || {};
        const fullName = nomAffiche(user).toLowerCase();
        const location = `${profile.ville || ""} ${profile.pays || ""}`.toLowerCase();
        const email = String(user.email || "").toLowerCase();
        return fullName.includes(search) || location.includes(search) || email.includes(search);
    });
}

function afficherConversationsRecentes() {
    const conversations = allUsers
        .filter((user) => user.lastMessage && String(user.lastMessage).trim() !== "")
        .sort((a, b) => horodatageMillis(b.updatedAt) - horodatageMillis(a.updatedAt));
    afficherUtilisateurs(conversations);
}

searchInput.addEventListener("input", () => {
    if (currentMode !== "users") setMode("users");
    else afficherUtilisateurs(filtrerUtilisateurs());
});

showAllUsersButton.addEventListener("click", () => setMode("users"));
showRecentChatsButton.addEventListener("click", () => setMode("recent"));

function setMode(mode) {
    currentMode = mode === "recent" ? "recent" : "users";
    showAllUsersButton.classList.toggle("active", currentMode === "users");
    showRecentChatsButton.classList.toggle("active", currentMode === "recent");
    showAllUsersButton.setAttribute("aria-pressed", String(currentMode === "users"));
    showRecentChatsButton.setAttribute("aria-pressed", String(currentMode === "recent"));
    rafraichirListe();
}

/* =========================================================
   SAISIE / MOBILE
========================================================= */

function ajusterHauteurTextarea() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
}

messageInput.addEventListener("input", ajusterHauteurTextarea);
messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        envoyerMessage();
    }
});
if (messageForm) messageForm.addEventListener("submit", envoyerMessage);
else sendButton.addEventListener("click", envoyerMessage);

mobileBackButton.addEventListener("click", () => {
    messengerContainer.classList.remove("chat-open");
    activeChat.classList.remove("visible");
    emptyConversation.style.display = "flex";
    selectedUser = null;
    currentChatId = null;
    activerComposer(false);
    afficherStatutComposer("", "");
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    rafraichirListe();
});

activerComposer(false);

/* =========================================================
   UI / UTILITAIRES
========================================================= */

function activerComposer(actif) {
    const enabled = Boolean(actif && selectedUser && currentChatId && !sendInProgress);
    messageInput.disabled = !enabled;
    sendButton.disabled = !enabled;
}

function afficherStatutComposer(message, type) {
    if (!composerStatus) return;
    composerStatus.textContent = message || "";
    composerStatus.classList.remove("error", "success");
    if (type) composerStatus.classList.add(type);
}

function nomAffiche(user) {
    const profile = (user && user.profile) || {};
    const fullName = `${profile.prenom || ""} ${profile.nom || ""}`.trim();
    return fullName || (user && user.email) || "Utilisateur Lumesys";
}

function renderAvatar(container, photoUrl, name) {
    if (!container) return;
    container.innerHTML = "";
    const src = typeof photoUrl === "string" ? photoUrl.trim() : "";
    if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = name || "Photo de profil";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => {
            container.textContent = getInitial(name);
        }, { once: true });
        container.appendChild(img);
        return;
    }
    container.textContent = getInitial(name);
}

function horodatageDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") {
        try { return value.toDate(); } catch { return null; }
    }
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function horodatageMillis(value) {
    const date = horodatageDate(value);
    return date ? date.getTime() : 0;
}

function getInitial(name) {
    return (String(name || "").trim().charAt(0).toUpperCase() || "?");
}

function escapeHTML(text) {
    const div = document.createElement("div");
    div.textContent = String(text == null ? "" : text);
    return div.innerHTML;
}

function afficherErreurFirebase(contexte, error) {
    console.error(`Erreur Firebase — ${contexte}`, {
        code: error && error.code,
        message: error && error.message,
        details: error
    });

    let message = "Une erreur est survenue.";
    if (error && error.code === "permission-denied") {
        message = "Accès refusé par les règles Firestore. Vérifiez que vous êtes connecté, participant à la conversation, et que les règles déployées correspondent au schéma senderId/text.";
    } else if (error && error.code === "failed-precondition") {
        message = "Firestore demande une configuration supplémentaire (index ou précondition).";
    } else if (error && error.code === "unauthenticated") {
        message = "Session expirée. Reconnectez-vous sur Lumesys.";
    } else if (error && error.code === "unavailable") {
        message = "Connexion réseau indisponible. Vérifiez Internet puis réessayez.";
    } else if (error && error.message) {
        message = error.message;
    }

    afficherStatutComposer(`${contexte} : ${message}`, "error");
}
