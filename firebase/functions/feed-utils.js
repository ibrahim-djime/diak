"use strict";

const crypto = require("node:crypto");

function stableId(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeUrl(value) {
  const parsed = new URL(String(value));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL d'article non prise en charge.");
  }
  parsed.hash = "";
  Array.from(parsed.searchParams.keys()).forEach((key) => {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
      parsed.searchParams.delete(key);
    }
  });
  parsed.searchParams.sort();
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

module.exports = { normalizeUrl, stableId };
