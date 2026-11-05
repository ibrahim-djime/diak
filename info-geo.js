// ============================================================
// Géolocalisation approximative dédiée à Information
// ============================================================
(function (global) {
  "use strict";

  const GEO_CACHE_KEY = "info_geo_cache_v1";
  const MANUAL_KEY = "info_geo_manual_v1";
  const CACHE_DURATION = 24 * 60 * 60 * 1000;
  const GEO_SERVICES = [
    "https://ipapi.co/json/",
    "https://ipinfo.io/json",
    "https://geolocation-db.com/json/"
  ];

  function readStored(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (error) {
      console.warn("Préférence de localisation Information illisible:", error.message);
      return null;
    }
  }

  function countryLabel(name, code) {
    if (name && name.length > 2) return name;
    if (code && typeof Intl.DisplayNames === "function") {
      try {
        return new Intl.DisplayNames(["fr"], { type: "region" }).of(code.toUpperCase()) || name || code;
      } catch (error) {
        console.warn("Nom du pays indisponible:", error.message);
      }
    }
    return name || code || "";
  }

  function sanitizeGeo(value) {
    if (!value || !value.country) return null;
    const countryCode = String(value.countryCode || "").trim().toUpperCase();
    return {
      country: countryLabel(String(value.country || ""), countryCode),
      countryCode: countryCode,
      region: String(value.region || "").trim(),
      city: String(value.city || "").trim(),
      source: value.source === "manual" ? "manual" : "ip",
      ts: Number(value.ts) || Date.now()
    };
  }

  function storeCache(data) {
    const clean = sanitizeGeo(data);
    if (!clean) return null;
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(clean));
      return clean;
    } catch (error) {
      console.warn("Cache de localisation indisponible:", error.message);
      return clean;
    }
  }

  function getCachedGeo() {
    const stored = readStored(GEO_CACHE_KEY);
    const cached = sanitizeGeo(stored);
    if (!cached) return null;
    if (stored.ip || !stored.countryCode) storeCache(cached);
    if (Date.now() - cached.ts >= CACHE_DURATION) return null;
    return cached;
  }

  async function fetchIPGeo() {
    for (const url of GEO_SERVICES) {
      const controller = new AbortController();
      const timeout = setTimeout(function () { controller.abort(); }, 5000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) continue;
        const data = await response.json();
        const countryCode = data.country_code || data.countryCode || (data.country && data.country.length === 2 ? data.country : "");
        const country = data.country_name || (data.country && data.country.length > 2 ? data.country : "") || countryLabel("", countryCode);
        if (country) {
          return {
            country: country,
            countryCode: countryCode,
            region: data.region || data.regionName || data.state || "",
            city: Array.isArray(data.loc) ? "" : (data.city || "").split(",")[0],
            source: "ip",
            ts: Date.now()
          };
        }
      } catch (error) {
        console.warn("Service de géolocalisation IP indisponible:", url, error.message);
      } finally {
        clearTimeout(timeout);
      }
    }
    return null;
  }

  function getManualGeo() {
    return sanitizeGeo(readStored(MANUAL_KEY));
  }

  function setManualGeo(value) {
    const country = String(value && value.country || "").trim();
    if (!country) throw new Error("Un pays est requis pour enregistrer la localisation manuelle.");
    const preference = {
      country: country,
      countryCode: String(value && value.countryCode || "").trim().toUpperCase(),
      region: String(value && value.region || "").trim(),
      city: String(value && value.city || "").trim(),
      source: "manual",
      ts: Date.now()
    };
    try {
      localStorage.setItem(MANUAL_KEY, JSON.stringify(preference));
    } catch (error) {
      console.warn("Préférence de localisation non enregistrée:", error.message);
    }
    return preference;
  }

  async function resolveGeo(useCache) {
    const manual = getManualGeo();
    if (manual) return manual;
    if (useCache !== false) {
      const cached = getCachedGeo();
      if (cached) return cached;
    }
    const approximate = await fetchIPGeo();
    return approximate ? (storeCache(approximate) || approximate) : null;
  }

  global.InfoGeo = {
    resolveGeo: resolveGeo,
    setManual: setManualGeo,
    getCached: getCachedGeo,
    clearCache: function () {
      localStorage.removeItem(GEO_CACHE_KEY);
      localStorage.removeItem(MANUAL_KEY);
    }
  };
})(window);
