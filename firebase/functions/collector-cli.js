"use strict";

/**
 * LUMESYS — Collecteur RSS Automatique (GitHub Actions)
 * Planifié à :15 et :45 de chaque heure UTC (en alternance avec Cloudflare Workers).
 */

const crypto = require("node:crypto");
const Parser = require("rss-parser");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { FieldPath, FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { normalizeUrl, stableId } = require("./feed-utils");

const EXPECTED_PROJECT_ID = "lumina-analytics";
const PAGE_SIZE = 30;
const COLLECTOR_NAME = "GitHub Actions";
const COLLECTOR_SOURCE = "github-actions";

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Lumesys-NewsCollector-GitHubActions/1.0" },
  customFields: {
    item: [["media:content", "mediaContent", { keepArray: false }]]
  }
});

const SOURCES = [
  { name: "Africanews", url: "https://www.africanews.com/feed/", category: "Afrique", language: "fr" },
  { name: "BBC Afrique", url: "https://feeds.bbci.co.uk/afrique/rss.xml", category: "Afrique", language: "fr" },
  { name: "DW Afrique", url: "https://rss.dw.com/feeds/rss-afrique/all", category: "Afrique", language: "fr" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/rss", category: "Monde", language: "en" },
  { name: "Jeune Afrique", url: "https://www.jeuneafrique.com/feed/", category: "Afrique", language: "fr" },
  { name: "The Africa Report", url: "https://www.theafricareport.com/feed/", category: "Afrique", language: "en" },
  { name: "Reuters", url: "https://feeds.reuters.com/Reuters/worldNews", category: "Monde", language: "en" },
  { name: "AP News", url: "https://feeds.apnews.com/feeds/news/topstories", category: "Monde", language: "en" },
  { name: "AFP", url: "https://www.afp.com/fr/rss", category: "Monde", language: "fr" }
];

function initFirebase() {
  if (getApps().length > 0) return getFirestore();

  let credential = null;
  const rawSecret = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT;
  if (rawSecret) {
    try {
      const decoded = rawSecret.trim().startsWith("{")
        ? rawSecret
        : Buffer.from(rawSecret, "base64").toString("utf-8");
      const serviceAccount = JSON.parse(decoded);
      credential = cert(serviceAccount);
      console.log("✓ Authentification Firebase Admin via FIREBASE_SERVICE_ACCOUNT");
    } catch (err) {
      console.warn("⚠️ Impossible de décoder le secret de compte de service:", err.message);
    }
  }

  initializeApp(credential ? { credential, projectId: EXPECTED_PROJECT_ID } : { projectId: EXPECTED_PROJECT_ID });
  return getFirestore();
}

const db = initFirebase();

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function dateValue(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function sourceId(source) {
  return stableId(normalizeUrl(source.url)).slice(0, 40);
}

function articleFromItem(source, item) {
  const originalUrl = item.link || item.guid;
  if (!item.title || !originalUrl) return null;

  let normalizedUrl;
  try {
    normalizedUrl = normalizeUrl(originalUrl);
  } catch (error) {
    return null;
  }

  const description = cleanText(item.contentSnippet || item.content || item.description, 5000);
  const enclosureUrl = item.enclosure && item.enclosure.url;
  const mediaUrl = item.mediaContent && (item.mediaContent.$ && item.mediaContent.$.url);

  return {
    id: stableId(normalizedUrl),
    title: cleanText(item.title, 220),
    description,
    content: description,
    image: String(enclosureUrl || mediaUrl || ""),
    sourceId: sourceId(source),
    sourceName: source.name,
    sourceUrl: source.url,
    originalUrl: normalizedUrl,
    link: normalizedUrl,
    sourceArticleId: cleanText(item.guid || item.id || normalizedUrl, 500),
    category: source.category,
    region: "",
    city: "",
    language: source.language,
    topics: Array.isArray(item.categories) ? item.categories.map((topic) => cleanText(topic, 100)) : [],
    verificationStatus: "pending",
    isActive: true,
    promotionCount: 0,
    lastPromotedAt: null,
    lastPromotedCycle: null,
    featuredAt: null,
    featuredCycleId: null,
    featuredRank: null,
    publishedAt: Timestamp.fromDate(dateValue(item.isoDate || item.pubDate)),
    collectedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
}

async function collectSource(source) {
  const feed = await parser.parseURL(source.url);
  return (feed.items || [])
    .slice(0, 50)
    .map((item) => articleFromItem(source, item))
    .filter(Boolean);
}

/**
 * Verrou atomique d'exécution dans Firestore avec expiration de 6 minutes.
 * Empêche tout chevauchement avec Cloudflare Workers ou un run concurrent.
 */
async function withCollectionLock(callback) {
  const lockRef = db.collection("info_scheduler_locks").doc("collector");
  const token = `github-${crypto.randomUUID()}`;
  const now = Date.now();

  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    const lockUntil = snapshot.exists ? snapshot.get("lockUntil") : null;
    if (lockUntil && lockUntil.toMillis() > now) {
      return false;
    }
    transaction.set(lockRef, {
      token,
      lockedBy: COLLECTOR_SOURCE,
      collectorName: COLLECTOR_NAME,
      lockUntil: Timestamp.fromMillis(now + 6 * 60 * 1000), // expire après 6 min
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    return true;
  });

  if (!acquired) {
    console.log("ℹ️ Collecte différée : une autre exécution détient le verrou actif.");
    return { skipped: true, reason: "lock_held" };
  }

  try {
    return await callback();
  } finally {
    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(lockRef);
        if (snapshot.exists && snapshot.get("token") === token) {
          transaction.delete(lockRef);
        }
      });
    } catch (releaseErr) {
      console.warn("Avertissement libération verrou:", releaseErr.message);
    }
  }
}

