import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db } from "./client/firebase-init.js";

const PAGE_SIZE = 30;
const ARCHIVE_BATCH_SIZE = PAGE_SIZE + 1;
const FEED_STATE_PATH = ["info_feed_state", "current"];
let archiveCursor = null;
let archiveEnded = false;
let currentFeedCycleId = null;

async function readFirestore(operation, read) {
  try {
    return await read();
  } catch (error) {
    const code = error && error.code ? ` (${error.code})` : "";
    const detail = error && error.message ? error.message : String(error);
    const wrapped = new Error(`${operation} failed${code}: ${detail}`);
    wrapped.name = "InfoFirestoreReadError";
    console.error(`[InfoFirestore] ${operation} failed`, error);
    throw wrapped;
  }
}

function getSignedInUser() {
  const user = auth.currentUser;
  return user && !user.isAnonymous ? user : null;
}

function toArticle(id, data) {
  const title = String(data.title || "").trim();
  const originalUrl = String(data.originalUrl || data.link || "").trim();
  if (!title || !originalUrl) return null;

  const publishedAt = data.publishedAt && typeof data.publishedAt.toDate === "function"
    ? data.publishedAt.toDate()
    : new Date(data.publishedAt || data.pubDate || 0);

  return {
    id,
    title,
    source: String(data.sourceName || data.source || "Actualité"),
    sourceName: String(data.sourceName || data.source || "Actualité"),
    category: String(data.category || "Monde"),
    description: String(data.description || data.content || ""),
    publishedAt: Number.isNaN(publishedAt.getTime()) ? "" : publishedAt.toISOString(),
    pubDate: Number.isNaN(publishedAt.getTime()) ? "" : publishedAt.toISOString(),
    date: Number.isNaN(publishedAt.getTime())
      ? ""
      : publishedAt.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }),
    image: String(data.image || ""),
    alt: title,
    originalUrl,
    link: String(data.link || data.originalUrl || ""),
    isStoredArticle: true
  };
}

function articleKey(article) {
  const rawUrl = String(article.originalUrl || "").trim();
  if (!rawUrl) return String(article.id);

  try {
    const url = new URL(rawUrl);
    url.hash = "";
    Array.from(url.searchParams.keys()).forEach((key) => {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    });
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href.toLowerCase();
  } catch (error) {
    return rawUrl.toLowerCase();
  }
}

async function getFeedState() {
  const snapshot = await readFirestore(
    "getDoc(info_feed_state/current)",
    () => getDoc(doc(db, ...FEED_STATE_PATH))
  );
  if (!snapshot.exists()) {
    console.warn(
      "[InfoFirestore] info_feed_state/current is missing; loading info_articles directly."
    );
    return null;
  }
  return snapshot.data();
}

