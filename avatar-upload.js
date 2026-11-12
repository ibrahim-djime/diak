/* =========================================================
   LUMESYS — PHOTO DE PROFIL
   Upload de l'avatar utilisateur vers Firebase Storage puis
   mise à jour de public_profiles (photo, photoPath, photoUpdatedAt).

   Module autonome : ne dépend d'aucun autre script de page.
   Exposition :
     - <script type="module" src="../avatar-upload.js"> + window.LumesysAvatar
     - ou import { initAvatarUpload } from "../avatar-upload.js"
========================================================= */

import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
    getStorage,
    ref as storageRef,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { app, auth, db } from "./firebase-init.js";

/* =========================================================
   CONSTANTES
========================================================= */

const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COMPRESS_MAX_SIDE = 512;   // px — redimensionnement avant envoi
const COMPRESS_QUALITY = 0.9;
const STORAGE_ROOT = "profile_photos";
const COLLECTION = "public_profiles";

// La messagerie peut être chargée depuis /message : on réessaie avec les URLs absolues.
const ROOT_URL = new URL("./", import.meta.url).href;

let storage = null;
function obtenirStorage() {
    if (storage) return storage;
    storage = getStorage(app);
    return storage;
}

/* =========================================================
   OUTILS FICHIER
========================================================= */

function extensionPour(type) {
    switch (type) {
        case "image/png": return "png";
        case "image/webp": return "webp";
        case "image/jpeg":
        case "image/jpg":
        default: return "jpg";
    }
}

function validerFichier(file) {
    if (!file) return "Aucun fichier sélectionné.";
    if (!ACCEPTED_TYPES.includes(file.type)) {
        return "Format non pris en charge. Utilisez JPG, PNG ou WEBP.";
    }
    if (file.size <= 0) return "Le fichier semble vide.";
    if (file.size > MAX_BYTES) {
        return `Image trop lourde (${(file.size / 1024 / 1024).toFixed(1)} Mo). Maximum 5 Mo.`;
    }
    return null;
}

/**
 * Détecte le type MIME réel d'un fichier via ses magic bytes.
 * @returns {Promise<string|null>} type MIME détecté ou null si inconnu.
 */
async function detecterTypeReel(file) {
    if (!file || typeof file.slice !== "function") return null;
    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // JPEG : FF D8 FF
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "image/jpeg";
    // PNG : 89 50 4E 47 0D 0A 1A 0A
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "image/png";
    // WebP : RIFF....WEBP
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
    return null;
}

/**
 * Redimensionne et réencode l'image en WebP pour alléger l'envoi.
 * Retourne le fichier d'origine si le navigateur ne sait pas décoder,
 * ou si le réencodage produit un fichier plus lourd.
 */
