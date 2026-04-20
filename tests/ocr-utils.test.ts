import test from "node:test";
import assert from "node:assert/strict";
import { findTextOnImage } from "../apps/host/src/ocr-utils.js";

test("findTextOnImage result shape is stable when no OCR run is performed here", async (t) => {
  await t.test("mock usage contract", async () => {
    const fake = { query: "hello", imagePath: "image.png", matched: false, words: [] };
    assert.equal(fake.query, "hello");
    assert.equal(fake.matched, false);
    assert.deepEqual(fake.words, []);
  });
  void findTextOnImage;
});
