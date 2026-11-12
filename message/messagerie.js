/* =========================================================
   LUMESYS MESSAGERIE
   Firebase Authentication + Firestore
   Projet : lumina-analytics
========================================================= */

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth, db } from "../firebase-init.js";
import "../avatar-upload.js";
import { ensurePrivateProfile, editPhoneSettings, editLocationSettings, searchPhone } from "../profile-onboarding.js";
import { listPhoneCountries, parseInternationalPhone } from "../phone-utils.js";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    writeBatch,
    query,
    where,
    onSnapshot,
    serverTimestamp,
    setDoc,
    runTransaction,
    orderBy,
    limit,
    startAfter,
    updateDoc,
    arrayUnion,
    deleteField
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

/* =========================================================
   ÉTAT GLOBAL
========================================================= */

let currentUser = null;
let currentUserUid = null;
let selectedUser = null;
let currentChatId = null;

let unsubscribeMessages = null;
let unsubscribeChats = null;
let unsubscribeIncomingRequests = null;
let unsubscribeSentRequests = null;
let unsubscribeProfils = null;

let allUsers = [];
let allChats = [];
let incomingContactRequests = [];
let sentContactRequests = [];
let allContactRequests = [];
const requestOperationsInProgress = new Set();
const requestsBeingCancelled = new Set();

let currentMode = "users"; // "users" | "recent" | "requests"
let currentRequestsSubnav = "incoming"; // "incoming" | "sent"
let sendInProgress = false;
let scrollInfiniInitialise = false;
let selectedMessageIds = new Set();
let currentReply = null;
let contextMenuMessageId = null;
let pendingForwardMessageIds = [];
let selectedForwardEmails = new Set();
let pendingDeleteIds = [];
let pendingDeleteMode = "me";

/* Pagination des messages */
let messageDocs = [];
let lastVisibleDoc = null;
let hasMoreMessages = true;
let loadingMore = false;
let realtimeListenerActive = false;

/* =========================================================
   CACHE LOCAL
========================================================= */

const CACHE_PREFIX = "lumesys_messagerie_cache_";

function cacheKey() {
    return CACHE_PREFIX + String(currentUser && currentUser.email ? currentUser.email : "guest").toLowerCase();
}

function lireCache() {
    try {
        const raw = localStorage.getItem(cacheKey());
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.users)) return null;
        return parsed;
    } catch (error) {
        return null;
    }
}

function ecrireCache() {
    try {
        const payload = JSON.stringify({
            users: allUsers,
            chats: allChats,
            ts: Date.now()
        });
        localStorage.setItem(cacheKey(), payload);
    } catch (error) {
        // Ignorer si stockage restreint
    }
}

function appliquerCache() {
    const cache = lireCache();
    if (!cache) return false;
    allUsers = Array.isArray(cache.users) ? cache.users : [];
    allChats = Array.isArray(cache.chats) ? cache.chats : [];
    try {
        rafraichirListe();
    } catch (error) {
        // Ignorer
    }
    return true;
}

/* =========================================================
   DOM ÉLÉMENTS
========================================================= */

const messengerContainer = document.querySelector(".lumina-messenger");
const emptyConversation = document.getElementById("emptyConversation");
const activeChat = document.getElementById("activeChat");
const contactsList = document.getElementById("contactsList");
const searchBoxWrap = document.getElementById("searchBoxWrap");
const searchInput = document.getElementById("searchInput");
const searchMode = document.getElementById("searchMode");
const searchCountry = document.getElementById("searchCountry");
const phoneSearchButton = document.getElementById("phoneSearchButton");
const phoneSearchStatus = document.getElementById("phoneSearchStatus");
const messagesArea = document.getElementById("messagesArea");
const selectionToolbar = document.getElementById("selectionToolbar");
const replyPreview = document.getElementById("replyPreview");
const replyPreviewAuthor = document.getElementById("replyPreviewAuthor");
const replyPreviewText = document.getElementById("replyPreviewText");
const cancelReplyButton = document.getElementById("cancelReplyButton");
const contextMenu = document.getElementById("contextMenu");
const forwardModal = document.getElementById("forwardModal");
const forwardSearch = document.getElementById("forwardSearch");
const forwardList = document.getElementById("forwardList");
const forwardConfirm = document.getElementById("forwardConfirm");
const forwardCancel = document.getElementById("forwardCancel");
const confirmModal = document.getElementById("confirmModal");
const confirmText = document.getElementById("confirmText");
const confirmCancel = document.getElementById("confirmCancel");
const confirmOk = document.getElementById("confirmOk");
const toast = document.getElementById("toast");
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
const pinnedMessageBanner = document.getElementById("pinnedMessageBanner");

const showAllUsersButton = document.getElementById("showAllUsers");
const showRecentChatsButton = document.getElementById("showRecentChats");
const showRequestsButton = document.getElementById("showRequests");
const requestsCountBadge = document.getElementById("requestsCountBadge");

const requestsSubnav = document.getElementById("requestsSubnav");
const subnavIncoming = document.getElementById("subnavIncoming");
const subnavSent = document.getElementById("subnavSent");
const subnavIncomingCount = document.getElementById("subnavIncomingCount");
const subnavSentCount = document.getElementById("subnavSentCount");

const contactRequestsPanel = document.getElementById("contactRequestsPanel");
const incomingRequestsList = document.getElementById("incomingRequestsList");
const sentRequestsList = document.getElementById("sentRequestsList");
const mobileBackButton = document.getElementById("mobileBackButton");
const editPhoneSettingsButton = document.getElementById("editPhoneSettings");
const editLocationSettingsButton = document.getElementById("editLocationSettings");
let phoneSearchSequence = 0;
let phoneSearchResult = null;

if (searchCountry) {
    searchCountry.innerHTML = listPhoneCountries()
        .map(({ country, callingCode, name }) => `<option value="${country}">${escapeHTML(name)} (+${callingCode})</option>`)
        .join("");
    searchCountry.value = "ML";
}

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
    currentUserUid = user.uid || user.email;
    currentUserEmail.textContent = user.email.toLowerCase();
    currentUserName.textContent = user.displayName || user.email.split("@")[0];
    renderAvatar(currentUserAvatar, user.photoURL, currentUserName.textContent);

    try { appliquerCache(); } catch (error) { /* ignore */ }

    try {
        const [userSnapshot, publicSnapshot] = await Promise.all([
            getDoc(doc(db, "utilisateurs", String(user.email).toLowerCase())),
            getDoc(doc(db, "public_profiles", String(user.email).toLowerCase()))
        ]);
        await ensurePrivateProfile({
            user,
            db,
            userData: userSnapshot.exists() ? userSnapshot.data() : {},
            publicData: publicSnapshot.exists() ? publicSnapshot.data() : {}
        });
        await synchroniserProfilCourant(user);
        await chargerProfilsPublics();
        ecouterDemandesContacts();
        ecouterConversations();
    } catch (error) {
        afficherErreurFirebase("Initialisation de la messagerie", error);
    }
});

/**
 * Enregistre ou met à jour l'UID et l'email dans public_profiles
 * afin que les autres utilisateurs puissent lier leurs requêtes directement.
 */
async function synchroniserProfilCourant(user) {
    if (!user || !user.email) return;
    try {
        const email = String(user.email).toLowerCase();
        const profileRef = doc(db, "public_profiles", email);
        const snap = await getDoc(profileRef);
        const data = snap.exists() ? snap.data() : {};

        const prenom = data.prenom || (user.displayName ? user.displayName.split(" ")[0] : "");
        const nom = data.nom || (user.displayName ? user.displayName.split(" ").slice(1).join(" ") : "");

        await setDoc(profileRef, {
            uid: user.uid,
            email: email,
            prenom: prenom,
            nom: nom,
            photo: data.photo || user.photoURL || "",
            updatedAt: serverTimestamp()
        }, { merge: true });
        renderAvatar(currentUserAvatar, data.photo || user.photoURL, currentUserName.textContent);
    } catch (err) {
        console.warn("Synchronisation du profil public:", err);
    }
}

/* =========================================================
   PROFILS PUBLICS (Tous les utilisateurs inscrits)
========================================================= */

async function chargerProfilsPublics() {
    if (unsubscribeProfils) {
        unsubscribeProfils();
        unsubscribeProfils = null;
    }

    if (!lireCache()) {
        contactsList.innerHTML = `
            <div class="loading-state">
                <div class="loader" aria-hidden="true"></div>
                <p>Chargement des utilisateurs…</p>
            </div>
        `;
    }

    const profilsQuery = collection(db, "public_profiles");

    unsubscribeProfils = onSnapshot(profilsQuery, (snapshot) => {
        const existants = new Map(allUsers.map((u) => [String(u.email).toLowerCase(), u]));
        const myEmail = String(currentUser.email).toLowerCase();

        allUsers = [];
        snapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data() || {};
            const email = String(data.email || documentSnapshot.id || "").trim().toLowerCase();
            if (!email) return;
            if (email === myEmail) return;

            const precedent = existants.get(email);
            const chat = trouverChatPourUtilisateur(email);
            const unreadCount = chat && chat.unreadCount && typeof chat.unreadCount[myEmail] === "number"
                ? chat.unreadCount[myEmail]
                : (precedent ? precedent.unreadCount || 0 : 0);

            allUsers.push({
                email,
                uid: data.uid || null,
                profile: data,
                lastMessage: chat ? (typeof chat.dernierMessage === "string" ? chat.dernierMessage : (precedent ? precedent.lastMessage : "")) : (precedent ? precedent.lastMessage : ""),
                updatedAt: chat ? (chat.updatedAt || null) : (precedent ? precedent.updatedAt : null),
                chatId: chat ? chat.id : (precedent ? precedent.chatId : null),
                unreadCount
            });
        });

        allUsers.sort((a, b) => nomAffiche(a).localeCompare(nomAffiche(b), "fr"));
        rafraichirListe();
        try { ecrireCache(); } catch (error) { /* ignore */ }
    }, (error) => {
        afficherErreurFirebase("Chargement des profils", error);
    });
}

