import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("AGENTS self-improvement rules tell autonomous cycles to avoid unrelated dirty-worktree edits", () => {
  const agents = readFileSync("AGENTS.md", "utf8");

  assert.match(agents, /dirty-worktree|avoid editing files with unrelated local changes/i);
  assert.match(agents, /docs, tests, guardrails, and workflows/i);
});
