import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("self-improvement loop skill requires delegated implementation and test-first behavior changes", () => {
  const skill = readFileSync(".pi/skills/self-improvement-loop/SKILL.md", "utf8");

  assert.match(skill, /delegate coding work|delegate implementation work|spawn a delegated subagent/i);
  assert.match(skill, /test-first|regression-test-first|tdd/i);
  assert.match(skill, /stay within (this )?repository|changing unrelated repositories/i);
});