/* =========================================================
   CONVERSATIONS (chats)
========================================================= */

function ecouterConversations() {
    if (unsubscribeChats) {
        unsubscribeChats();
        unsubscribeChats = null;
    }

    const myEmail = String(currentUser.email).toLowerCase();

    const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", myEmail)
    );

    unsubscribeChats = onSnapshot(chatsQuery, (snapshot) => {
        allChats = snapshot.docs.map((chatDocument) => ({ id: chatDocument.id, ...chatDocument.data() }));
        const activeChatData = allChats.find((chat) => chat.id === currentChatId);
        if (activeChatData) updatePinnedMessageBanner(activeChatData);

        allUsers = allUsers.map((user) => {
            const chat = trouverChatPourUtilisateur(user.email);
            if (!chat) {
                return { ...user, lastMessage: "", updatedAt: null, chatId: null, unreadCount: 0 };
            }
            const unreadCount = chat.unreadCount && typeof chat.unreadCount[myEmail] === "number"
                ? chat.unreadCount[myEmail]
                : 0;
            return {
                ...user,
                lastMessage: typeof chat.dernierMessage === "string" ? chat.dernierMessage : "",
                updatedAt: chat.updatedAt || null,
                chatId: chat.id,
                unreadCount
            };
        });

        rafraichirListe();
        try { ecrireCache(); } catch (error) { /* ignore */ }
    }, (error) => {
        afficherErreurFirebase("Écoute des conversations", error);
    });
}

/* =========================================================
   DEMANDES DE CONTACT (contact_requests)
========================================================= */

function ecouterDemandesContacts() {
    if (unsubscribeIncomingRequests) {
        unsubscribeIncomingRequests();
        unsubscribeIncomingRequests = null;
    }
    if (unsubscribeSentRequests) {
        unsubscribeSentRequests();
        unsubscribeSentRequests = null;
    }

    const myEmail = String(currentUser.email).toLowerCase();

    // 1. Demandes reçues
    const incomingQuery = query(
        collection(db, "contact_requests"),
        where("recipientEmail", "==", myEmail)
    );

    unsubscribeIncomingRequests = onSnapshot(incomingQuery, (snapshot) => {
        incomingContactRequests = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((request) => request.status !== "cancelled");
        fusionnerEtAfficherDemandes();
    }, (error) => {
        console.warn("Impossible d'écouter les demandes reçues:", error);
    });

    // 2. Demandes envoyées
    const sentQuery = query(
        collection(db, "contact_requests"),
        where("senderEmail", "==", myEmail)
    );

    unsubscribeSentRequests = onSnapshot(sentQuery, (snapshot) => {
        sentContactRequests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        fusionnerEtAfficherDemandes();
    }, (error) => {
        console.warn("Impossible d'écouter les demandes envoyées:", error);
    });
}

function fusionnerEtAfficherDemandes() {
    // Éviter les doublons
    const map = new Map();
    [...incomingContactRequests, ...sentContactRequests].forEach((r) => map.set(r.id, r));
    allContactRequests = Array.from(map.values());

    mettreAJourBadgesDemandes();
    renderDemandesContacts();
    rafraichirListe();
}

function mettreAJourBadgesDemandes() {
    const pendingIncoming = incomingContactRequests.filter((r) => r.status === "pending").length;
    const sentCount = sentContactRequests.filter((request) =>
        request.status !== "cancelled" && !requestsBeingCancelled.has(request.id)
    ).length;
    const incomingCount = incomingContactRequests.filter((request) => request.status !== "cancelled").length;

    // Badge sur le bouton de navigation Demandes
    if (requestsCountBadge) {
        if (pendingIncoming > 0) {
            requestsCountBadge.hidden = false;
            requestsCountBadge.textContent = pendingIncoming > 99 ? "99+" : String(pendingIncoming);
        } else {
            requestsCountBadge.hidden = true;
        }
    }

    // Compteurs des sous-onglets
    if (subnavIncomingCount) {
        subnavIncomingCount.hidden = incomingCount === 0;
        subnavIncomingCount.textContent = String(incomingCount);
    }
    if (subnavSentCount) {
        subnavSentCount.hidden = sentCount === 0;
        subnavSentCount.textContent = String(sentCount);
    }
}

function renderDemandesContacts() {
    if (!sentRequestsList || !incomingRequestsList) return;

    // 1. Demandes reçues (les demandes annulées par l'expéditeur ne sont pas affichées au destinataire)
    const incomingVisibles = incomingContactRequests.filter((r) => r.status !== "cancelled");

    if (incomingVisibles.length === 0) {
        incomingRequestsList.innerHTML = `
            <div class="no-results">
                <span style="font-size: 28px; display: block; margin-bottom: 8px;">✉</span>
                <strong>Aucune demande reçue</strong>
                <p style="margin-top: 4px; color: var(--text-soft); font-size: 12px;">Vos demandes de discussion apparaîtront ici.</p>
            </div>
        `;
    } else {
        // Trier : en attente d'abord, puis par date décroissante
        const triees = [...incomingVisibles].sort((a, b) => {
            if (a.status === "pending" && b.status !== "pending") return -1;
            if (b.status === "pending" && a.status !== "pending") return 1;
            return horodatageMillis(b.createdAt) - horodatageMillis(a.createdAt);
        });

        incomingRequestsList.innerHTML = triees.map((req) => {
            const nom = req.senderName || req.senderEmail || "Expéditeur";
            const dateStr = formaterDate(req.createdAt);
            const isPending = req.status === "pending";
            const statusLabel = req.status === "accepted" ? "Acceptée" : req.status === "declined" ? "Refusée" : "En attente";

            return `
                <div class="request-card" data-request-id="${escapeHTML(req.id)}">
                    <div class="request-card-header">
                        <div class="request-card-avatar" data-avatar-text="${escapeHTML(nom)}">
                            ${req.senderPhoto ? `<img src="${escapeHTML(req.senderPhoto)}" alt="${escapeHTML(nom)}" loading="lazy">` : getInitial(nom)}
                        </div>
                        <div class="request-card-info">
                            <div class="request-card-name">${escapeHTML(nom)}</div>
                            <div class="request-card-email">${escapeHTML(req.senderEmail || "")}</div>
                        </div>
                        <span class="request-status-badge ${escapeHTML(req.status || "pending")}">${escapeHTML(statusLabel)}</span>
                    </div>

                    <div class="request-card-message">
                        ${escapeHTML(req.initialMessage || "Souhaite entrer en contact avec vous.")}
                    </div>

                    <div class="request-card-date">${escapeHTML(dateStr)}</div>

                    ${isPending ? `
                        <div class="request-card-actions">
                            <button type="button" class="request-action-btn accept" data-action="accept" data-request-id="${escapeHTML(req.id)}">
                                ✓ Accepter
                            </button>
                            <button type="button" class="request-action-btn decline" data-action="decline" data-request-id="${escapeHTML(req.id)}">
                                ✕ Refuser
                            </button>
                        </div>
                    ` : req.status === "accepted" ? `
                        <div class="request-card-actions">
                            <button type="button" class="request-action-btn open-chat" data-action="chat" data-email="${escapeHTML(req.senderEmail || "")}">
                                💬 Ouvrir la discussion
                            </button>
                        </div>
                    ` : ""}
                </div>
            `;
        }).join("");

        // Écouteurs sur les boutons d'action
        incomingRequestsList.querySelectorAll(".request-action-btn").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const requestId = btn.dataset.requestId;
                const email = btn.dataset.email;

                if (action === "accept" || action === "decline") {
                    await traiterDemandeContact(requestId, action === "accept" ? "accepted" : "declined");
                } else if (action === "chat" && email) {
                    const user = allUsers.find((u) => String(u.email).toLowerCase() === email.toLowerCase()) || { email };
                    await ouvrirConversation(user);
                }
            });
        });
    }

    // 2. Demandes envoyées
    const sentVisible = sentContactRequests.filter((request) =>
        request.status !== "cancelled" && !requestsBeingCancelled.has(request.id)
    );
    if (sentVisible.length === 0) {
        sentRequestsList.innerHTML = `
            <div class="no-results">
                <span style="font-size: 28px; display: block; margin-bottom: 8px;">↗</span>
                <strong>Aucune demande envoyée</strong>
                <p style="margin-top: 4px; color: var(--text-soft); font-size: 12px;">Ajoutez des contacts pour initier des échanges.</p>
            </div>
        `;
    } else {
        const trieesSent = [...sentVisible].sort((a, b) => horodatageMillis(b.createdAt) - horodatageMillis(a.createdAt));

        sentRequestsList.innerHTML = trieesSent.map((req) => {
            const nom = req.recipientName || req.recipientEmail || "Destinataire";
            const dateStr = formaterDate(req.createdAt);
            const isPending = req.status === "pending";
            const statusLabel = req.status === "accepted" ? "Acceptée" : req.status === "declined" ? "Refusée" : req.status === "cancelled" ? "Annulée" : "En attente";

            return `
                <div class="request-card" data-request-id="${escapeHTML(req.id)}">
                    <div class="request-card-header">
                        <div class="request-card-avatar" data-avatar-text="${escapeHTML(nom)}">
                            ${req.recipientPhoto ? `<img src="${escapeHTML(req.recipientPhoto)}" alt="${escapeHTML(nom)}" loading="lazy">` : getInitial(nom)}
                        </div>
                        <div class="request-card-info">
                            <div class="request-card-name">${escapeHTML(nom)}</div>
                            <div class="request-card-email">${escapeHTML(req.recipientEmail || "")}</div>
                        </div>
                        <span class="request-status-badge ${escapeHTML(req.status || "pending")}">${escapeHTML(statusLabel)}</span>
                    </div>

                    <div class="request-card-message">
                        ${escapeHTML(req.initialMessage || "Votre message d'introduction")}
                    </div>

                    <div class="request-card-date">${escapeHTML(dateStr)}</div>

                    ${isPending ? `
                        <div class="request-card-actions">
                            <button type="button" class="request-action-btn decline" data-action="cancel" data-request-id="${escapeHTML(req.id)}">
                                ✕ Annuler la demande
                            </button>
                        </div>
                    ` : req.status === "accepted" ? `
                        <div class="request-card-actions">
                            <button type="button" class="request-action-btn open-chat" data-action="chat" data-email="${escapeHTML(req.recipientEmail || "")}">
                                💬 Ouvrir la discussion
                            </button>
                        </div>
                    ` : ""}
                </div>
            `;
        }).join("");

        sentRequestsList.querySelectorAll(".request-action-btn").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const requestId = btn.dataset.requestId;
                const email = btn.dataset.email;

                if (action === "cancel" && requestId) {
                    await annulerDemandeContact(requestId);
                } else if (action === "chat" && email) {
                    const user = allUsers.find((u) => String(u.email).toLowerCase() === email.toLowerCase()) || { email };
                    await ouvrirConversation(user);
                }
            });
        });
    }
}

