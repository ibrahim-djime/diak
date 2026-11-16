const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = "lumina-analytics";
const applyChanges = process.argv.includes("--apply");

if (applyChanges && process.env.CONFIRM_PRIVATE_PROFILE_MIGRATION !== PROJECT_ID) {
    throw new Error(`Set CONFIRM_PRIVATE_PROFILE_MIGRATION=${PROJECT_ID} to apply changes.`);
}

initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID
});

const db = getFirestore();

async function loadAuthUsers() {
    const users = new Map();
    let pageToken;
    do {
        const page = await getAuth().listUsers(1000, pageToken);
        for (const user of page.users) {
            if (user.email) users.set(user.email.toLowerCase(), user.uid);
        }
        pageToken = page.pageToken;
    } while (pageToken);
    return users;
}

function documentMap(snapshot) {
    return new Map(snapshot.docs.map((document) => [
        String(document.data().email || document.id).toLowerCase(),
        document
    ]));
}

function uniqueStrings(values) {
    return [...new Set(values
        .filter((value) => typeof value === "string" || typeof value === "number")
        .map((value) => String(value).trim()).filter(Boolean))];
}

function field(data, key, fallback) {
    return data[key] !== undefined && data[key] !== null && data[key] !== ""
        ? data[key]
        : fallback;
}

async function main() {
    const [authUsers, userSnapshots, publicSnapshots] = await Promise.all([
        loadAuthUsers(),
        db.collection("utilisateurs").get(),
        db.collection("public_profiles").get()
    ]);
    const users = documentMap(userSnapshots);
    const publicProfiles = documentMap(publicSnapshots);
    const emails = new Set([...users.keys(), ...publicProfiles.keys()]);
    let migrated = 0;
    let skippedWithoutAuth = 0;
    let skippedTooManyPhones = 0;
    let changed = 0;

    for (const email of emails) {
        const userDocument = users.get(email);
        const publicDocument = publicProfiles.get(email);
        const userData = userDocument ? userDocument.data() : {};
        const publicData = publicDocument ? publicDocument.data() : {};
        const uid = authUsers.get(email);
        if (!uid) {
            skippedWithoutAuth++;
            continue;
        }

        const privateRef = db.doc(`private_profiles/${uid}`);
        const privateSnapshot = await privateRef.get();
        const privateData = privateSnapshot.exists ? privateSnapshot.data() : {};
        const phones = uniqueStrings([
            userData.numero,
            userData.telephone,
            publicData.telephone,
            publicData.numero,
            ...(Array.isArray(privateData.legacyPhoneCandidates) ? privateData.legacyPhoneCandidates : [])
        ]);
        if (phones.length > 5) {
            skippedTooManyPhones++;
            continue;
        }

        const privateUpdate = {};
        if (!privateData.phoneE164 && phones.length === 1 && /^\+[1-9]\d{7,14}$/.test(phones[0])) {
            privateUpdate.phoneE164 = phones[0];
            privateUpdate.phoneStatus = "pending";
            privateUpdate.phoneLookupEnabled = false;
            privateUpdate.phoneUpdatedAt = FieldValue.serverTimestamp();
        } else if (!privateData.phoneE164 && phones.length) {
            privateUpdate.legacyPhoneCandidates = phones;
        }

        const sex = field(privateData, "sexe", field(userData, "sexe", publicData.sexe));
        if (sex) privateUpdate.sexe = sex;

        const oldLocation = userData.localisation && typeof userData.localisation === "object"
            ? userData.localisation
            : {};
        const locationCountry = field(privateData, "locationCountry", field(publicData, "pays", oldLocation.pays));
        const locationRegion = field(privateData, "locationRegion", field(publicData, "region", oldLocation.region));
        const locationCity = field(privateData, "locationCity", field(publicData, "ville", oldLocation.ville));
        const latitude = field(privateData, "latitude", field(publicData, "latitude", oldLocation.latitude));
        const longitude = field(privateData, "longitude", field(publicData, "longitude", oldLocation.longitude));
        if (locationCountry || locationRegion || locationCity || typeof latitude === "number" || typeof longitude === "number") {
            privateUpdate.locationCountry = locationCountry || "";
            privateUpdate.locationRegion = locationRegion || "";
            privateUpdate.locationCity = locationCity || "";
            if (typeof latitude === "number" && typeof longitude === "number") {
                privateUpdate.latitude = latitude;
                privateUpdate.longitude = longitude;
                const accuracy = field(privateData, "accuracyMeters", field(publicData, "accuracyMeters", oldLocation.accuracy));
                if (typeof accuracy === "number") privateUpdate.accuracyMeters = accuracy;
            }
            const oldSource = privateData.locationSource || publicData.locationSource;
            privateUpdate.locationSource = ["gps", "manual", "legacy"].includes(oldSource) ? oldSource : "legacy";
            privateUpdate.locationSharingEnabled = privateData.locationSharingEnabled === true;
            privateUpdate.locationUpdatedAt = privateData.locationUpdatedAt || FieldValue.serverTimestamp();
        }

        const batch = db.batch();
        let writes = 0;
        if (Object.keys(privateUpdate).length) {
            batch.set(privateRef, privateUpdate, { merge: true });
            writes++;
        }

        if (userDocument && ["numero", "telephone", "localisation", "latitude", "longitude", "ip", "sexe"]
            .some((key) => key in userData)) {
            batch.set(userDocument.ref, {
                numero: FieldValue.delete(),
                telephone: FieldValue.delete(),
                localisation: FieldValue.delete(),
                latitude: FieldValue.delete(),
                longitude: FieldValue.delete(),
                ip: FieldValue.delete(),
                sexe: FieldValue.delete()
            }, { merge: true });
            writes++;
        }

        if (publicDocument && ["telephone", "numero", "sexe", "latitude", "longitude", "localisation", "ip", "pays", "region", "ville", "locationSource"]
            .some((key) => key in publicData)) {
            batch.set(publicDocument.ref, {
                telephone: FieldValue.delete(),
                numero: FieldValue.delete(),
                sexe: FieldValue.delete(),
                latitude: FieldValue.delete(),
                longitude: FieldValue.delete(),
                localisation: FieldValue.delete(),
                ip: FieldValue.delete(),
                pays: FieldValue.delete(),
                region: FieldValue.delete(),
                ville: FieldValue.delete(),
                locationSource: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            writes++;
        }

        if (!writes) continue;
        migrated++;
        changed += writes;
        if (applyChanges) await batch.commit();
    }

    console.log(JSON.stringify({
        mode: applyChanges ? "applied" : "dry-run",
        matchedAccounts: emails.size,
        profilesMigrated: migrated,
        documentsChanged: changed,
        skippedWithoutAuth,
        skippedTooManyPhones
    }, null, 2));
    if (!applyChanges) console.log("No data was changed. Add --apply and the confirmation environment variable to migrate.");
}

main().catch((error) => {
    console.error("Private profile migration failed:", error);
    process.exitCode = 1;
});
