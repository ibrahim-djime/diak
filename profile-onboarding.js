import { doc, getDoc, setDoc, writeBatch, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { PHONE_LOOKUP_ENDPOINT } from "./phone-config.js";
import { listPhoneCountries, parseInternationalPhone } from "./phone-utils.js";

const PRIVATE_PROFILES = "private_profiles";
const MAX_LOCATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function createOverlay(title, content) {
    const overlay = document.createElement("div");
    overlay.className = "profile-onboarding-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
        <section class="profile-onboarding-card">
            <h2>${title}</h2>
            ${content}
        </section>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function addStyles() {
    if (document.getElementById("profile-onboarding-styles")) return;
    const style = document.createElement("style");
    style.id = "profile-onboarding-styles";
    style.textContent = `
        .profile-onboarding-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(16,28,38,.78)}
        .profile-onboarding-card{width:min(100%,480px);max-height:92vh;overflow:auto;padding:24px;border-radius:18px;background:#fff;color:#243746;box-shadow:0 20px 60px rgba(0,0,0,.28);font:15px/1.5 "Segoe UI",Arial,sans-serif}
        .profile-onboarding-card h2{margin:0 0 10px;font-size:22px}
        .profile-onboarding-card p{margin:8px 0 14px}
        .profile-onboarding-card label{display:block;margin:12px 0 5px;font-weight:600}
        .profile-onboarding-card input,.profile-onboarding-card select{box-sizing:border-box;width:100%;min-height:42px;padding:9px 11px;border:1px solid #c8d3dc;border-radius:9px;background:#fff;color:#243746}
        .profile-onboarding-card button{min-height:42px;margin-top:12px;padding:9px 14px;border:0;border-radius:9px;background:#277da1;color:#fff;font-weight:600;cursor:pointer}
        .profile-onboarding-card button:disabled{opacity:.55;cursor:not-allowed}
        .profile-onboarding-card .profile-secondary{background:#edf4f7;color:#243746}
        .profile-onboarding-card .profile-inline{display:flex;gap:8px}
        .profile-onboarding-card .profile-inline>*{flex:1}
        .profile-onboarding-card .profile-check{display:flex;align-items:flex-start;gap:9px;font-weight:400}
        .profile-onboarding-card .profile-check input{width:auto;min-height:auto;margin-top:5px}
        .profile-onboarding-card [role=status]{min-height:1.5em;color:#9d2b24}
        @media(max-width:520px){.profile-onboarding-card{padding:18px}.profile-onboarding-card .profile-inline{display:block}}
    `;
    document.head.appendChild(style);
}

function showRequiredPhoneDialog({ user, privateRef, initialPhone, initialCountry, initialSex, initialLookup, allowCancel = false }) {
    addStyles();
    return new Promise((resolve) => {
        const countries = listPhoneCountries();
        const countryOptions = countries.map(({ country, callingCode, name }) =>
            `<option value="${country}">${name} (+${callingCode})</option>`
        ).join("");
        const lookupReady = Boolean(PHONE_LOOKUP_ENDPOINT);
        const overlay = createOverlay(
            "Compléter votre profil",
            `<p>Un numéro valide est requis. Il sera enregistré dans un profil privé et ne sera pas affiché aux autres utilisateurs.</p>
             <label for="profileCountry">Pays</label>
             <select id="profileCountry">${countryOptions}</select>
             <label for="profilePhone">Numéro de téléphone</label>
             <input id="profilePhone" type="tel" autocomplete="tel" placeholder="Numéro local ou +223…">
             <label for="profileSex">Sexe</label>
             <select id="profileSex"><option value="">Sélectionnez le sexe</option><option>Homme</option><option>Femme</option><option>Préfère ne pas répondre</option></select>
             <label class="profile-check"><input id="profilePhoneLookup" type="checkbox" ${lookupReady ? "" : "disabled"}>
               <span>Autoriser les autres utilisateurs à me trouver par numéro${lookupReady ? ". N'activez cette option que pour votre propre numéro; il n'est pas vérifié par SMS." : " (recherche indisponible avant la configuration du service sécurisé)"}.</span>
             </label>
             <p id="profilePhoneStatus" role="status" aria-live="polite"></p>
             <button id="profilePhoneSave" type="button">Enregistrer</button>
             ${allowCancel ? '<button id="profilePhoneCancel" class="profile-secondary" type="button">Annuler</button>' : ""}`
        );
        const country = overlay.querySelector("#profileCountry");
        const phone = overlay.querySelector("#profilePhone");
        const sex = overlay.querySelector("#profileSex");
        const lookup = overlay.querySelector("#profilePhoneLookup");
        const status = overlay.querySelector("#profilePhoneStatus");
        const save = overlay.querySelector("#profilePhoneSave");
        country.value = initialCountry || "ML";
        phone.value = initialPhone || "";
        sex.value = initialSex || "";
        lookup.checked = lookupReady && Boolean(initialLookup);

        save.addEventListener("click", async () => {
            const parsed = parseInternationalPhone(phone.value, country.value);
            if (!parsed.valid) {
                status.textContent = parsed.error;
                phone.focus();
                return;
            }
            if (!sex.value) {
                status.textContent = "Sélectionnez une option pour continuer.";
                sex.focus();
                return;
            }

            save.disabled = true;
            status.textContent = "Enregistrement…";
            try {
                if (lookupReady && initialLookup && initialPhone && (initialPhone !== parsed.e164 || !lookup.checked)) {
                    await registerPhoneLookup(user, initialPhone, false);
                }
                const profile = {
                    phoneE164: parsed.e164,
                    phoneCountry: parsed.country,
                    phoneStatus: "pending",
                    phoneLookupEnabled: false,
                    phoneUpdatedAt: serverTimestamp(),
                    legacyPhoneCandidates: deleteField(),
                    sexe: sex.value
                };
                await setDoc(privateRef, profile, { merge: true });

                if (lookupReady && lookup.checked) {
                    let lookupRegistered = false;
                    try {
                        await registerPhoneLookup(user, parsed.e164, true);
                        lookupRegistered = true;
                        profile.phoneLookupEnabled = true;
                        await setDoc(privateRef, { phoneLookupEnabled: true }, { merge: true });
                    } catch (error) {
                        if (lookupRegistered) {
                            try {
                                await registerPhoneLookup(user, parsed.e164, false);
                            } catch (rollbackError) {
                                console.error("Désactivation de la recherche téléphonique après échec impossible:", rollbackError);
                            }
                        }
                        status.textContent = error.message === "Ce numéro est déjà associé à un autre compte."
                            ? error.message
                            : "Numéro enregistré, mais la recherche par numéro n'a pas pu être activée. Réessayez.";
                        console.warn("Activation de la recherche téléphonique impossible:", error);
                        return;
                    }
                } else if (lookupReady) {
                    await registerPhoneLookup(user, parsed.e164, false);
                }

                overlay.remove();
                resolve({ phone: parsed.e164, sex: sex.value });
                return;
            } catch (error) {
                status.textContent = "Enregistrement impossible. Vérifiez votre connexion puis réessayez.";
                console.error("Enregistrement du profil privé impossible:", error);
            } finally {
                save.disabled = false;
            }
        });
        const cancel = overlay.querySelector("#profilePhoneCancel");
        if (cancel) {
            cancel.addEventListener("click", () => {
                overlay.remove();
                resolve(null);
            });
        }

    });
}

function getBrowserPosition() {
    if (!navigator.geolocation) {
        return Promise.reject(new Error("La géolocalisation n'est pas prise en charge par cet appareil."));
    }
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            resolve,
            (error) => reject(new Error(error.code === error.PERMISSION_DENIED
                ? "Autorisation refusée. Vous pouvez saisir une ville manuellement."
                : "Position indisponible. Vous pouvez saisir une ville manuellement.")),
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 5 * 60 * 1000 }
        );
    });
}