/* =========================================================
   GESTION DU BOUTON "+" INTELLIGENT
========================================================= */

/**
 * Calcule l'état du bouton selon le statut de l'utilisateur visé :
 * - Aucun contact ni demande : "+ Ajouter"
 * - Demande envoyée : "Annuler"
 * - Demande reçue : "Accepter / Refuser"
 * - Demande acceptée : "Message"
 * - Demande refusée : "Refusée"
 * - Contact déjà existant : "Message"
 * - Mon propre profil : aucun bouton
 */
function getRequestStateForUser(targetEmail) {
    if (!currentUser || !currentUser.email || !targetEmail) {
        return { status: "self", label: "" };
    }

    const myEmail = String(currentUser.email).toLowerCase();
    const target = String(targetEmail).toLowerCase();

    if (myEmail === target) {
        return { status: "self", label: "" };
    }

    // 1. Conversation active déjà existante
    const existingChat = trouverChatPourUtilisateur(target);
    if (existingChat) {
        return { status: "accepted", label: "Message" };
    }

    // 2. Chercher la demande de contact la plus récente entre les deux utilisateurs
    const relevantRequests = allContactRequests.filter((r) => {
        const s = String(r.senderEmail || "").toLowerCase();
        const rec = String(r.recipientEmail || "").toLowerCase();
        return !requestsBeingCancelled.has(r.id)
            && ((s === myEmail && rec === target) || (s === target && rec === myEmail));
    }).sort((a, b) => horodatageMillis(b.updatedAt || b.createdAt) - horodatageMillis(a.updatedAt || a.createdAt));

    const req = relevantRequests[0];

    // Si aucune demande ou si la dernière demande a été annulée -> état initial "+ Ajouter"
    if (!req || req.status === "cancelled") {
        return { status: "none", label: "+ Ajouter" };
    }

    const sender = String(req.senderEmail || "").toLowerCase();
    const recipient = String(req.recipientEmail || "").toLowerCase();

    if (req.status === "accepted") {
        return { status: "accepted", label: "Message", requestId: req.id };
    }
    if (req.status === "pending") {
        if (sender === myEmail) {
            // L'expéditeur voit immédiatement "Annuler"
            return { status: "sent_pending", label: "Annuler", requestId: req.id };
        }
        if (recipient === myEmail) {
            return { status: "incoming", label: "Accepter / Refuser", requestId: req.id };
        }
    }
    if (req.status === "declined") {
        return { status: "declined", label: "Refusée", requestId: req.id };
    }

    return { status: "none", label: "+ Ajouter" };
}

function cleDemandeContact(emailA, emailB) {
    return [String(emailA || "").toLowerCase(), String(emailB || "").toLowerCase()]
        .sort()
        .join("|");
}

/* =========================================================
   ANNULATION D'UNE DEMANDE D'AMI PAR L'EXPÉDITEUR
========================================================= */

async function annulerDemandeContact(requestId) {
    if (!requestId || !currentUser || !currentUser.email) return;

    const request = sentContactRequests.find((item) => item.id === requestId)
        || allContactRequests.find((item) => item.id === requestId);
    if (!request || request.status !== "pending") return;

    const pairKey = cleDemandeContact(request.senderEmail, request.recipientEmail);
    if (requestOperationsInProgress.has(pairKey)) return;
    requestOperationsInProgress.add(pairKey);
    requestsBeingCancelled.add(requestId);

    // Masquer immédiatement la demande côté expéditeur.
    sentContactRequests = sentContactRequests.filter((item) => item.id !== requestId);
    fusionnerEtAfficherDemandes();

    try {
        const requestRef = doc(db, "contact_requests", requestId);

        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(requestRef);
            if (!snap.exists()) {
                throw new Error("Cette demande n'existe plus.");
            }
            const data = snap.data() || {};
            if (data.status !== "pending") {
                throw new Error("Cette demande a déjà été acceptée ou traitée.");
            }
            transaction.update(requestRef, {
                status: "cancelled",
                updatedAt: serverTimestamp()
            });
        });

        afficherStatutComposer("Demande annulée.", "success");
        setTimeout(() => afficherStatutComposer("", ""), 3000);
    } catch (error) {
        let restoredRequest = request;
        try {
            const latest = await getDoc(doc(db, "contact_requests", requestId));
            if (latest.exists()) {
                restoredRequest = { id: latest.id, ...latest.data() };
            }
        } catch (refreshError) {
            console.warn("Impossible de vérifier l'état de la demande après l'échec de l'annulation:", refreshError);
        }

        if (restoredRequest.status !== "cancelled") {
            sentContactRequests = [
                ...sentContactRequests.filter((item) => item.id !== requestId),
                restoredRequest
            ];
        }
        fusionnerEtAfficherDemandes();
        afficherErreurFirebase("Annulation de la demande", error);
    } finally {
        requestsBeingCancelled.delete(requestId);
        requestOperationsInProgress.delete(pairKey);
        fusionnerEtAfficherDemandes();
    }
}

/* =========================================================
   ENVOI DIRECT D'UNE DEMANDE DE CONTACT
========================================================= */

