"use strict";

const crypto = require("node:crypto");
const Parser = require("rss-parser");
const { initializeApp } = require("firebase-admin/app");
const { FieldPath, FieldValue, Timestamp, getFirestore } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { normalizeUrl, stableId } = require("./feed-utils");

const EXPECTED_PROJECT_ID = "lumina-analytics";
const PAGE_SIZE = 30;
const MIGRATION_BATCH_SIZE = 400;
const parser = new Parser({
  timeout: 20000,
  headers: { "User-Agent": "Lumesys-NewsCollector/1.0" },
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

initializeApp({ projectId: EXPECTED_PROJECT_ID });
const db = getFirestore();

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
    logger.warn("URL d'article ignorée", { source: source.name, message: error.message });
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

async function withCollectionLock(callback) {
  const lockRef = db.collection("info_scheduler_locks").doc("collector");
  const token = crypto.randomUUID();
  const acquired = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    const lockUntil = snapshot.exists ? snapshot.get("lockUntil") : null;
    if (lockUntil && lockUntil.toMillis() > Date.now()) return false;
    transaction.set(lockRef, {
      token,
      lockUntil: Timestamp.fromMillis(Date.now() + 7 * 60 * 1000),
      updatedAt: FieldValue.serverTimestamp()
    });
    return true;
  });

  if (!acquired) {
    logger.info("Collecte ignorée : une autre exécution détient le verrou.");
    return;
  }

  try {
    await callback();
  } finally {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(lockRef);
      if (snapshot.exists && snapshot.get("token") === token) {
        transaction.delete(lockRef);
      }
    });
  }
}

async function migratePromotionFields(stateRef) {
  const state = await stateRef.get();
  if (Number(state.get("promotionSchemaVersion")) >= 1) return;

  const articles = db.collection("info_articles");
  let cursor = null;
  while (true) {
    let pageQuery = articles.orderBy(FieldPath.documentId()).limit(MIGRATION_BATCH_SIZE);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    if (page.empty) break;

    let batch = db.batch();
    let writes = 0;
    page.docs.forEach((snapshot) => {
      const data = snapshot.data();
      const updates = {};
      if (!Number.isFinite(data.promotionCount)) updates.promotionCount = 0;
      if (!("lastPromotedAt" in data)) updates.lastPromotedAt = null;
      if (!("lastPromotedCycle" in data)) updates.lastPromotedCycle = null;
      if (!("featuredAt" in data)) updates.featuredAt = null;
      if (!("featuredCycleId" in data)) updates.featuredCycleId = null;
      if (Object.keys(updates).length) {
        batch.set(snapshot.ref, updates, { merge: true });
        writes += 1;
      }
    });
    if (writes) await batch.commit();
    cursor = page.docs[page.docs.length - 1];
    if (page.size < MIGRATION_BATCH_SIZE) break;
  }

  await stateRef.set({
    promotionSchemaVersion: 1,
    promotionSchemaUpdatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
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

  const refs = articles.map((article) => db.collection("info_articles").doc(article.id));
  const snapshots = await db.getAll(...refs);
  const batch = db.batch();
  snapshots.forEach((snapshot, index) => {
    const article = articles[index];
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

async function writeAggregateStats(cycleId, storedCount, featuredCount, sourceCount) {
  const total = await db.collection("info_articles").count().get();
  const articleStats = db.collection("info_article_stats").doc("global");
  await articleStats.set({
    articlesTotal: total.data().count,
    collectedInCycle: storedCount,
    featuredInCycle: featuredCount,
    activeSources: sourceCount,
    feedCycleId: cycleId,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  const topicCounts = new Map();
  const featuredSnapshot = await db.collection("info_articles")
    .where("featuredCycleId", "==", cycleId)
    .get();
  for (const snapshot of featuredSnapshot.docs) {
    const topics = Array.isArray(snapshot.get("topics")) ? snapshot.get("topics") : [];
    const category = String(snapshot.get("category") || "Autres");
    const values = new Set([category, ...topics.map(String)]);
    values.forEach((topic) => topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1));
  }

  const topicStats = db.collection("info_topic_stats");
  const existingTopics = await topicStats.get();
  const topicUpdates = new Map();
  existingTopics.docs.forEach((snapshot) => {
    topicUpdates.set(snapshot.id, {
      ref: snapshot.ref,
      data: {
        featuredCount: 0,
        feedCycleId: cycleId,
        updatedAt: FieldValue.serverTimestamp()
      }
    });
  });
  topicCounts.forEach((count, topic) => {
    const id = stableId(topic.toLocaleLowerCase()).slice(0, 40);
    topicUpdates.set(id, {
      ref: topicStats.doc(id),
      data: {
        topic,
        featuredCount: count,
        feedCycleId: cycleId,
        updatedAt: FieldValue.serverTimestamp()
      }
    });
  });
  const updates = Array.from(topicUpdates.values());
  for (let offset = 0; offset < updates.length; offset += 450) {
    const batch = db.batch();
    updates.slice(offset, offset + 450).forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true });
    });
    await batch.commit();
  }
}

async function collectAndPublish() {
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== EXPECTED_PROJECT_ID) {
    throw new Error(`Projet Firebase inattendu: ${process.env.GCLOUD_PROJECT}`);
  }

  await withCollectionLock(async () => {
    const stateRef = db.collection("info_feed_state").doc("current");
    await migratePromotionFields(stateRef);

    const results = await Promise.allSettled(SOURCES.map(collectSource));
    const failures = results.filter((result) => result.status === "rejected");
    failures.forEach((result) => {
      const source = SOURCES[results.indexOf(result)];
      logger.error("Collecte RSS impossible", {
        source: source.name,
        message: result.reason && result.reason.message
      });
    });
    if (failures.length === SOURCES.length) {
      throw new Error("Aucune source RSS n'a pu être collectée.");
    }

    const incoming = results
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value);

    const sourceResults = new Map(SOURCES.map((source, index) => [source.name, results[index]]));
    const sourceCount = SOURCES.length - failures.length;
    await upsertSources(sourceResults);
    const storedCount = await upsertArticles(incoming);
    const cycleId = `${Date.now()}-${crypto.randomUUID()}`;
    const featuredArticleIds = await selectAndPromote(cycleId);

    await stateRef.set({
      feedCycleId: cycleId,
      featuredArticleIds,
      featuredCount: featuredArticleIds.length,
      sourceCount,
      collectedArticleCount: storedCount,
      publishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await writeAggregateStats(cycleId, storedCount, featuredArticleIds.length, sourceCount);

    logger.info("Cycle Information terminé", {
      projectId: EXPECTED_PROJECT_ID,
      feedCycleId: cycleId,
      collectedArticleCount: storedCount,
      featuredCount: featuredArticleIds.length,
      sourceFailures: failures.length
    });
  });
}

exports.collectInformation = onSchedule({
  schedule: "every 8 minutes",
  timeZone: "UTC",
  region: "us-central1",
  timeoutSeconds: 540,
  memory: "512MiB",
  maxInstances: 1
}, collectAndPublish);