function showLocationDialog({ db, privateRef, privateData, publicRef, allowSkip = false }) {
    addStyles();
    return new Promise((resolve) => {
        let gpsPosition = null;
        const overlay = createOverlay(
            "Votre localisation",
            `<p>Avec votre accord, Lumesys peut utiliser votre position pour proposer des personnes proches de vous. La position GPS précise reste privée; le pays, la région et la ville que vous partagez seront visibles sur votre profil public.</p>
             <button id="profileUseGps" type="button">Autoriser ma position actuelle</button>
             <p id="profileGpsStatus" role="status" aria-live="polite">Vous pouvez aussi renseigner votre ville manuellement. Aucun suivi permanent ne sera effectué.</p>
             <label for="profileLocationCountry">Pays</label><input id="profileLocationCountry" autocomplete="country-name" placeholder="Ex. Mali">
             <label for="profileLocationRegion">Région (facultatif)</label><input id="profileLocationRegion" autocomplete="address-level1">
             <label for="profileLocationCity">Ville ou commune (facultatif avec GPS)</label><input id="profileLocationCity" autocomplete="address-level2">
             <button id="profileLocationSave" type="button">Enregistrer ma localisation</button>
             ${allowSkip ? '<button id="profileLocationSkip" class="profile-secondary" type="button">Pas maintenant</button>' : ""}
             ${allowSkip ? "" : '<button id="profileLocationCancel" class="profile-secondary" type="button">Annuler</button>'}
             <button id="profileLocationRemove" class="profile-secondary" type="button">Supprimer ma localisation</button>`
        );
        const gpsStatus = overlay.querySelector("#profileGpsStatus");
        const useGps = overlay.querySelector("#profileUseGps");
        overlay.querySelector("#profileLocationCountry").value = privateData.locationCountry || "";
        overlay.querySelector("#profileLocationRegion").value = privateData.locationRegion || "";
        overlay.querySelector("#profileLocationCity").value = privateData.locationCity || "";
        useGps.addEventListener("click", async () => {
            useGps.disabled = true;
            gpsStatus.textContent = "Demande d'autorisation…";
            try {
                gpsPosition = await getBrowserPosition();
                gpsStatus.textContent = "Position GPS obtenue. Les coordonnées resteront privées.";
            } catch (error) {
                gpsStatus.textContent = error.message;
            } finally {
                useGps.disabled = false;
            }
        });

        overlay.querySelector("#profileLocationSave").addEventListener("click", async (event) => {
            const button = event.currentTarget;
            const country = overlay.querySelector("#profileLocationCountry").value.trim();
            const region = overlay.querySelector("#profileLocationRegion").value.trim();
            const city = overlay.querySelector("#profileLocationCity").value.trim();
            if (!gpsPosition && (!country || !city)) {
                gpsStatus.textContent = "Saisissez au minimum votre pays et votre ville, ou autorisez la géolocalisation.";
                return;
            }
            button.disabled = true;
            gpsStatus.textContent = "Enregistrement…";
            try {
                const savedAt = new Date();
                const privateLocation = {
                    locationSource: gpsPosition ? "gps" : "manual",
                    locationSharingEnabled: true,
                    locationUpdatedAt: serverTimestamp(),
                    locationCountry: country || "",
                    locationRegion: region || "",
                    locationCity: city || ""
                };
                if (gpsPosition) {
                    privateLocation.latitude = gpsPosition.coords.latitude;
                    privateLocation.longitude = gpsPosition.coords.longitude;
                    privateLocation.accuracyMeters = gpsPosition.coords.accuracy;
                }
                const batch = writeBatch(db);
                batch.set(privateRef, privateLocation, { merge: true });
                batch.set(publicRef, {
                    pays: country,
                    region,
                    ville: city,
                    locationSource: gpsPosition ? "gps" : "manual",
                    updatedAt: serverTimestamp(),
                    telephone: deleteField(),
                    numero: deleteField(),
                    latitude: deleteField(),
                    longitude: deleteField(),
                    localisation: deleteField(),
                    ip: deleteField()
                }, { merge: true });
                await batch.commit();
                overlay.remove();
                resolve({ ...privateData, ...privateLocation, locationUpdatedAt: savedAt });
            } catch (error) {
                gpsStatus.textContent = "Enregistrement impossible. Vérifiez votre connexion puis réessayez.";
                console.error("Enregistrement de la localisation impossible:", error);
                button.disabled = false;
            }
        });

        const skip = overlay.querySelector("#profileLocationSkip");
        if (skip) {
            skip.addEventListener("click", async () => {
                skip.disabled = true;
                try {
                    const batch = writeBatch(db);
                    batch.set(privateRef, {
                        locationSharingEnabled: false,
                        locationUpdatedAt: serverTimestamp()
                    }, { merge: true });
                    batch.set(publicRef, {
                        pays: deleteField(),
                        region: deleteField(),
                        ville: deleteField(),
                        locationSource: deleteField(),
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                    await batch.commit();
                    overlay.remove();
                    resolve({ ...privateData, locationSharingEnabled: false });
                } catch (error) {
                    gpsStatus.textContent = "Impossible d'enregistrer ce choix. Réessayez.";
                    console.error("Enregistrement du choix de localisation impossible:", error);
                    skip.disabled = false;
                }
            });
        }

        overlay.querySelector("#profileLocationRemove").addEventListener("click", async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                const batch = writeBatch(db);
                batch.set(privateRef, {
                    locationSource: deleteField(),
                    locationUpdatedAt: deleteField(),
                    locationCountry: deleteField(),
                    locationRegion: deleteField(),
                    locationCity: deleteField(),
                    latitude: deleteField(),
                    longitude: deleteField(),
                    accuracyMeters: deleteField(),
                    locationSharingEnabled: false
                }, { merge: true });
                batch.set(publicRef, {
                    pays: deleteField(),
                    region: deleteField(),
                    ville: deleteField(),
                    locationSource: deleteField(),
                    updatedAt: serverTimestamp()
                }, { merge: true });
                await batch.commit();
                overlay.remove();
                resolve({ ...privateData, locationSharingEnabled: false });
            } catch (error) {
                gpsStatus.textContent = "Suppression impossible. Vérifiez votre connexion puis réessayez.";
                console.error("Suppression de la localisation impossible:", error);
                button.disabled = false;
            }
        });
        const cancel = overlay.querySelector("#profileLocationCancel");
        if (cancel) {
            cancel.addEventListener("click", () => {
                overlay.remove();
                resolve(privateData);
            });
        }
    });
}