async function envoyerDemandeContact(targetUser) {
    if (!currentUser || !currentUser.email || !targetUser || !targetUser.email) return;
    const myEmail = String(currentUser.email).toLowerCase();
    const targetEmail = String(targetUser.email).toLowerCase();

    if (myEmail === targetEmail) {
        afficherStatutComposer("Vous ne pouvez pas vous ajouter vous-même.", "error");
        return;
    }

    const hasPendingRequest = allContactRequests.some((r) => {
        const s = String(r.senderEmail || "").toLowerCase();
        const rec = String(r.recipientEmail || "").toLowerCase();
        return r.status === "pending"
            && ((s === myEmail && rec === targetEmail) || (s === targetEmail && rec === myEmail));
    });

    if (hasPendingRequest) {
        afficherStatutComposer("Une demande est déjà en attente pour cet utilisateur.", "error");
        return;
    }

    const pairKey = cleDemandeContact(myEmail, targetEmail);
    if (requestOperationsInProgress.has(pairKey)) return;
    requestOperationsInProgress.add(pairKey);

    const requestRef = doc(collection(db, "contact_requests"));
    const targetProfile = targetUser.profile || {};
    const recipientUid = targetProfile.uid || targetUser.uid || targetEmail;
    const senderName = currentUserName.textContent || currentUser.displayName || myEmail.split("@")[0];
    const recipientName = nomAffiche(targetUser);
    const initialMessage = "Salut 👋 Ça te dit de faire connaissance ?";
    const optimisticRequest = {
        id: requestRef.id,
        senderUid: currentUser.uid,
        recipientUid,
        senderEmail: myEmail,
        recipientEmail: targetEmail,
        senderName,
        senderPhoto: currentUser.photoURL || "",
        recipientName,
        recipientPhoto: targetProfile.photo || "",
        status: "pending",
        initialMessage,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    sentContactRequests = [
        ...sentContactRequests.filter((request) => request.id !== requestRef.id),
        optimisticRequest
    ];
    fusionnerEtAfficherDemandes();

    try {
        await setDoc(requestRef, {
            senderUid: currentUser.uid,
            recipientUid,
            senderEmail: myEmail,
            recipientEmail: targetEmail,
            senderName,
            senderPhoto: currentUser.photoURL || "",
            recipientName,
            recipientPhoto: targetProfile.photo || "",
            status: "pending",
            initialMessage,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        afficherStatutComposer("Demande envoyée.", "success");
        setTimeout(() => afficherStatutComposer("", ""), 3000);
    } catch (error) {
        sentContactRequests = sentContactRequests.filter((request) => request.id !== requestRef.id);
        fusionnerEtAfficherDemandes();
        afficherErreurFirebase("Envoi de la demande de contact", error);
    } finally {
        requestOperationsInProgress.delete(pairKey);
        fusionnerEtAfficherDemandes();
    }
}

/* =========================================================
   ACCEPTATION / REFUS D'UNE DEMANDE
========================================================= */

async function traiterDemandeContact(requestId, nextStatus) {
    if (!requestId || !currentUser || !currentUser.email) return;
    const targetRequest = allContactRequests.find((r) => r.id === requestId);
    if (!targetRequest) return;

    try {
        const requestRef = doc(db, "contact_requests", requestId);

        // A concurrent cancellation or response can only win one transition from pending.
        const transitioned = await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(requestRef);
            if (!snapshot.exists() || snapshot.data().status !== "pending") return false;
            transaction.update(requestRef, {
                status: nextStatus,
                updatedAt: serverTimestamp()
            });
            return true;
        });
        if (!transitioned) {
            afficherStatutComposer("Cette demande n'est plus en attente.", "error");
            return;
        }

        // 2. Si acceptée : création atomique de la conversation et du premier message
        if (nextStatus === "accepted") {
            const senderEmail = String(targetRequest.senderEmail).toLowerCase();
            const myEmail = String(currentUser.email).toLowerCase();
            const participants = [senderEmail, myEmail].sort();
            const chatId = creerChatId(participants[0], participants[1]);
            const chatRef = doc(db, "chats", chatId);

            const participantUids = [
                targetRequest.senderUid || senderEmail,
                currentUser.uid || myEmail
            ].filter(Boolean).sort();

            await setDoc(chatRef, {
                participants,
                participantUids,
                dernierMessage: targetRequest.initialMessage || "",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                unreadCount: {
                    [senderEmail]: 0,
                    [myEmail]: 0
                },
                lastReadAt: {
                    [senderEmail]: serverTimestamp(),
                    [myEmail]: serverTimestamp()
                }
            }, { merge: true });

            // Premier message dans la sous-collection
            if (targetRequest.initialMessage) {
                const messageRef = doc(collection(db, "chats", chatId, "messages"));
                await setDoc(messageRef, {
                    senderId: senderEmail,
                    senderUid: targetRequest.senderUid || senderEmail,
                    text: targetRequest.initialMessage,
                    createdAt: serverTimestamp()
                });
            }

            afficherStatutComposer("Demande acceptée ! La discussion est maintenant active.", "success");

            // Ouvrir directement la conversation
            const expUser = allUsers.find((u) => String(u.email).toLowerCase() === senderEmail) || {
                email: senderEmail,
                profile: { prenom: targetRequest.senderName, photo: targetRequest.senderPhoto }
            };
            await ouvrirConversation(expUser);
        } else {
            afficherStatutComposer("Demande refusée.", "success");
        }

        setTimeout(() => afficherStatutComposer("", ""), 3500);
    } catch (error) {
        afficherErreurFirebase(nextStatus === "accepted" ? "Acceptation de la demande" : "Refus de la demande", error);
    }
}

/* =========================================================
   LISTES ET RECHERCHE
========================================================= */

function trouverChatPourUtilisateur(email) {
    if (!currentUser || !currentUser.email || !email) return null;
    const cible = String(email).toLowerCase();
    const moi = String(currentUser.email).toLowerCase();
    const attendu = creerChatId(moi, cible);

    return allChats.find((chat) => {
        if (!Array.isArray(chat.participants) || chat.participants.length !== 2) return false;
        const p = chat.participants.map((v) => String(v).toLowerCase());
        return (p.includes(moi) && p.includes(cible)) || chat.id === attendu;
    }) || null;
}

function rafraichirListe() {
    if (currentMode === "requests") {
        renderDemandesContacts();
    } else if (currentMode === "recent") {
        afficherConversationsRecentes();
    } else if (searchMode && searchMode.value === "phone") {
        const liveMatch = phoneSearchResult && allUsers.find((user) => user.uid === phoneSearchResult.uid);
        afficherUtilisateurs(liveMatch ? [liveMatch] : (phoneSearchResult ? [phoneSearchResult] : []));
    } else {
        afficherUtilisateurs(filtrerUtilisateurs());
    }
}

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
    const element = document.createElement("div");
    element.className = "contact-item";
    if (selectedUser && selectedUser.email.toLowerCase() === user.email.toLowerCase()) {
        element.classList.add("active");
    }

    const fullName = nomAffiche(user);
    const location = [profile.ville, profile.pays].filter(Boolean).join(", ");
    const dernierMessage = (user.lastMessage && String(user.lastMessage).trim())
        ? String(user.lastMessage)
        : (currentMode === "recent" ? "" : "Utilisateur inscrit");

    const state = getRequestStateForUser(user.email);

    const avatar = document.createElement("div");
    avatar.className = "contact-avatar";
    renderAvatar(avatar, profile.photo, fullName);

    const badge = document.createElement("span");
    badge.className = "unread-badge";
    badge.hidden = !(user.unreadCount && user.unreadCount > 0);
    badge.textContent = user.unreadCount > 99 ? "99+" : String(user.unreadCount);

    const info = document.createElement("div");
    info.className = "contact-information";
    info.innerHTML = `
        <div class="contact-name">${escapeHTML(fullName)}</div>
        <div class="contact-location">${escapeHTML(location || "Utilisateur Lumesys")}</div>
        <div class="contact-last-message">${escapeHTML(dernierMessage)}</div>
    `;

    // Bouton d'action intelligent
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = `contact-action-btn ${state.status}`;
    actionButton.textContent = state.label;

    if (state.status === "self") {
        actionButton.style.display = "none";
    } else if (state.status === "none") {
        const pairKey = cleDemandeContact(currentUser.email, user.email);
        actionButton.disabled = requestOperationsInProgress.has(pairKey);
        actionButton.addEventListener("click", (e) => {
            e.stopPropagation();
            envoyerDemandeContact(user);
        });
    } else if (state.status === "sent_pending") {
        const pairKey = cleDemandeContact(currentUser.email, user.email);
        actionButton.disabled = requestOperationsInProgress.has(pairKey);
        actionButton.addEventListener("click", async (e) => {
            e.stopPropagation();
            await annulerDemandeContact(state.requestId);
        });
    } else if (state.status === "incoming") {
        actionButton.addEventListener("click", (e) => {
            e.stopPropagation();
            setMode("requests");
            setRequestsSubnav("incoming");
        });
    } else if (state.status === "accepted") {
        actionButton.addEventListener("click", (e) => {
            e.stopPropagation();
            ouvrirConversation(user);
        });
    } else if (state.status === "declined") {
        actionButton.disabled = true;
    }

    element.appendChild(avatar);
    element.appendChild(badge);
    element.appendChild(info);
    element.appendChild(actionButton);

    element.addEventListener("click", () => {
        if (state.status === "accepted") {
            document.querySelectorAll(".contact-item").forEach((item) => item.classList.remove("active"));
            element.classList.add("active");
            ouvrirConversation(user);
        } else if (state.status === "incoming") {
            setMode("requests");
            setRequestsSubnav("incoming");
        }
    });

    return element;
}

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

/* =========================================================
   NAVIGATION / MODES
========================================================= */

function configureSearchMode() {
    phoneSearchSequence++;
    phoneSearchResult = null;
    if (phoneSearchButton) phoneSearchButton.disabled = false;
    const phoneMode = Boolean(searchMode && searchMode.value === "phone");
    if (searchCountry) searchCountry.hidden = !phoneMode;
    if (phoneSearchButton) phoneSearchButton.hidden = !phoneMode;
    if (searchInput) {
        searchInput.placeholder = phoneMode
            ? "Saisissez le numéro exact à rechercher…"
            : "Rechercher par nom, prénom ou e-mail…";
        searchInput.autocomplete = phoneMode ? "tel" : "off";
    }
    if (phoneSearchStatus) phoneSearchStatus.textContent = "";
    if (phoneMode) {
        phoneSearchResult = null;
        afficherUtilisateurs([]);
    }
    else if (currentMode === "users") afficherUtilisateurs(filtrerUtilisateurs());
}

async function rechercherParTelephone() {
    if (!currentUser || !searchInput || !searchCountry || !phoneSearchStatus || !phoneSearchButton) return;
    const parsed = parseInternationalPhone(searchInput.value, searchCountry.value);
    if (!parsed.valid) {
        phoneSearchResult = null;
        phoneSearchStatus.textContent = parsed.error;
        afficherUtilisateurs([]);
        return;
    }

    const sequence = ++phoneSearchSequence;
    phoneSearchButton.disabled = true;
    phoneSearchStatus.textContent = "Recherche exacte en cours…";
    try {
        const uid = await searchPhone(parsed.e164, currentUser);
        if (sequence !== phoneSearchSequence) return;
        if (!uid) {
            phoneSearchResult = null;
            phoneSearchStatus.textContent = "Aucun utilisateur n'a activé la recherche pour ce numéro.";
            afficherUtilisateurs([]);
            return;
        }

        let match = allUsers.find((user) => user.uid === uid);
        if (!match) {
            const result = await getDocs(query(
                collection(db, "public_profiles"),
                where("uid", "==", uid),
                limit(1)
            ));
            const profileDocument = result.docs[0];
            if (profileDocument) {
                const profile = profileDocument.data() || {};
                const email = String(profile.email || profileDocument.id).toLowerCase();
                match = {
                    email,
                    uid,
                    profile,
                    lastMessage: "",
                    updatedAt: null,
                    chatId: null,
                    unreadCount: 0
                };
            }
        }
        if (sequence !== phoneSearchSequence) return;
        phoneSearchResult = match || null;
        phoneSearchStatus.textContent = match ? "Utilisateur trouvé." : "Aucun profil public associé à ce compte.";
        afficherUtilisateurs(match ? [match] : []);
    } catch (error) {
        if (sequence !== phoneSearchSequence) return;
        phoneSearchResult = null;
        phoneSearchStatus.textContent = error.message || "La recherche téléphonique est indisponible.";
        afficherUtilisateurs([]);
    } finally {
        if (sequence === phoneSearchSequence) phoneSearchButton.disabled = false;
    }
}

if (searchMode) searchMode.addEventListener("change", configureSearchMode);
if (searchInput) {
    searchInput.addEventListener("input", () => {
        if (currentMode !== "users") setMode("users");
        if (searchMode && searchMode.value === "phone") {
            phoneSearchSequence++;
            phoneSearchResult = null;
            if (phoneSearchButton) phoneSearchButton.disabled = false;
            if (phoneSearchStatus) phoneSearchStatus.textContent = "";
            afficherUtilisateurs([]);
        } else {
            afficherUtilisateurs(filtrerUtilisateurs());
        }
    });
    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && searchMode && searchMode.value === "phone") {
            event.preventDefault();
            rechercherParTelephone();
        }
    });
}
if (searchCountry) searchCountry.addEventListener("change", () => {
    phoneSearchSequence++;
    phoneSearchResult = null;
    if (phoneSearchButton) phoneSearchButton.disabled = false;
    if (phoneSearchStatus) phoneSearchStatus.textContent = "";
    afficherUtilisateurs([]);
});
if (phoneSearchButton) phoneSearchButton.addEventListener("click", rechercherParTelephone);

