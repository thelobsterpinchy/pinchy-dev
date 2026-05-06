import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("architecture docs describe current screen targeting capabilities", () => {
  const architecture = readFileSync("docs/ARCHITECTURE.md", "utf8");

  assert.match(architecture, /OCR-based .*targeting/i);
  assert.match(architecture, /visible text/i);
  assert.match(architecture, /exact PNG template matching/i);
  assert.doesNotMatch(architecture, /add OCR-based targeting/i);
});
