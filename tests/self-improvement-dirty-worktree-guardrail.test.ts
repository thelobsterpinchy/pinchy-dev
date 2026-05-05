import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("self-improvement prompt and skill protect unrelated dirty worktree files", () => {
  const prompt = readFileSync(".pi/prompts/self-improve.md", "utf8");
  const skill = readFileSync(".pi/skills/self-improvement-loop/SKILL.md", "utf8");

  assert.match(prompt, /Avoid edited files with unrelated dirty-worktree changes\./i);

  assert.match(skill, /If the worktree already has unrelated in-progress work, avoid editing those files/i);
  assert.match(skill, /will not clobber local work/i);
});
