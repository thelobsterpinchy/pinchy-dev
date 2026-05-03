import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function assertMentions(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

test("README and OPERATIONS stay aligned on browser-debugging readiness workflow", () => {
  const readme = readFileSync("README.md", "utf8");
  const operations = readFileSync("docs/OPERATIONS.md", "utf8");
  const architecture = readFileSync("docs/ARCHITECTURE.md", "utf8");
  const localRuntime = readFileSync("docs/LOCAL_RUNTIME.md", "utf8");

  const browserToolPatterns = [
    /`browser_debug_scan`/i,
    /`browser_dom_snapshot`/i,
    /`browser_run_probe`/i,
    /`browser_execute_steps`/i,
    /`browser_compare_artifacts`/i,
  ];

  assertMentions(readme, browserToolPatterns);
  assertMentions(operations, browserToolPatterns);

  assert.match(operations, /run `browser_debug_scan` first/i);
  assert.match(operations, /saved HTML and visible-text evidence/i);
  assert.match(operations, /bounded multi-step reproduction flows/i);
  assert.match(operations, /compare before\/after screenshots or DOM snapshots/i);
  assert.match(operations, /evidence-first/i);

  assert.match(localRuntime, /browser-debugging tools use Playwright/i);
  assert.match(localRuntime, /npm run playwright:install/i);
  assert.match(architecture, /bounded step execution/i);
  assert.match(architecture, /artifact comparison/i);
});