if (editPhoneSettingsButton) {
    editPhoneSettingsButton.addEventListener("click", async () => {
        try {
            await editPhoneSettings({ user: currentUser, db });
        } catch (error) {
            window.alert(error.message || "Impossible de modifier les paramètres du téléphone.");
        }
    });
}
if (editLocationSettingsButton) {
    editLocationSettingsButton.addEventListener("click", async () => {
        try {
            await editLocationSettings({ user: currentUser, db });
        } catch (error) {
            window.alert(error.message || "Impossible de modifier les paramètres de localisation.");
        }
    });
}

if (showAllUsersButton) showAllUsersButton.addEventListener("click", () => setMode("users"));
if (showRecentChatsButton) showRecentChatsButton.addEventListener("click", () => setMode("recent"));
if (showRequestsButton) showRequestsButton.addEventListener("click", () => setMode("requests"));

if (subnavIncoming) subnavIncoming.addEventListener("click", () => setRequestsSubnav("incoming"));
if (subnavSent) subnavSent.addEventListener("click", () => setRequestsSubnav("sent"));

function setMode(mode) {
    if (mode !== "users") {
        phoneSearchSequence++;
        phoneSearchResult = null;
        if (phoneSearchButton) phoneSearchButton.disabled = false;
    }
    currentMode = mode;

    showAllUsersButton.classList.toggle("active", mode === "users");
    showRecentChatsButton.classList.toggle("active", mode === "recent");
    showRequestsButton.classList.toggle("active", mode === "requests");

    showAllUsersButton.setAttribute("aria-pressed", String(mode === "users"));
    showRecentChatsButton.setAttribute("aria-pressed", String(mode === "recent"));
    showRequestsButton.setAttribute("aria-pressed", String(mode === "requests"));

    if (mode === "requests") {
        if (searchBoxWrap) searchBoxWrap.hidden = true;
        if (contactsList) contactsList.hidden = true;
        if (requestsSubnav) requestsSubnav.hidden = false;
        if (contactRequestsPanel) contactRequestsPanel.hidden = false;
        setRequestsSubnav(currentRequestsSubnav);
    } else {
        if (searchBoxWrap) searchBoxWrap.hidden = false;
        if (contactsList) contactsList.hidden = false;
        if (requestsSubnav) requestsSubnav.hidden = true;
        if (contactRequestsPanel) contactRequestsPanel.hidden = true;
        rafraichirListe();
    }
}

function setRequestsSubnav(tab) {
    currentRequestsSubnav = tab;
    subnavIncoming.classList.toggle("active", tab === "incoming");
    subnavSent.classList.toggle("active", tab === "sent");
    subnavIncoming.setAttribute("aria-pressed", String(tab === "incoming"));
    subnavSent.setAttribute("aria-pressed", String(tab === "sent"));

    if (incomingRequestsList) incomingRequestsList.hidden = (tab !== "incoming");
    if (sentRequestsList) sentRequestsList.hidden = (tab !== "sent");
    renderDemandesContacts();
}

/* =========================================================
   OUVERTURE ET GESTION DES CONVERSATIONS
========================================================= */

async function ouvrirConversation(user) {
    if (!currentUser || !currentUser.email || !user) return;
    if (sendInProgress) return;

    try {
        selectedUser = user;
        selectedMessageIds.clear();
        clearReply();
        closeContextMenu();
        updateSelectionToolbar();
        const myEmail = String(currentUser.email).toLowerCase();
        const otherEmail = String(user.email).toLowerCase();

        currentChatId = creerChatId(myEmail, otherEmail);

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

        // Créer ou vérifier la conversation sans déclencher de permission-denied
        await creerChatSiNecessaire();
        ecouterMessages();
        initScrollInfini();
        await marquerCommeLu(currentChatId);
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
    const myEmail = String(currentUser.email).toLowerCase();
    const otherEmail = String(selectedUser.email).toLowerCase();

    // 1. Trouver un chat existant en mémoire
    const existingChat = allChats.find((chat) =>
        participantsValides(chat.participants, myEmail, otherEmail)
    );

    if (existingChat) {
        currentChatId = existingChat.id;
        return;
    }

    const attenduId = creerChatId(myEmail, otherEmail);
    const chatReference = doc(db, "chats", attenduId);
    currentChatId = attenduId;

    // 2. Vérifier si le document existe déjà dans Firestore
    const chatSnapshot = await getDoc(chatReference);
    if (chatSnapshot.exists()) {
        return;
    }

    // 3. Créer le document avec participants ET participantUids
    const participants = [myEmail, otherEmail].sort();
    const otherUid = (selectedUser.profile && selectedUser.profile.uid) || selectedUser.uid || otherEmail;
    const participantUids = [currentUser.uid, otherUid].filter(Boolean).sort();

    await setDoc(chatReference, {
        participants,
        participantUids,
        dernierMessage: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        unreadCount: {
            [myEmail]: 0,
            [otherEmail]: 0
        },
        lastReadAt: {
            [myEmail]: serverTimestamp(),
            [otherEmail]: serverTimestamp()
        }
    }, { merge: true });
}

function participantsValides(participants, emailA, emailB) {
    if (!Array.isArray(participants) || participants.length !== 2) return false;
    const p = participants.map((v) => String(v).toLowerCase());
    return p.includes(String(emailA).toLowerCase()) && p.includes(String(emailB).toLowerCase());
}

async function marquerCommeLu(chatId) {
    if (!currentUser || !currentUser.email || !chatId) return;
    try {
        const myEmail = String(currentUser.email).toLowerCase();
        const chatReference = doc(db, "chats", chatId);
        await setDoc(chatReference, {
            unreadCount: {
                [myEmail]: 0
            },
            lastReadAt: {
                [myEmail]: serverTimestamp()
            }
        }, { merge: true });
    } catch (error) {
        console.warn("Marquage comme lu:", error);
    }
}

/* =========================================================
   MESSAGES EN TEMPS RÉEL ET PAGINATION
========================================================= */

function ecouterMessages() {
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }

    messageDocs = [];
    lastVisibleDoc = null;
    hasMoreMessages = true;
    loadingMore = false;
    realtimeListenerActive = false;
    messagesArea.innerHTML = "";

    const messagesQuery = query(
        collection(db, "chats", currentChatId, "messages"),
        orderBy("createdAt", "desc"),
        limit(50)
    );

    unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
        const docs = snapshot.docs;
        if (docs.length === 0) {
            messageDocs = [];
            messagesArea.innerHTML = `<div class="no-results">Aucun message pour le moment. Envoyez le premier message.</div>`;
            messagesArea.scrollTop = messagesArea.scrollHeight;
            return;
        }

        if (!realtimeListenerActive) {
            const ordered = docs
                .map((d) => ({ id: d.id, ...d.data(), _doc: d }))
                .filter((message) => !message.hiddenFor?.includes(currentUser.uid))
                .sort((a, b) => horodatageMillis(a.createdAt) - horodatageMillis(b.createdAt));

            messageDocs = ordered;
            lastVisibleDoc = docs[docs.length - 1];
            hasMoreMessages = docs.length === 50;

            messagesArea.innerHTML = "";
            ordered.forEach((m) => afficherMessage(m));
            messagesArea.scrollTop = messagesArea.scrollHeight;
            realtimeListenerActive = true;
        } else {
            const estEnBas = messagesArea.scrollTop + messagesArea.clientHeight >= messagesArea.scrollHeight - 50;
            docs.forEach((documentSnapshot) => {
                const message = { id: documentSnapshot.id, ...documentSnapshot.data(), _doc: documentSnapshot };
                const index = messageDocs.findIndex((existing) => existing.id === message.id);
                const hiddenForMe = message.hiddenFor?.includes(currentUser.uid);

                if (hiddenForMe) {
                    if (index !== -1) messageDocs.splice(index, 1);
                    messagesArea.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)?.remove();
                    return;
                }

                if (index !== -1) {
                    messageDocs[index] = message;
                    const existingRow = messagesArea.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
                    if (existingRow) existingRow.replaceWith(creerElementMessage(message));
                } else {
                    messageDocs.push(message);
                    messageDocs.sort((a, b) => horodatageMillis(a.createdAt) - horodatageMillis(b.createdAt));
                    afficherMessage(message);
                }
            });

            if (estEnBas) {
                messagesArea.scrollTop = messagesArea.scrollHeight;
            }
        }
        const activeChatData = allChats.find((chat) => chat.id === currentChatId);
        if (activeChatData) updatePinnedMessageBanner(activeChatData);
    }, (error) => {
        afficherErreurFirebase("Lecture des messages", error);
    });
}

function afficherMessage(message) {
    const row = creerElementMessage(message);
    messagesArea.appendChild(row);
}