async function registerPhoneLookup(user, phoneE164, enabled) {
    if (!PHONE_LOOKUP_ENDPOINT) {
        if (enabled) throw new Error("Le service de recherche téléphonique n'est pas configuré.");
        return;
    }
    const response = await fetch(`${PHONE_LOOKUP_ENDPOINT.replace(/\/$/, "")}/v1/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({ phoneE164, enabled })
    });
    if (!response.ok) {
        throw new Error(response.status === 409
            ? "Ce numéro est déjà associé à un autre compte."
            : "Le service sécurisé de recherche téléphonique a refusé la mise à jour.");
    }
}

export async function ensurePrivateProfile({ user, db, userData = {}, publicData = {} }) {
    if (!user || !user.uid || !user.email) throw new Error("Une session Firebase authentifiée est requise.");
    const email = String(user.email).toLowerCase();
    const privateRef = doc(db, PRIVATE_PROFILES, user.uid);
    const publicRef = doc(db, "public_profiles", email);
    const userRef = doc(db, "utilisateurs", email);
    const privateSnapshot = await getDoc(privateRef);
    let profile = privateSnapshot.exists() ? privateSnapshot.data() : {};

    if (profile.locationSource && !["gps", "manual", "legacy"].includes(profile.locationSource)) {
        await setDoc(privateRef, { locationSource: "legacy" }, { merge: true });
        profile = { ...profile, locationSource: "legacy" };
    }

    if (profile.phoneE164 && !parseInternationalPhone(profile.phoneE164, profile.phoneCountry || "ML").valid) {
        const oldPhone = String(profile.phoneE164);
        if (profile.phoneLookupEnabled && PHONE_LOOKUP_ENDPOINT) {
            await registerPhoneLookup(user, oldPhone, false);
        }
        const candidates = [...new Set([oldPhone, ...(Array.isArray(profile.legacyPhoneCandidates) ? profile.legacyPhoneCandidates : [])]
            .filter((value) => typeof value === "string" && value.trim()))].slice(0, 5);
        await setDoc(privateRef, {
            phoneE164: deleteField(),
            phoneCountry: deleteField(),
            phoneStatus: deleteField(),
            phoneLookupEnabled: false,
            legacyPhoneCandidates: candidates
        }, { merge: true });
        profile = { ...profile, phoneE164: undefined, phoneCountry: undefined, phoneStatus: undefined, phoneLookupEnabled: false, legacyPhoneCandidates: candidates };
    }

    const storedLegacyPhones = Array.isArray(profile.legacyPhoneCandidates)
        ? profile.legacyPhoneCandidates.filter((value) => typeof value === "string" && value.trim())
        : [];
    const legacyPhone = String(userData.numero || publicData.telephone || publicData.numero || storedLegacyPhones[0] || "").trim();
    if (!profile.phoneE164 && (storedLegacyPhones.length <= 1)) {
        if (legacyPhone.trim().startsWith("+")) {
            const parsed = parseInternationalPhone(legacyPhone, "ML");
            if (parsed.valid) {
                await setDoc(privateRef, {
                    phoneE164: parsed.e164,
                    phoneCountry: parsed.country,
                    phoneStatus: "pending",
                    phoneLookupEnabled: false,
                    phoneUpdatedAt: serverTimestamp(),
                    legacyPhoneCandidates: deleteField()
                }, { merge: true });
                profile = {
                    ...profile,
                    phoneE164: parsed.e164,
                    phoneCountry: parsed.country,
                    phoneStatus: "pending",
                    phoneLookupEnabled: false
                };
            }
        }
    }

    const existingSex = profile.sexe || userData.sexe || publicData.sexe || "";
    if (existingSex && !profile.sexe) {
        await setDoc(privateRef, { sexe: existingSex }, { merge: true });
        profile = { ...profile, sexe: existingSex };
    }

    if (!profile.phoneE164 || !profile.sexe) {
        const saved = await showRequiredPhoneDialog({
            user,
            db,
            privateRef,
            initialPhone: profile.phoneE164 || (storedLegacyPhones.length <= 1 ? legacyPhone : ""),
            initialCountry: profile.phoneCountry || "ML",
            initialSex: existingSex,
            initialLookup: profile.phoneLookupEnabled
        });
        profile = { ...profile, phoneE164: saved.phone, sexe: saved.sex, phoneStatus: "pending" };
    }

    const updatedUserData = {
        ...userData,
        numero: deleteField(),
        sexe: deleteField(),
        localisation: deleteField(),
        lastUpdatedAt: serverTimestamp()
    };
    const publicCleanup = {
        telephone: deleteField(),
        numero: deleteField(),
        latitude: deleteField(),
        longitude: deleteField(),
        localisation: deleteField(),
        ip: deleteField(),
        sexe: deleteField(),
        updatedAt: serverTimestamp()
    };

    if (profile.locationSharingEnabled === false) {
        Object.assign(publicCleanup, {
            pays: deleteField(),
            region: deleteField(),
            ville: deleteField(),
            locationSource: deleteField()
        });
    }
    const cleanupBatch = writeBatch(db);
    cleanupBatch.set(userRef, updatedUserData, { merge: true });
    cleanupBatch.set(publicRef, publicCleanup, { merge: true });
    await cleanupBatch.commit();

    const storedLocation = profile.locationUpdatedAt && typeof profile.locationUpdatedAt.toMillis === "function"
        ? profile.locationUpdatedAt.toMillis()
        : 0;
    const gpsIsStale = profile.locationSource === "gps"
        && Date.now() - storedLocation > MAX_LOCATION_AGE_MS;
    if (profile.locationSharingEnabled !== false && (!storedLocation || gpsIsStale)) {
        profile = await showLocationDialog({ db, privateRef, privateData: profile, publicRef, allowSkip: !storedLocation });
    }

    return profile;
}

export async function editPhoneSettings({ user, db }) {
    if (!user || !user.uid || !user.email) throw new Error("Une session Firebase authentifiée est requise.");
    const ref = doc(db, PRIVATE_PROFILES, user.uid);
    const snapshot = await getDoc(ref);
    const profile = snapshot.exists() ? snapshot.data() : {};
    return showRequiredPhoneDialog({
        user,
        privateRef: ref,
        initialPhone: profile.phoneE164 || "",
        initialCountry: profile.phoneCountry || "ML",
        initialSex: profile.sexe || "",
        initialLookup: profile.phoneLookupEnabled,
        allowCancel: true
    });
}

export async function editLocationSettings({ user, db }) {
    if (!user || !user.uid || !user.email) throw new Error("Une session Firebase authentifiée est requise.");
    const email = String(user.email).toLowerCase();
    const privateRef = doc(db, PRIVATE_PROFILES, user.uid);
    const privateSnapshot = await getDoc(privateRef);
    const privateData = privateSnapshot.exists() ? privateSnapshot.data() : {};
    return showLocationDialog({
        db,
        privateRef,
        privateData,
        publicRef: doc(db, "public_profiles", email)
    });
}

export async function searchPhone(phoneE164, user) {
    if (!PHONE_LOOKUP_ENDPOINT) throw new Error("La recherche par téléphone attend la configuration du service Cloudflare sécurisé.");
    const response = await fetch(`${PHONE_LOOKUP_ENDPOINT.replace(/\/$/, "")}/v1/search`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({ phoneE164 })
    });
    if (response.status === 404) return null;
    if (response.status === 429) throw new Error("Trop de recherches. Réessayez plus tard.");
    if (!response.ok) throw new Error("La recherche téléphonique sécurisée est temporairement indisponible.");
    const result = await response.json();
    return typeof result.uid === "string" ? result.uid : null;
}