async function getFeaturedArticles(articleIds) {
  const snapshots = await Promise.all(
    (Array.isArray(articleIds) ? articleIds : []).map((id) =>
      readFirestore(
        `getDoc(info_articles/${String(id)})`,
        () => getDoc(doc(db, "info_articles", String(id)))
      )
    )
  );
  const seen = new Set();
  return snapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => toArticle(snapshot.id, snapshot.data()))
    .filter(Boolean)
    .filter((article) => {
      const key = articleKey(article);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function beginFeedSession() {
  archiveCursor = null;
  archiveEnded = false;

  const state = await getFeedState();
  currentFeedCycleId = String(state && state.feedCycleId || "");
  const articles = await getFeaturedArticles(state && state.featuredArticleIds);
  const displayedIds = new Set(articles.map((article) => article.id));
  const displayedKeys = new Set(articles.map(articleKey));
  if (articles.length < PAGE_SIZE) {
    articles.push(...await loadArchiveArticles(
      displayedIds,
      displayedKeys,
      PAGE_SIZE - articles.length
    ));
  }

  return {
    feedCycleId: currentFeedCycleId,
    articles,
    state,
    hasMore: !archiveEnded
  };
}

async function loadArchiveArticles(displayedIds, displayedKeys, requestedCount) {
  const nextArticles = [];
  while (nextArticles.length < requestedCount && !archiveEnded) {
    const articlesQuery = archiveCursor
      ? query(
        collection(db, "info_articles"),
        orderBy("publishedAt", "desc"),
        startAfter(archiveCursor),
        limit(ARCHIVE_BATCH_SIZE)
      )
      : query(
        collection(db, "info_articles"),
        orderBy("publishedAt", "desc"),
        limit(ARCHIVE_BATCH_SIZE)
      );
    const snapshot = await readFirestore(
      "getDocs(info_articles ordered by publishedAt desc)",
      () => getDocs(articlesQuery)
    );

    if (snapshot.empty) {
      archiveEnded = true;
      break;
    }

    let processedCount = 0;
    for (const articleSnapshot of snapshot.docs) {
      archiveCursor = articleSnapshot;
      processedCount += 1;
      if (displayedIds.has(articleSnapshot.id)) continue;
      const article = toArticle(articleSnapshot.id, articleSnapshot.data());
      if (!article) continue;
      const key = articleKey(article);
      if (displayedKeys.has(key)) continue;
      displayedIds.add(articleSnapshot.id);
      displayedKeys.add(key);
      nextArticles.push(article);
      if (nextArticles.length >= requestedCount) break;
    }

    if (processedCount === snapshot.size && snapshot.size < ARCHIVE_BATCH_SIZE) {
      archiveEnded = true;
    }
  }

  return nextArticles;
}

async function loadMoreInfoArticles(displayedArticles = []) {
  const state = await getFeedState();
  currentFeedCycleId = String(state && state.feedCycleId || "");

  const displayedIds = new Set(displayedArticles.map((article) =>
    typeof article === "string" ? article : String(article.id || "")
  ));
  const displayedKeys = new Set(displayedArticles.map((article) =>
    typeof article === "string" ? article : articleKey(article)
  ));
  const currentFeatured = await getFeaturedArticles(state && state.featuredArticleIds);
  const newFeatured = [];
  currentFeatured.forEach((article) => {
    const key = articleKey(article);
    if (displayedIds.has(article.id) || displayedKeys.has(key)) return;
    displayedIds.add(article.id);
    displayedKeys.add(key);
    newFeatured.push(article);
  });
  const archiveArticles = await loadArchiveArticles(
    displayedIds,
    displayedKeys,
    Math.max(0, PAGE_SIZE - newFeatured.length)
  );
  const articles = [...newFeatured, ...archiveArticles];

  return {
    feedCycleId: currentFeedCycleId,
    articles,
    state,
    hasMore: !archiveEnded
  };
}

async function saveVisitorProfile(profileId, profile) {
  const user = getSignedInUser();
  if (!user || user.uid !== profileId) {
    throw new Error("Un utilisateur authentifié propriétaire du profil est requis.");
  }

  await setDoc(doc(db, "info_visitor_profiles", profileId), {
    ...profile,
    visitorId: user.uid,
    profileUpdatedAt: serverTimestamp()
  }, { merge: true });
}

async function saveVisitorSession(sessionId, payload) {
  const user = getSignedInUser();
  if (!user || !sessionId || !payload) {
    throw new Error("Un utilisateur authentifié et une session valide sont requis.");
  }

  await setDoc(doc(db, "info_visitor_sessions", sessionId), {
    ...payload,
    sessionId,
    visitorId: user.uid,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function logVisitorEvent(eventId, payload) {
  const user = getSignedInUser();
  if (!user || !eventId || !payload) {
    throw new Error("Un utilisateur authentifié et un événement valide sont requis.");
  }

  await setDoc(doc(db, "info_visitor_events", eventId), {
    ...payload,
    eventId,
    visitorId: user.uid,
    createdAt: serverTimestamp()
  });
}

async function InfoFirebaseAnalytics(action, parameters) {
  const user = getSignedInUser();
  if (!user) return null;

  const eventId = user.uid + "_" + Date.now().toString(36) + "_" +
    Math.random().toString(36).slice(2, 8);
  try {
    await logVisitorEvent(eventId, {
      action: String(action || "").trim(),
      parameters: parameters && typeof parameters === "object" ? parameters : {},
      anonymousSessionId: parameters && parameters.anonymous_session_id
        ? parameters.anonymous_session_id
        : null,
      clientCreatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn("Envoi analytique Information impossible:", error.message || error);
  }
  return null;
}

window.InfoFirestore = {
  beginFeedSession,
  loadMoreInfoArticles,
  getFeedState,
  saveVisitorProfile,
  saveVisitorSession,
  logVisitorEvent,
  currentVisitorId: () => {
    const user = getSignedInUser();
    return user ? user.uid : null;
  },
  InfoFirebaseAnalytics
};

window.InfoFirebaseAnalytics = InfoFirebaseAnalytics;
window.InfoFirestoreReady = true;
window.dispatchEvent(new Event("info:firebase-ready"));