async function preparerImage(file) {
    if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;

    try {
        const bitmap = await createImageBitmap(file);
        const ratio = Math.min(1, COMPRESS_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * ratio));
        const height = Math.max(1, Math.round(bitmap.height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return file;
        ctx.drawImage(bitmap, 0, 0, width, height);
        if (typeof bitmap.close === "function") bitmap.close();

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", COMPRESS_QUALITY));
        if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;

        const nom = `avatar_${Date.now()}.webp`;
        return new File([blob], nom, { type: "image/webp" });
    } catch (error) {
        console.warn("[avatar] Compression impossible, fichier original conservé.", error);
        return file;
    }
}

/* =========================================================
   UPLOAD
========================================================= */

/**
 * Envoie la photo, met à jour public_profiles puis supprime l'ancien fichier.
 * @param {object} options
 * @param {File}   options.file        Fichier choisi par l'utilisateur.
 * @param {object} [options.user]      Utilisateur Firebase (par défaut auth.currentUser).
 * @param {string} [options.docId]     Id du document public_profiles (défaut : email).
 * @param {string} [options.oldPhotoPath] Chemin Storage de l'ancienne photo (nettoyage).
 * @param {(percent:number)=>void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{photo:string, photoPath:string, previousPath:string|null}>}
 */
export async function uploadProfilePhoto({ file, user, docId, oldPhotoPath, onProgress, signal } = {}) {
    const utilisateur = user || auth.currentUser;
    if (!utilisateur) throw new Error("Connexion requise pour changer de photo.");

    const erreurValidation = validerFichier(file);
    if (erreurValidation) throw new Error(erreurValidation);

    const typeReel = await detecterTypeReel(file);
    if (typeReel && !ACCEPTED_TYPES.includes(typeReel)) {
        throw new Error("Format réel non pris en charge. Utilisez JPG, PNG ou WEBP.");
    }

    const uid = utilisateur.uid;
    const precedent = typeof oldPhotoPath === "string" ? oldPhotoPath.trim() : "";

    const pret = await preparerImage(file);
    const chemin = `${STORAGE_ROOT}/${uid}/avatar_${Date.now()}.${extensionPour(pret.type)}`;
    const emplacement = storageRef(obtenirStorage(), chemin);

    const tache = uploadBytesResumable(emplacement, pret, {
        contentType: pret.type,
        cacheControl: "public,max-age=3600",
        customMetadata: { owner: uid, email: String(utilisateur.email || "") }
    });

    if (signal) {
        if (signal.aborted) tache.cancel();
        else signal.addEventListener("abort", () => tache.cancel(), { once: true });
    }

    if (typeof onProgress === "function") {
        tache.on("state_changed", (snapshot) => {
            const total = snapshot.totalBytes || pret.size || 1;
            onProgress(Math.min(100, Math.round((snapshot.bytesTransferred / total) * 100)));
        });
    }

    const snapshot = await tache;
    const url = await getDownloadURL(snapshot.ref);
    const idDocument = docId || String(utilisateur.email || "").trim() || uid;

    await setDoc(doc(db, COLLECTION, idDocument), {
        photo: url,
        photoPath: chemin,
        photoUpdatedAt: serverTimestamp()
    }, { merge: true });

    // Cohérence avec Firebase Authentication photoURL
    try {
        await updateProfile(utilisateur, { photoURL: url });
    } catch (error) {
        console.warn("[avatar] Mise à jour photoURL Auth impossible :", error && error.message);
    }

    // Nettoyage : on ne supprime que si l'ancien chemin appartient bien à cet utilisateur
    // et qu'il diffère du nouveau (les échecs de suppression ne bloquent pas l'opération).
    if (precedent && precedent !== chemin && precedent.startsWith(`${STORAGE_ROOT}/${uid}/`)) {
        try {
            await deleteObject(storageRef(obtenirStorage(), precedent));
        } catch (error) {
            console.warn("[avatar] Ancienne photo non supprimée :", error && error.code, error && error.message);
        }
    }

    // Notification globale pour synchroniser les interfaces
    try {
        document.dispatchEvent(new CustomEvent("lumesys:avatar-updated", { detail: { photo: url, uid } }));
    } catch { /* DOM indisponible */ }

    return { photo: url, photoPath: chemin, previousPath: precedent || null };
}

/* =========================================================
   UI — OVERLAY + ICÔNE "+"
========================================================= */

const EXTENSIONS_UI = ["lumesys", "avatar", "current-user"];

function nomProfil(profil) {
    const prenom = String((profil && profil.prenom) || "").trim();
    const nom = String((profil && profil.nom) || "").trim();
    return `${prenom} ${nom}`.trim();
}

function initiales(texte) {
    const brut = String(texte || "").trim();
    if (!brut) return "?";
    const mots = brut.split(/\s+/).slice(0, 2);
    return mots.map((m) => m.charAt(0).toUpperCase()).join("") || "?";
}

function peindreAvatar(cible, url, nom) {
    if (!cible) return;
    cible.innerHTML = "";
    const src = typeof url === "string" ? url.trim() : "";
    if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = nom ? `Photo de ${nom}` : "Photo de profil";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => { cible.textContent = initiales(nom); }, { once: true });
        cible.appendChild(img);
        return;
    }
    cible.textContent = initiales(nom);
}

function afficherToast(message, type) {
    let toast = document.getElementById("avatarToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "avatarToast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
    }
    toast.className = `avatar-toast ${type || ""}`.trim();
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(afficherToast._minuteur);
    afficherToast._minuteur = setTimeout(() => { toast.hidden = true; }, 4200);
}