async function upsertSources(sourceResults) {
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();

  for (const source of SOURCES) {
    const result = sourceResults.get(source.name);
    const ref = db.collection("info_sources").doc(sourceId(source));
    const snapshot = await ref.get();
    batch.set(ref, {
      id: ref.id,
      name: source.name,
      url: source.url,
      category: source.category,
      language: source.language,
      isActive: true,
      ...(snapshot.exists ? {} : { createdAt: now }),
      lastFetchStatus: result && result.status === "fulfilled" ? "ok" : "error",
      lastFetchedAt: now,
      lastCollector: COLLECTOR_NAME,
      updatedAt: now
    }, { merge: true });
  }

  await batch.commit();
}

async function upsertArticles(incoming) {
  const unique = new Map();
  incoming.forEach((article) => unique.set(article.id, article));
  const articles = Array.from(unique.values());
  if (!articles.length) return 0;

  // Traiter par blocs de 400 documents max par batch Firestore
  for (let offset = 0; offset < articles.length; offset += 400) {
    const chunk = articles.slice(offset, offset + 400);
    const refs = chunk.map((article) => db.collection("info_articles").doc(article.id));
    const snapshots = await db.getAll(...refs);
    const batch = db.batch();

    snapshots.forEach((snapshot, index) => {
      const article = chunk[index];
      const existing = snapshot.exists ? snapshot.data() : {};
      batch.set(snapshot.ref, {
        ...article,
        promotionCount: Number.isFinite(existing.promotionCount) ? existing.promotionCount : 0,
        lastPromotedAt: existing.lastPromotedAt || null,
        lastPromotedCycle: existing.lastPromotedCycle || null,
        featuredAt: existing.featuredAt || null,
        featuredCycleId: existing.featuredCycleId || null,
        ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() })
      }, { merge: true });
    });

    await batch.commit();
  }

  return articles.length;
}

async function selectAndPromote(cycleId) {
  const candidates = await db.collection("info_articles")
    .orderBy("lastPromotedAt", "asc")
    .orderBy("publishedAt", "desc")
    .limit(PAGE_SIZE)
    .get();

  const now = Timestamp.now();
  const batch = db.batch();
  const featuredArticleIds = candidates.docs.map((snapshot, index) => {
    batch.set(snapshot.ref, {
      lastPromotedAt: now,
      lastPromotedCycle: cycleId,
      promotionCount: 1,
      featuredAt: now,
      featuredCycleId: cycleId,
      featuredRank: index,
      updatedAt: now
    }, { merge: true });
    return snapshot.id;
  });

  if (!candidates.empty) await batch.commit();
  return featuredArticleIds;
}

async function runCollector() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Démarrage de la collecte RSS via ${COLLECTOR_NAME}...`);

  const outcome = await withCollectionLock(async () => {
    const results = await Promise.allSettled(SOURCES.map(collectSource));
    const failures = results.filter((r) => r.status === "rejected");
    failures.forEach((r, idx) => {
      console.warn(`⚠️ Source en échec : ${SOURCES[idx].name} -> ${r.reason?.message || r.reason}`);
    });

    if (failures.length === SOURCES.length) {
      throw new Error("Toutes les sources RSS ont échoué.");
    }

    const incoming = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value);

    const sourceResults = new Map(SOURCES.map((source, index) => [source.name, results[index]]));
    const sourceCount = SOURCES.length - failures.length;

    await upsertSources(sourceResults);
    const storedCount = await upsertArticles(incoming);

    const cycleId = `${Date.now()}-github-${crypto.randomUUID().slice(0, 8)}`;
    const featuredArticleIds = await selectAndPromote(cycleId);

    const stateRef = db.collection("info_feed_state").doc("current");
    await stateRef.set({
      feedCycleId: cycleId,
      featuredArticleIds,
      featuredCount: featuredArticleIds.length,
      sourceCount,
      collectedArticleCount: storedCount,
      lastCollector: COLLECTOR_NAME,
      collectorSource: COLLECTOR_SOURCE,
      nextExpectedCollector: "Cloudflare Workers",
      nextExpectedMinutes: ":00 et :30 UTC",
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return {
      success: true,
      cycleId,
      storedCount,
      featuredCount: featuredArticleIds.length,
      sourceCount
    };
  });

  const durationMs = Date.now() - startTime;
  console.log(`✓ Collecte ${COLLECTOR_NAME} terminée en ${durationMs} ms (résultat : ${JSON.stringify(outcome)})`);
  return outcome;
}

if (require.main === module) {
  runCollector()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`❌ Erreur fatale collecteur ${COLLECTOR_NAME}:`, err);
      process.exit(1);
    });
}

module.exports = { runCollector };
