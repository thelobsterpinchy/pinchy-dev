import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("self-improvement-loop skill stays bounded, prefers guardrails, and avoids clobbering unrelated in-progress work", () => {
  const skill = readFileSync(".pi/skills/self-improvement-loop/SKILL.md", "utf8");

  assert.match(skill, /Prefer tests\/docs\/guardrails before deeper behavior changes/i);
  assert.match(skill, /repo state/i);
  assert.match(skill, /one small, high-leverage improvement/i);
  assert.match(skill, /unrelated in-progress work|dirty worktree|existing local changes/i);
  assert.match(skill, /If no safe improvement is justified, stop and explain why/i);
});
