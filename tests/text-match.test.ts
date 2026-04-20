import test from "node:test";
import assert from "node:assert/strict";
import { fuzzyIncludes, normalizeForFuzzyMatch } from "../apps/host/src/text-match.js";

test("normalizeForFuzzyMatch strips punctuation and case", () => {
  assert.equal(normalizeForFuzzyMatch("Sign In!"), "signin");
});

test("fuzzyIncludes tolerates a small OCR miss", () => {
  assert.equal(fuzzyIncludes("sett1ngs", "settings"), true);
  assert.equal(fuzzyIncludes("dashboard", "profile"), false);
});
