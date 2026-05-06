import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("self-improve prompt reinforces bounded maintenance guardrails", () => {
  const prompt = readFileSync(".pi/prompts/self-improve.md", "utf8");

  assert.match(prompt, /Stay within this repository\./i);
  assert.match(prompt, /Prefer docs, prompts, tests, guardrails, and small refactors\./i);
  assert.match(prompt, /Avoid edited files with unrelated dirty-worktree changes\./i);
  assert.match(prompt, /Validate any changes when practical\./i);
  assert.match(prompt, /When changing behavior, prefer a test-first or regression-test-first workflow\./i);
  assert.match(prompt, /If no safe improvement is warranted, explain why and stop\./i);
});