/**
 * Ajoute l'overlay cliquable sur un élément avatar.
 * @param {HTMLElement} avatar    Conteneur de l'avatar (photo ou initiales).
 * @param {object} options
 * @param {boolean} [options.multiple] Autorise plusieurs overlays non-Lumesys.
 * @returns {{ setPhoto(url:string):void, setBusy(busy:boolean, percent:number):void, input:HTMLInputElement }|null}
 */
export function attachAvatarUpload(avatar, { multiple = false } = {}) {
    if (!avatar || avatar.dataset.avatarUpload === "ready") return null;

    if (!multiple) {
        const pris = document.querySelectorAll('[data-avatar-upload="ready"]');
        for (const autre of pris) {
            if (!EXTENSIONS_UI.some((c) => autre.classList.contains(c))) return null;
        }
    }

    avatar.dataset.avatarUpload = "ready";

    const conteneur = document.createElement("div");
    conteneur.className = "avatar-upload";

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "avatar-upload-btn";
    bouton.setAttribute("aria-label", "Changer ma photo de profil");
    bouton.title = "Changer ma photo de profil";
    bouton.innerHTML = `
        <span class="avatar-upload-plus" aria-hidden="true">+</span>
        <span class="avatar-upload-ring" aria-hidden="true"></span>
        <span class="avatar-upload-progress" aria-hidden="true">0%</span>
    `;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED_TYPES.join(",");
    input.className = "sr-only";
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");

    conteneur.appendChild(bouton);
    conteneur.appendChild(input);
    avatar.appendChild(conteneur);

    const progression = bouton.querySelector(".avatar-upload-progress");
    let enCours = false;
    let profilCourant = null;

    function setBusy(busy, percent = 0) {
        enCours = busy;
        bouton.classList.toggle("uploading", busy);
        bouton.setAttribute("aria-busy", String(busy));
        if (progression) progression.textContent = `${Math.round(percent)}%`;
        bouton.style.setProperty("--avatar-progress", `${Math.round(percent)}%`);
        input.disabled = busy;
    }

    async function demarrer(file) {
        if (enCours) return;
        const erreur = validerFichier(file);
        if (erreur) {
            afficherToast(erreur, "error");
            input.value = "";
            return;
        }

        setBusy(true, 0);
        try {
            const utilisateur = auth.currentUser;
            const resultat = await uploadProfilePhoto({
                file,
                user: utilisateur,
                docId: String((utilisateur && utilisateur.email) || ""),
                oldPhotoPath: profilCourant && profilCourant.photoPath,
                onProgress: (p) => setBusy(true, p)
            });

            profilCourant = { ...(profilCourant || {}), photo: resultat.photo, photoPath: resultat.photoPath };
            peindreAvatar(avatar, resultat.photo, nomProfil(profilCourant));
            rafraichirAvatars(resultat.photo);
            afficherToast("Photo de profil mise à jour.", "success");
            document.dispatchEvent(new CustomEvent("lumesys:avatar-updated", { detail: resultat }));
        } catch (error) {
            const annule = error && (error.code === "storage/canceled" || error.name === "AbortError");
            if (!annule) {
                console.error("[avatar] Échec de l'envoi", error);
                const message = error && error.code === "storage/unauthorized"
                    ? "Envoi refusé par les règles Firebase Storage."
                    : (error && error.message) || "Impossible d'enregistrer la photo.";
                afficherToast(message, "error");
            }
        } finally {
            setBusy(false, 0);
            input.value = "";
        }
    }

    bouton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (enCours) return;
        if (!auth.currentUser) {
            afficherToast("Connectez-vous pour changer de photo.", "error");
            return;
        }
        input.click();
    });

    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (file) demarrer(file);
    });

    // Glisser-déposer discret sur l'avatar
    ["dragenter", "dragover"].forEach((type) => {
        avatar.addEventListener(type, (e) => {
            if (!auth.currentUser) return;
            e.preventDefault();
            bouton.classList.add("drag-over");
        });
    });
    ["dragleave", "drop"].forEach((type) => {
        avatar.addEventListener(type, (e) => {
            if (!auth.currentUser) return;
            e.preventDefault();
            bouton.classList.remove("drag-over");
            if (type === "drop" && e.dataTransfer && e.dataTransfer.files[0]) {
                demarrer(e.dataTransfer.files[0]);
            }
        });
    });

    return {
        input,
        setBusy,
        setPhoto(url) {
            profilCourant = { ...(profilCourant || {}), photo: url };
            peindreAvatar(avatar, url, nomProfil(profilCourant));
        },
        setProfile(profil) {
            profilCourant = profil || {};
        }
    };
}

