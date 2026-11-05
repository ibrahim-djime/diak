// ============================================================
// ANALYSE DE LA SECTION INFORMATION
// ============================================================
(function (global) {
  "use strict";

  const SESSION_KEY = "info_analytics_session_v1";
  const AGG_KEY = "info_local_agg_v1";
  const DEDUPE_KEY = "info_analytics_seen_v1";
  const MAX_REGIONS = 30;
  const pendingEvents = [];

  try {
    localStorage.removeItem("info_events_fallback");
    localStorage.removeItem("info_session_id");
    localStorage.removeItem("info_local_agg");
  } catch (error) {
    console.warn("Nettoyage des anciennes données Information impossible:", error.message);
  }

  function sessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = global.crypto && typeof global.crypto.randomUUID === "function"
        ? global.crypto.randomUUID()
        : "s-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function locationKey(details) {
    return [details.country, details.region].filter(Boolean).join(":") || "global";
  }

  function increment(target, key) {
    if (!key) return;
    target[key] = Math.min(10000, (target[key] || 0) + 1);
  }

  function updateLocalAgg(action, details) {
    try {
      const aggregate = JSON.parse(localStorage.getItem(AGG_KEY) || "{}");
      const region = locationKey(details);
      const targets = region === "global" ? [region] : [region, "global"];
      targets.forEach(function (name) {
        if (!aggregate[name]) aggregate[name] = { categories: {}, sources: {}, events: {} };
        const row = aggregate[name];
        if (!row.categories) row.categories = {};
        if (!row.sources) row.sources = {};
        if (!row.events) row.events = {};
        increment(row.events, action);
        if (action === "article_open" || action === "article_view" || action === "favorite_add") {
          increment(row.categories, details.category);
          increment(row.sources, details.source);
        }
      });
      const regions = Object.keys(aggregate).filter(function (key) { return key !== "global"; });
      regions.slice(0, Math.max(0, regions.length - MAX_REGIONS)).forEach(function (key) {
        delete aggregate[key];
      });
      localStorage.setItem(AGG_KEY, JSON.stringify(aggregate));
    } catch (error) {
      console.warn("Statistiques locales Information indisponibles:", error.message);
    }
  }

  function cleanParameters(details) {
    const allowed = {
      articleId: "article_id",
      category: "category",
      source: "source",
      region: "region",
      country: "country",
      count: "article_count",
      durationSeconds: "duration_seconds",
      queryLength: "query_length",
      selectedTopicCount: "selected_topic_count",
      depth: "scroll_depth",
      articleShared: "article_shared",
      sharePlatform: "share_platform",
      shareCount: "share_count",
      shareTimestamp: "share_timestamp"
    };
    const output = {};
    Object.keys(allowed).forEach(function (key) {
      const value = details[key];
      if (typeof value === "string" && value.trim()) {
        output[allowed[key]] = value.trim().slice(0, 100);
      } else if (typeof value === "number" && Number.isFinite(value)) {
        output[allowed[key]] = Math.max(0, Math.min(10000, Math.round(value)));
      }
    });
    return output;
  }

  function flushPendingEvents() {
    if (typeof global.InfoFirebaseAnalytics !== "function") return;
    while (pendingEvents.length) {
      const event = pendingEvents.shift();
      try {
        global.InfoFirebaseAnalytics(event.action, event.parameters);
      } catch (error) {
        console.warn("Envoi d'un événement Information impossible:", error.message);
      }
    }
  }

  function logEvent(action, details) {
    const data = details || {};
    try {
      const seen = JSON.parse(sessionStorage.getItem(DEDUPE_KEY) || "[]");
      const identity = data.articleId
        ? [action, data.articleId, data.sharePlatform || ""].join(":")
        : action;
      if (seen.includes(identity)) return;
      seen.push(identity);
      sessionStorage.setItem(DEDUPE_KEY, JSON.stringify(seen.slice(-200)));

      const parameters = cleanParameters(data);
      parameters.anonymous_session_id = sessionId();
      parameters.session_articles = seen.filter(function (entry) {
        return entry.indexOf("article_view:") === 0;
      }).length;
      if (typeof global.InfoFirebaseAnalytics === "function") {
        try {
          global.InfoFirebaseAnalytics(action, parameters);
        } catch (error) {
          console.warn("Envoi d'un événement Information impossible:", error.message);
        }
      } else if (pendingEvents.length < 50) {
        pendingEvents.push({ action: action, parameters: parameters });
      }
      updateLocalAgg(action, data);
    } catch (error) {
      console.warn("Envoi de la statistique Information impossible:", error.message);
    }
  }

  global.addEventListener("info:firebase-ready", flushPendingEvents);
  global.InfoAnalytics = {
    logEvent: logEvent,
    updateLocalAgg: updateLocalAgg
  };
})(window);
