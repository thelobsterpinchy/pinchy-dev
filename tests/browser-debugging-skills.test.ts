import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("browser-debugging skills reinforce readiness checks and evidence-first workflows", () => {
  const websiteDebugger = readFileSync(".pi/skills/website-debugger/SKILL.md", "utf8");
  const playwrightInvestigation = readFileSync(".pi/skills/playwright-investigation/SKILL.md", "utf8");

  for (const skill of [websiteDebugger, playwrightInvestigation]) {
    assert.match(skill, /pinchy doctor/i);
    assert.match(skill, /browser_debug_scan/i);
    assert.match(skill, /screenshot/i);
    assert.match(skill, /DOM snapshot|DOM evidence/i);
    assert.match(skill, /regression coverage|failing test|regression test/i);
    assert.match(skill, /smallest fix|minimal change/i);
  }

  assert.match(playwrightInvestigation, /browser_execute_steps|explicit steps/i);
  assert.match(playwrightInvestigation, /browser_compare_artifacts|before\/after/i);
});