/* =========================================================
   PROPAGATION UI
========================================================= */

function rafraichirAvatars(url) {
    if (!url) return;
    const bust = `v=${Date.now()}`;
    const urlAvecCache = url.includes("?") ? `${url}&${bust}` : `${url}?${bust}`;

    try {
        localStorage.setItem("lumesysPhoto", url);
    } catch { /* stockage indisponible : on continue */ }

    const selecteurs = ["#currentUserAvatar", ".current-user-avatar", "#profileAvatar", ".profile-avatar"];
    selecteurs.forEach((selecteur) => {
        document.querySelectorAll(selecteur).forEach((element) => {
            if (element.querySelector(".avatar-upload")) return; // overlay préservé
            const img = element.querySelector("img");
            if (img) img.src = urlAvecCache;
            else peindreAvatar(element, urlAvecCache, "");
        });
    });

    const navatars = document.querySelectorAll("img[data-user-avatar], img.avatar, .contact-avatar img");
    navatars.forEach((img) => {
        if (img.dataset.avatarUploaded === "true" || img.closest(".current-user-avatar")) img.src = urlAvecCache;
    });
}

/* =========================================================
   INITIALISATION
========================================================= */

let etatInitialise = false;

/**
 * Branche l'overlay sur l'avatar de l'utilisateur connecté et
 * charge la photo courante depuis public_profiles.
 */
export function initAvatarUpload(options = {}) {
    const {
        target = document.getElementById("currentUserAvatar"),
        docId,
        autoRefresh = true
    } = options;

    if (etatInitialise || !target) return null;
    etatInitialise = true;

    let controle = null;
    let dejaInitialise = false;

    onAuthStateChanged(auth, async (utilisateur) => {
        if (!utilisateur) {
            if (controle) controle.setBusy(false, 0);
            target.dataset.avatarLocked = "true";
            return;
        }
        delete target.dataset.avatarLocked;

        if (!dejaInitialise) {
            controle = attachAvatarUpload(target) || { setPhoto() {}, setProfile() {}, setBusy() {} };
            dejaInitialise = true;
        }

        const idDocument = docId || String(utilisateur.email || "").trim() || utilisateur.uid;
        try {
            const snapshot = await getDoc(doc(db, COLLECTION, idDocument));
            const profil = snapshot.exists() ? (snapshot.data() || {}) : {};
            if (controle.setProfile) controle.setProfile(profil);

            const photo = String(profil.photo || utilisateur.photoURL || "").trim();
            if (photo) {
                peindreAvatar(target, photo, nomProfil(profil));
                if (autoRefresh) rafraichirAvatars(photo);
            }
        } catch (error) {
            console.warn("[avatar] Lecture du profil impossible :", error && error.code, error && error.message);
        }
    });

    if (autoRefresh) {
        document.addEventListener("lumesys:avatar-updated", (event) => {
            const photo = event && event.detail && event.detail.photo;
            if (photo) rafraichirAvatars(photo);
        });
    }

    return { refresh: rafraichirAvatars };
}

if (typeof window !== "undefined") {
    window.LumesysAvatar = { initAvatarUpload, attachAvatarUpload, uploadProfilePhoto, validerFichier };
    // Auto-démarrage si la page contient l'avatar courant.
    const cible = document.getElementById("currentUserAvatar");
    if (cible) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => initAvatarUpload(), { once: true });
        } else {
            initAvatarUpload();
        }
    }
}