async function chargerMessagesPrecedents() {
    if (loadingMore || !hasMoreMessages || !currentChatId || !lastVisibleDoc) return;

    loadingMore = true;
    const loader = document.getElementById("messageLoader");
    if (loader) loader.hidden = false;

    try {
        const nextQuery = query(
            collection(db, "chats", currentChatId, "messages"),
            orderBy("createdAt", "desc"),
            startAfter(lastVisibleDoc),
            limit(50)
        );

        const snapshot = await getDocs(nextQuery);
        const docs = snapshot.docs;

        if (docs.length === 0) {
            hasMoreMessages = false;
            return;
        }

        const scrollBefore = messagesArea.scrollHeight;

        const nouveaux = docs
            .map((d) => ({ id: d.id, ...d.data(), _doc: d }))
            .filter((message) => !message.hiddenFor?.includes(currentUser.uid))
            .sort((a, b) => horodatageMillis(a.createdAt) - horodatageMillis(b.createdAt));

        const fragment = document.createDocumentFragment();
        nouveaux.forEach((m) => {
            messageDocs.unshift(m);
            fragment.appendChild(creerElementMessage(m));
        });

        const premier = messagesArea.firstElementChild;
        if (premier) {
            messagesArea.insertBefore(fragment, premier);
        } else {
            messagesArea.appendChild(fragment);
        }

        lastVisibleDoc = docs[docs.length - 1];
        hasMoreMessages = docs.length === 50;
        messagesArea.scrollTop = messagesArea.scrollHeight - scrollBefore + messagesArea.scrollTop;
    } catch (error) {
        afficherErreurFirebase("Chargement des messages précédents", error);
    } finally {
        loadingMore = false;
        const loader = document.getElementById("messageLoader");
        if (loader) loader.hidden = true;
    }
}

function creerElementMessage(message) {
    const sender = String(message.senderId || message.sender || "").toLowerCase();
    const isMine = estMonMessage(message);

    const row = document.createElement("div");
    row.className = isMine ? "message-row mine" : "message-row other";
    row.dataset.messageId = message.id;
    if (selectedMessageIds.has(message.id)) {
        row.classList.add("selected");
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (message.replyTo && (message.replyTo.text || message.replyTo.id)) {
        const replyReference = document.createElement("div");
        replyReference.className = "reply-reference";
        replyReference.dataset.replyMessageId = message.replyTo.id || "";
        replyReference.tabIndex = message.replyTo.id ? 0 : -1;
        const replyAuthor = document.createElement("div");
        replyAuthor.className = "reply-author";
        replyAuthor.textContent = message.replyTo.author || "Réponse";
        const replyText = document.createElement("div");
        replyText.className = "reply-text";
        const originalMessage = messageDocs.find((item) => item.id === message.replyTo.id);
        replyText.textContent = originalMessage && originalMessage.deletedForEveryone
            ? "Ce message a été supprimé"
            : String(message.replyTo.text || "Message indisponible").slice(0, 120);
        replyReference.addEventListener("click", (event) => {
            event.stopPropagation();
            allerAuMessage(message.replyTo.id);
        });
        replyReference.appendChild(replyAuthor);
        replyReference.appendChild(replyText);
        bubble.appendChild(replyReference);
    }

    if (message.forwarded === true || (message.forwardedFrom && message.forwardedFrom.text)) {
        const forwarded = document.createElement("div");
        forwarded.className = "forwarded-label";
        forwarded.textContent = "Transféré";
        bubble.appendChild(forwarded);
    }

    const messageText = document.createElement("div");
    messageText.className = message.deletedForEveryone ? "deleted-message-text" : "";
    messageText.textContent = message.deletedForEveryone
        ? "Ce message a été supprimé"
        : String(message.text || message.contenu || "");

    if (message.edited && !message.deletedForEveryone) {
        const edited = document.createElement("span");
        edited.className = "edited-label";
        edited.textContent = "Modifié";
        messageText.appendChild(edited);
    }

    const time = document.createElement("div");
    time.className = "message-time";
    const date = horodatageDate(message.createdAt);
    time.textContent = date ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "…";

    bubble.appendChild(messageText);

    const reactions = Object.entries(message.reactions || {})
        .flatMap(([uid, emojis]) => (emojis && typeof emojis === "object"
            ? Object.keys(emojis).filter((emoji) => emojis[emoji] === true).map((emoji) => ({ uid, emoji }))
            : []));
    if (reactions.length) {
        const counts = new Map();
        reactions.forEach(({ emoji, uid }) => {
            const entry = counts.get(emoji) || { count: 0, mine: false };
            entry.count += 1;
            entry.mine = entry.mine || uid === currentUser.uid;
            counts.set(emoji, entry);
        });
        const reactionSummary = document.createElement("div");
        reactionSummary.className = "reaction-summary";
        counts.forEach(({ count, mine }, emoji) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = `reaction-chip${mine ? " reacted" : ""}`;
            chip.textContent = `${emoji} ${count}`;
            chip.setAttribute("aria-label", `${emoji}, ${count} réaction${count > 1 ? "s" : ""}`);
            chip.addEventListener("click", (event) => {
                event.stopPropagation();
                toggleReaction(message.id, emoji);
            });
            reactionSummary.appendChild(chip);
        });
        bubble.appendChild(reactionSummary);
    }

    bubble.appendChild(time);

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "message-menu-button";
    menuButton.setAttribute("aria-label", "Plus d’actions");
    menuButton.textContent = "⋮";
    menuButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openContextMenu(event, message.id);
    });

    bubble.addEventListener("click", (event) => {
        if (event.target.closest(".reply-reference, .reaction-summary")) return;
        if (selectedMessageIds.size) toggleMessageSelection(message.id);
    });

    row.addEventListener("click", (event) => {
        if (event.target.closest(".message-bubble, .message-menu-button")) return;
        if (selectedMessageIds.size) toggleMessageSelection(message.id);
    });

    row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openContextMenu(event, message.id);
    });

    row.appendChild(bubble);
    row.appendChild(menuButton);
    return row;
}

function initScrollInfini() {
    if (scrollInfiniInitialise) return;
    scrollInfiniInitialise = true;
    let ticking = false;
    messagesArea.addEventListener("scroll", () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const estEnHaut = messagesArea.scrollTop <= 60;
                if (estEnHaut && !loadingMore && hasMoreMessages) {
                    chargerMessagesPrecedents();
                }
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

function resetPagination() {
    messageDocs = [];
    lastVisibleDoc = null;
    hasMoreMessages = true;
    loadingMore = false;
    realtimeListenerActive = false;
    scrollInfiniInitialise = false;
}

function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => {
        toast.hidden = true;
    }, 2200);
}

function closeContextMenu() {
    if (!contextMenu) return;
    contextMenu.hidden = true;
    contextMenuMessageId = null;
}

function estMonMessage(message) {
    const sender = String(message && (message.senderId || message.sender) || "").toLowerCase();
    return Boolean(message && ((message.senderUid && message.senderUid === currentUser.uid)
        || sender === String(currentUser.email || "").toLowerCase()));
}

function allerAuMessage(messageId) {
    if (!messageId) return;
    let row = messagesArea.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!row) {
        getDoc(doc(db, "chats", currentChatId, "messages", messageId)).then((snapshot) => {
            if (!snapshot.exists() || snapshot.data().deletedForEveryone) {
                showToast("Le message d’origine a été supprimé ou n’est plus disponible.");
                return;
            }
            const message = { id: snapshot.id, ...snapshot.data(), _doc: snapshot };
            if (!messageDocs.some((item) => item.id === message.id)) {
                messageDocs.push(message);
                messageDocs.sort((a, b) => horodatageMillis(a.createdAt) - horodatageMillis(b.createdAt));
                const nextRow = [...messagesArea.querySelectorAll(".message-row")]
                    .find((item) => horodatageMillis(messageDocs.find((entry) => entry.id === item.dataset.messageId)?.createdAt) > horodatageMillis(message.createdAt));
                row = creerElementMessage(message);
                if (nextRow) messagesArea.insertBefore(row, nextRow);
                else messagesArea.appendChild(row);
            }
            allerAuMessage(messageId);
        }).catch((error) => afficherErreurFirebase("Ouverture du message cité", error));
        return;
    }
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("message-highlight");
    setTimeout(() => row.classList.remove("message-highlight"), 1800);
}

function updatePinnedMessageBanner(chat) {
    if (!pinnedMessageBanner) return;
    const messageId = chat && chat.pinnedMessageId;
    if (!messageId) {
        pinnedMessageBanner.hidden = true;
        pinnedMessageBanner.onclick = null;
        return;
    }
    const pinnedMessage = messageDocs.find((message) => message.id === messageId);
    const preview = pinnedMessage && !pinnedMessage.deletedForEveryone
        ? String(pinnedMessage.text || pinnedMessage.contenu || "Message")
        : "Message épinglé";
    pinnedMessageBanner.textContent = `Épinglé · ${preview.slice(0, 100)}`;
    pinnedMessageBanner.hidden = false;
    pinnedMessageBanner.onclick = () => allerAuMessage(messageId);
}

async function basculerEpingle(message) {
    if (!currentChatId || !message || message.deletedForEveryone) return;
    const chat = allChats.find((item) => item.id === currentChatId) || {};
    const chatRef = doc(db, "chats", currentChatId);
    try {
        if (chat.pinnedMessageId === message.id) {
            await updateDoc(chatRef, {
                pinnedMessageId: deleteField(),
                pinnedBy: deleteField(),
                pinnedAt: deleteField(),
                updatedAt: serverTimestamp()
            });
            showToast("Message désépinglé.");
        } else {
            await updateDoc(chatRef, {
                pinnedMessageId: message.id,
                pinnedBy: currentUser.uid,
                pinnedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            showToast("Message épinglé.");
        }
    } catch (error) {
        afficherErreurFirebase("Épinglage du message", error);
    }
}

async function toggleReaction(messageId, emoji) {
    const allowedEmojis = ["❤️", "😂", "👍", "😮", "😢", "🔥", "🙏"];
    if (!allowedEmojis.includes(emoji) || !currentUser || !currentChatId) return;
    const message = messageDocs.find((item) => item.id === messageId);
    if (!message || message.deletedForEveryone) return;

    const messageRef = doc(db, "chats", currentChatId, "messages", messageId);
    try {
        await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(messageRef);
            if (!snapshot.exists() || snapshot.data().deletedForEveryone) return;
            const mine = snapshot.data().reactions?.[currentUser.uid] || {};
            const next = { ...mine };
            if (next[emoji]) delete next[emoji];
            else next[emoji] = true;
            transaction.update(messageRef, { [`reactions.${currentUser.uid}`]: next });
        });
    } catch (error) {
        afficherErreurFirebase("Réaction au message", error);
    }
}

