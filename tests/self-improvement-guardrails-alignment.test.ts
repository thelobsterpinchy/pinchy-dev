import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("self-improvement guidance stays aligned across AGENTS, prompt, and skill", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  const prompt = readFileSync(".pi/prompts/self-improve.md", "utf8");
  const skill = readFileSync(".pi/skills/self-improvement-loop/SKILL.md", "utf8");

  assert.match(agents, /stay within this repository by default/i);
  assert.match(agents, /start with docs, tests, guardrails, and workflows/i);
  assert.match(agents, /do not silently weaken safety/i);

  assert.match(prompt, /Stay within this repository\./i);
  assert.match(prompt, /Prefer docs, prompts, tests, guardrails, and small refactors\./i);
  assert.match(prompt, /Avoid edited files with unrelated dirty-worktree changes\./i);
  assert.match(prompt, /Do not weaken safety\./i);
  assert.match(prompt, /If no safe improvement is warranted, explain why and stop\./i);

  assert.match(skill, /documentation/i);
  assert.match(skill, /tests and validation/i);
  assert.match(skill, /small safe refactors/i);
  assert.match(skill, /avoid editing those files|will not clobber local work/i);
  assert.match(skill, /If no safe improvement is justified, stop and explain why\./i);
});
