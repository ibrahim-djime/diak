"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeUrl, stableId } = require("./feed-utils");

test("normalizeUrl removes tracking parameters and fragments", () => {
  assert.equal(
    normalizeUrl("https://example.com/story/?utm_source=feed&id=7#top"),
    "https://example.com/story?id=7"
  );
});

test("stableId is deterministic for canonical article URLs", () => {
  const first = stableId(normalizeUrl("https://example.com/story?utm_medium=rss"));
  const second = stableId(normalizeUrl("https://example.com/story"));
  assert.equal(first, second);
  assert.equal(first.length, 64);
});