function updateReplyPreview() {
    if (!replyPreview || !replyPreviewAuthor || !replyPreviewText) return;
    if (!currentReply) {
        replyPreview.hidden = true;
        replyPreviewAuthor.textContent = "Réponse";
        replyPreviewText.textContent = "";
        return;
    }

    const author = currentReply.author || "Quelqu'un";
    replyPreviewAuthor.textContent = author;
    replyPreviewText.textContent = currentReply.text || "Message";
    replyPreview.hidden = false;
}

function clearReply() {
    currentReply = null;
    updateReplyPreview();
}

function updateSelectionToolbar() {
    if (!selectionToolbar) return;
    const count = selectedMessageIds.size;
    if (!count) {
        selectionToolbar.hidden = true;
        selectionToolbar.innerHTML = "";
        return;
    }

    selectionToolbar.hidden = false;
    selectionToolbar.innerHTML = `
        <span>${count} sélectionné${count > 1 ? "s" : ""}</span>
        <button type="button" data-selection-action="forward">Transférer</button>
        <button type="button" data-selection-action="copy">Copier</button>
        <button type="button" data-selection-action="delete">Supprimer pour moi</button>
        ${[...selectedMessageIds].some((id) => estMonMessage(messageDocs.find((message) => message.id === id)))
            ? '<button type="button" data-selection-action="delete-everyone">Supprimer pour tous</button>'
            : ""}
        <button type="button" data-selection-action="clear">Annuler</button>
    `;

    messagesArea.querySelectorAll(".message-row").forEach((row) => {
        row.classList.toggle("selected", selectedMessageIds.has(row.dataset.messageId));
    });

    selectionToolbar.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
            const action = button.dataset.selectionAction;
            if (action === "clear") {
                selectedMessageIds.clear();
                updateSelectionToolbar();
                return;
            }
            if (action === "forward") {
                openForwardModal([...selectedMessageIds]);
                return;
            }
            if (action === "copy") {
                copyMessages([...selectedMessageIds]);
                return;
            }
            if (action === "delete") {
                requestDeleteConfirmation([...selectedMessageIds], "me");
                return;
            }
            if (action === "delete-everyone") {
                requestDeleteConfirmation([...selectedMessageIds], "everyone");
            }
        });
    });
}

function toggleMessageSelection(messageId) {
    if (!messageId) return;
    if (selectedMessageIds.has(messageId)) {
        selectedMessageIds.delete(messageId);
    } else {
        selectedMessageIds.add(messageId);
    }
    updateSelectionToolbar();
    messagesArea.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)
        ?.classList.toggle("selected", selectedMessageIds.has(messageId));
}

function requestDeleteConfirmation(messageIds, mode) {
    const ids = [...new Set(messageIds.filter(Boolean))];
    if (!ids.length || !confirmModal || !confirmText) return;
    pendingDeleteIds = ids;
    pendingDeleteMode = mode === "everyone" ? "everyone" : "me";
    confirmText.textContent = pendingDeleteMode === "everyone"
        ? "Supprimer définitivement le contenu de ce message pour tous les participants ?"
        : ids.length > 1
            ? `Masquer ${ids.length} messages pour vous ?`
            : "Masquer ce message pour vous ?";
    confirmModal.hidden = false;
}

function openForwardModal(messageIds) {
    if (!forwardModal || !forwardSearch || !forwardList) return;
    pendingForwardMessageIds = (Array.isArray(messageIds) ? messageIds : [messageIds]).filter(Boolean);
    selectedForwardEmails = new Set();
    forwardModal.hidden = false;
    renderForwardList(forwardSearch.value || "");
    if (forwardSearch) {
        forwardSearch.focus();
    }
}

async function copyMessages(messageIds) {
    const text = [...new Set(messageIds)]
        .map((id) => messageDocs.find((message) => message.id === id))
        .filter((message) => message && !message.deletedForEveryone)
        .map((message) => String(message.text || message.contenu || ""))
        .filter(Boolean)
        .join("\n");
    if (!text) {
        showToast("Aucun texte à copier.");
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast("Texte copié.");
    } catch (error) {
        window.prompt("Copiez le texte sélectionné :", text);
    }
}

async function deleteMessageBatch(messageIds, mode) {
    const ids = [...new Set(messageIds.filter(Boolean))];
    if (!ids.length || !currentChatId) return;

    let succeeded = 0;
    let failed = 0;
    for (const id of ids) {
        const message = messageDocs.find((item) => item.id === id);
        if (!message || message.deletedForEveryone) continue;
        if (mode === "everyone" && !estMonMessage(message)) {
            failed += 1;
            continue;
        }
        try {
            const messageRef = doc(db, "chats", currentChatId, "messages", id);
            if (mode === "everyone") {
                await updateDoc(messageRef, {
                    text: "",
                    deletedForEveryone: true,
                    deletedAt: serverTimestamp()
                });
            } else {
                await updateDoc(messageRef, { hiddenFor: arrayUnion(currentUser.uid) });
            }
            succeeded += 1;
        } catch (error) {
            failed += 1;
            console.warn("Suppression refusée pour le message", id, error);
        }
    }
    selectedMessageIds.clear();
    updateSelectionToolbar();
    if (failed) showToast(`${succeeded} supprimé(s), ${failed} refusé(s) par les règles.`);
    else showToast(mode === "everyone" ? "Message supprimé pour tous." : "Message masqué pour vous.");
}

function buildContextMenu(messageId) {
    if (!contextMenu) return;
    const message = messageDocs.find((item) => item.id === messageId);
    if (!message) return;
    const ownMessage = estMonMessage(message);
    const deleted = message.deletedForEveryone === true;
    const activeChatData = allChats.find((chat) => chat.id === currentChatId) || {};
    const actions = [
        ["reply", "Répondre"],
        ["forward", "Transférer"],
        ["copy", "Copier le texte"],
        ["select", "Sélectionner"],
        ["edit", "Modifier"],
        ["pin", activeChatData.pinnedMessageId === message.id ? "Désépingler" : "Épingler"],
        ["delete-me", "Supprimer pour moi"],
        ["delete-everyone", "Supprimer pour tout le monde"]
    ].filter(([action]) => {
        if (action === "edit") return ownMessage && !deleted && Boolean(message.text);
        if (action === "delete-everyone") return ownMessage && !deleted;
        if (action === "copy") return !deleted && Boolean(message.text);
        if (action === "pin") return !deleted;
        return true;
    });

    contextMenu.replaceChildren();
    actions.forEach(([action, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `context-menu-item${action.startsWith("delete") ? " danger" : ""}`;
        button.dataset.contextAction = action;
        button.textContent = label;
        contextMenu.appendChild(button);
    });

    const reactionPicker = document.createElement("div");
    reactionPicker.className = "reaction-picker";
    reactionPicker.setAttribute("aria-label", "Réagir avec un emoji");
    ["❤️", "😂", "👍", "😮", "😢", "🔥", "🙏"].forEach((emoji) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = emoji;
        button.setAttribute("aria-label", `Réagir ${emoji}`);
        button.addEventListener("click", async () => {
            closeContextMenu();
            await toggleReaction(messageId, emoji);
        });
        reactionPicker.appendChild(button);
    });
    if (!deleted) contextMenu.appendChild(reactionPicker);

    contextMenu.querySelectorAll("[data-context-action]").forEach((button) => {
        button.addEventListener("click", async () => {
            const action = button.dataset.contextAction;
            closeContextMenu();
            if (action === "reply") {
                currentReply = {
                    id: message.id,
                    senderId: message.senderId || "",
                    senderUid: message.senderUid || "",
                    author: ownMessage ? "Vous" : (message.senderId || "Quelqu’un"),
                    text: String(message.text || message.contenu || "").slice(0, 120)
                };
                updateReplyPreview();
                messageInput.focus();
            } else if (action === "forward") {
                openForwardModal([messageId]);
            } else if (action === "copy") {
                await copyMessages([messageId]);
            } else if (action === "select") {
                toggleMessageSelection(messageId);
            } else if (action === "edit") {
                const newText = window.prompt("Modifier le message :", String(message.text || ""));
                if (newText === null || !newText.trim() || newText.length > 5000) return;
                try {
                    await updateDoc(doc(db, "chats", currentChatId, "messages", messageId), {
                        text: newText.trim(),
                        edited: true,
                        editedAt: serverTimestamp()
                    });
                } catch (error) {
                    afficherErreurFirebase("Modification du message", error);
                }
            } else if (action === "pin") {
                await basculerEpingle(message);
            } else if (action === "delete-me") {
                requestDeleteConfirmation([messageId], "me");
            } else if (action === "delete-everyone") {
                requestDeleteConfirmation([messageId], "everyone");
            }
        });
    });
}

function openContextMenu(event, messageId) {
    if (!contextMenu) return;
    contextMenuMessageId = messageId;
    buildContextMenu(messageId);
    contextMenu.hidden = false;
    const target = event.currentTarget && event.currentTarget.getBoundingClientRect
        ? event.currentTarget.getBoundingClientRect()
        : null;
    const x = Number.isFinite(event.clientX) && event.clientX > 0 ? event.clientX : (target ? target.right : 8);
    const y = Number.isFinite(event.clientY) && event.clientY > 0 ? event.clientY : (target ? target.top : 8);
    const bounds = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
}

function closeForwardModal() {
    if (!forwardModal) return;
    forwardModal.hidden = true;
    if (forwardSearch) {
        forwardSearch.value = "";
    }
    if (forwardList) {
        forwardList.innerHTML = "";
    }
    pendingForwardMessageIds = [];
    selectedForwardEmails.clear();
    if (forwardConfirm) forwardConfirm.disabled = true;
}

