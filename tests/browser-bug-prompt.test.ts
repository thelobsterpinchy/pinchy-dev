import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("browser-bug prompt reinforces readiness checks and evidence preservation", () => {
  const prompt = readFileSync(".pi/prompts/browser-bug.md", "utf8");

  assert.match(prompt, /evidence-first workflow/i);
  assert.match(prompt, /Use `pinchy doctor` when browser tooling readiness is in doubt/i);
  assert.match(prompt, /browser_debug_scan/i);
  assert.match(prompt, /browser_dom_snapshot/i);
  assert.match(prompt, /browser_run_probe/i);
  assert.match(prompt, /browser_execute_steps/i);
  assert.match(prompt, /browser_compare_artifacts/i);
  assert.match(prompt, /before\/after evidence/i);
  assert.match(prompt, /regression test first/i);
});
