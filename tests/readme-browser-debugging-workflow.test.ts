import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("README includes a compact browser-debugging readiness workflow", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /Suggested browser-debugging workflow/i);
  assert.match(readme, /run `pinchy doctor`/i);
  assert.match(readme, /run `browser_debug_scan` first/i);
  assert.match(readme, /`browser_dom_snapshot`/i);
  assert.match(readme, /`browser_execute_steps`/i);
  assert.match(readme, /`browser_compare_artifacts`/i);
});