function renderForwardList(filter = "") {
    if (!forwardList) return;
    const query = String(filter || "").trim().toLowerCase();
    const candidates = allUsers.filter((user) => {
        const name = nomAffiche(user).toLowerCase();
        const email = String(user.email || "").toLowerCase();
        return email
            && email !== String(currentUser.email || "").toLowerCase()
            && getRequestStateForUser(email).status === "accepted"
            && (name.includes(query) || email.includes(query) || query === "");
    });

    if (!candidates.length) {
        forwardList.innerHTML = '<div class="no-results">Aucun destinataire trouvé.</div>';
        return;
    }

    forwardList.innerHTML = candidates.map((user) => `
        <button type="button" class="contact-item forward-recipient${selectedForwardEmails.has(user.email.toLowerCase()) ? " selected" : ""}" aria-pressed="${selectedForwardEmails.has(user.email.toLowerCase())}" data-forward-email="${escapeHTML(user.email || "")}" style="width: 100%; text-align: left; display: flex; align-items: center; margin: 0 0 8px; background: rgba(255,255,255,0.7);">
            <div class="contact-avatar">${getInitial(nomAffiche(user))}</div>
            <div class="contact-information">
                <div class="contact-name">${escapeHTML(nomAffiche(user))}</div>
                <div class="contact-last-message">${escapeHTML(user.email || "")}</div>
            </div>
            <span aria-hidden="true">${selectedForwardEmails.has(user.email.toLowerCase()) ? "✓" : ""}</span>
        </button>
    `).join("");

    forwardList.querySelectorAll("[data-forward-email]").forEach((button) => {
        button.addEventListener("click", () => {
            const targetEmail = String(button.dataset.forwardEmail || "").toLowerCase();
            if (!targetEmail) return;
            if (selectedForwardEmails.has(targetEmail)) selectedForwardEmails.delete(targetEmail);
            else selectedForwardEmails.add(targetEmail);
            renderForwardList(forwardSearch.value || "");
            if (forwardConfirm) forwardConfirm.disabled = selectedForwardEmails.size === 0;
        });
    });
}

async function confirmerTransfert() {
    const messages = pendingForwardMessageIds
        .map((id) => messageDocs.find((message) => message.id === id))
        .filter((message) => message && !message.deletedForEveryone && message.text);
    const recipients = [...selectedForwardEmails];
    if (!messages.length || !recipients.length) return;

    if (forwardConfirm) forwardConfirm.disabled = true;
    let forwardedCount = 0;
    try {
        for (const targetEmail of recipients) {
            if (getRequestStateForUser(targetEmail).status !== "accepted") continue;
            const targetUser = allUsers.find((user) => user.email.toLowerCase() === targetEmail);
            const targetChatId = creerChatId(String(currentUser.email).toLowerCase(), targetEmail);
            const targetChatRef = doc(db, "chats", targetChatId);
            const targetChatSnapshot = await getDoc(targetChatRef);
            const chatData = targetChatSnapshot.exists() ? targetChatSnapshot.data() : {};
            const batch = writeBatch(db);
            const lastText = String(messages[messages.length - 1].text || "");

            if (targetChatSnapshot.exists()) {
                if (!participantsValides(chatData.participants, currentUser.email, targetEmail)) continue;
                const unreadCount = Number(chatData.unreadCount && chatData.unreadCount[targetEmail]) || 0;
                batch.update(targetChatRef, {
                    dernierMessage: lastText,
                    updatedAt: serverTimestamp(),
                    [`unreadCount.${targetEmail}`]: unreadCount + messages.length
                });
            } else {
                const participants = [String(currentUser.email).toLowerCase(), targetEmail].sort();
                batch.set(targetChatRef, {
                    participants,
                    participantUids: [currentUser.uid, targetUser && (targetUser.profile.uid || targetUser.uid) || targetEmail].sort(),
                    dernierMessage: lastText,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    unreadCount: { [participants[0]]: 0, [targetEmail]: messages.length },
                    lastReadAt: { [participants[0]]: serverTimestamp(), [targetEmail]: serverTimestamp() }
                });
            }

            messages.forEach((sourceMessage) => {
                const forwardedMessageRef = doc(collection(db, "chats", targetChatId, "messages"));
                batch.set(forwardedMessageRef, {
                    senderId: String(currentUser.email).toLowerCase(),
                    senderUid: currentUser.uid,
                    text: String(sourceMessage.text),
                    forwarded: true,
                    createdAt: serverTimestamp()
                });
            });
            await batch.commit();
            forwardedCount += 1;
        }
        closeForwardModal();
        selectedMessageIds.clear();
        updateSelectionToolbar();
        showToast(forwardedCount ? `Transfert envoyé à ${forwardedCount} conversation(s).` : "Aucun transfert autorisé.");
    } catch (error) {
        afficherErreurFirebase("Transfert des messages", error);
    } finally {
        if (forwardConfirm) forwardConfirm.disabled = selectedForwardEmails.size === 0;
    }
}

/* =========================================================
   ENVOI DE MESSAGES
========================================================= */

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

        const myEmail = String(currentUser.email).toLowerCase();
        const otherEmail = String(selectedUser.email).toLowerCase();

        const chatReference = doc(db, "chats", currentChatId);
        const chatSnapshot = await getDoc(chatReference);
        if (!chatSnapshot.exists()) {
            throw new Error("La conversation n'existe pas. Réouvrez la conversation.");
        }

        const chat = chatSnapshot.data() || {};
        if (!participantsValides(chat.participants, myEmail, otherEmail)) {
            throw new Error("Vous ne faites pas partie de cette conversation.");
        }

        const messageReference = doc(collection(db, "chats", currentChatId, "messages"));
        const batch = writeBatch(db);
        const replyPayload = currentReply ? {
            id: currentReply.id,
            senderId: currentReply.senderId || (currentReply.author === "Vous" ? myEmail : ""),
            senderUid: currentReply.senderUid || "",
            author: currentReply.author || "Quelqu'un",
            text: String(currentReply.text || "")
        } : null;

        batch.set(messageReference, {
            senderId: myEmail,
            senderUid: currentUser.uid,
            text,
            replyTo: replyPayload,
            createdAt: serverTimestamp()
        });

        const unreadActuel = chat.unreadCount && typeof chat.unreadCount[otherEmail] === "number"
            ? chat.unreadCount[otherEmail]
            : 0;

        batch.update(chatReference, {
            dernierMessage: text,
            updatedAt: serverTimestamp(),
            [`unreadCount.${otherEmail}`]: unreadActuel + 1
        });

        await batch.commit();

        messageInput.value = "";
        clearReply();
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
   COMPOSER ET ADAPTATIVITÉ MOBILE
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
else if (sendButton) sendButton.addEventListener("click", envoyerMessage);

if (mobileBackButton) {
    mobileBackButton.addEventListener("click", () => {
        messengerContainer.classList.remove("chat-open");
        activeChat.classList.remove("visible");
        emptyConversation.style.display = "flex";
        selectedUser = null;
        currentChatId = null;
        selectedMessageIds.clear();
        clearReply();
        closeContextMenu();
        closeForwardModal();
        updateSelectionToolbar();
        activerComposer(false);
        afficherStatutComposer("", "");
        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }
        resetPagination();
        rafraichirListe();
    });
}

if (cancelReplyButton) {
    cancelReplyButton.addEventListener("click", () => {
        clearReply();
    });
}

if (forwardCancel) {
    forwardCancel.addEventListener("click", closeForwardModal);
}

if (forwardConfirm) {
    forwardConfirm.addEventListener("click", confirmerTransfert);
}

if (forwardSearch) {
    forwardSearch.addEventListener("input", (event) => {
        renderForwardList(event.target.value);
    });
}

if (confirmCancel) {
    confirmCancel.addEventListener("click", () => {
        confirmModal.hidden = true;
        pendingDeleteIds = [];
    });
}

if (confirmOk) {
    confirmOk.addEventListener("click", async () => {
        confirmModal.hidden = true;
        if (pendingDeleteIds.length) {
            await deleteMessageBatch(pendingDeleteIds, pendingDeleteMode);
            pendingDeleteIds = [];
        }
    });
}

document.addEventListener("click", (event) => {
    if (contextMenu && !contextMenu.hidden && !event.target.closest(".context-menu") && !event.target.closest(".message-menu-button")) {
        closeContextMenu();
    }
    if (forwardModal && !forwardModal.hidden && !event.target.closest(".modal-card") && !event.target.closest("[data-forward-email]") && !event.target.closest("#forwardCancel")) {
        closeForwardModal();
    }
    if (confirmModal && !confirmModal.hidden && !event.target.closest(".modal-card") && !event.target.closest("#confirmOk") && !event.target.closest("#confirmCancel")) {
        confirmModal.hidden = true;
        pendingDeleteIds = [];
    }
});

activerComposer(false);

/* =========================================================
   UTILITAIRES D'AFFICHAGE
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

function formaterDate(value) {
    const date = horodatageDate(value);
    if (!date) return "Récemment";
    const now = new Date();
    const diffJours = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffJours === 0) {
        return `Aujourd'hui à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (diffJours === 1) {
        return `Hier à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
        message = "Accès refusé par les règles Firestore. Vérifiez que vous êtes connecté et que vos identifiants sont autorisés.";
    } else if (error && error.code === "failed-precondition") {
        message = "Firestore demande une configuration supplémentaire (index ou précondition).";
    } else if (error && error.code === "unauthenticated") {
        message = "Session expirée. Reconnectez-vous sur Lumesys.";
    } else if (error && error.code === "unavailable") {
        message = "Connexion réseau indisponible. Vérifiez votre connexion.";
    } else if (error && error.message) {
        message = error.message;
    }

    afficherStatutComposer(`${contexte} : ${message}`, "error");
}
