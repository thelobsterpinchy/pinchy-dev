import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function assertMentions(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

test("self-improvement instructions stay scoped, incremental, and safety-first", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  const skill = readFileSync(".pi/skills/self-improvement-loop/SKILL.md", "utf8");

  assertMentions(agents, [
    /stay within this repository by default/i,
    /start with docs, tests, guardrails, and workflows/i,
    /prefer incremental upgrades over rewrites/i,
    /do not silently weaken safety checks to increase autonomy/i,
  ]);

  assertMentions(skill, [
    /Allowed focus areas:/i,
    /documentation/i,
    /tests and validation/i,
    /small safe refactors/i,
    /Avoid by default:/i,
    /weakening safety restrictions/i,
    /broad rewrites/i,
    /changing unrelated repositories/i,
    /avoid editing those files/i,
    /will not clobber local work/i,
    /If no safe improvement is justified, stop and explain why/i,
  ]);
});
