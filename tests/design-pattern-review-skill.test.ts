import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("design-pattern-review skill points agents to the pattern reference tools and keeps guidance concise", () => {
  const skill = readFileSync(".pi/skills/design-pattern-review/SKILL.md", "utf8");

  assert.match(skill, /search_design_patterns/);
  assert.match(skill, /get_design_pattern/);
  assert.match(skill, /detect_design_anti_patterns/);
  assert.match(skill, /get_design_anti_pattern/);
  assert.match(skill, /Prefer simple code unless a pattern clearly helps/i);
  assert.match(skill, /Dependency Injection/);
  assert.match(skill, /anti-pattern/i);
  assert.match(skill, /Creational: Factory Method, Abstract Factory, Builder, Prototype, Singleton/);
});
