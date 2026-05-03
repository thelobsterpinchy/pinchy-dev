import test from "node:test";
import assert from "node:assert/strict";
import { getDesignAntiPatternCard, listDesignAntiPatternCards, searchDesignAntiPatterns } from "../apps/host/src/design-anti-patterns.js";
import { diagnoseDesignSmells } from "../apps/host/src/design-diagnosis.js";

const cwd = process.cwd();

test("listDesignAntiPatternCards loads the local anti-pattern reference set", () => {
  const cards = listDesignAntiPatternCards(cwd);
  const slugs = new Set(cards.map((card) => card.slug));

  assert.equal(cards.length, 22);
  assert.equal(slugs.has("god-object"), true);
  assert.equal(slugs.has("service-locator"), true);
  assert.equal(slugs.has("primitive-obsession"), true);
  assert.equal(slugs.has("golden-hammer"), true);
});

test("searchDesignAntiPatterns ranks likely anti-pattern matches and points to replacement patterns", () => {
  const godObjectResults = searchDesignAntiPatterns(cwd, "one giant class knows everything and keeps growing", 3);
  assert.equal(godObjectResults[0]?.slug, "god-object");
  assert.equal(godObjectResults[0]?.recommendedPatterns.includes("Facade"), true);
  assert.equal(godObjectResults[0]?.recommendedPatterns.includes("Service Layer"), true);

  const serviceLocatorResults = searchDesignAntiPatterns(cwd, "components pull dependencies from a global container instead of receiving them", 3);
  assert.equal(serviceLocatorResults[0]?.slug, "service-locator");
  assert.equal(serviceLocatorResults[0]?.recommendedPatterns.includes("Dependency Injection"), true);
});

test("diagnoseDesignSmells pairs likely anti-patterns with healthier documented replacement patterns", () => {
  const diagnosis = diagnoseDesignSmells(cwd, "a global service locator hides dependencies and a giant manager class keeps growing", 3);

  assert.equal(diagnosis.antiPatterns.some((card) => card.slug === "service-locator"), true);
  assert.equal(diagnosis.antiPatterns.some((card) => card.slug === "god-object"), true);
  assert.equal(diagnosis.patterns.some((card) => card.slug === "dependency-injection"), true);
  assert.equal(diagnosis.patterns.some((card) => card.slug === "facade"), true);
});

test("getDesignAntiPatternCard resolves canonical names and aliases", () => {
  const byName = getDesignAntiPatternCard(cwd, "God Object");
  const byAlias = getDesignAntiPatternCard(cwd, "blob");

  assert.equal(byName?.slug, "god-object");
  assert.equal(byAlias?.slug, "god-object");
  assert.match(byAlias?.summary ?? "", /too many responsibilities/i);
});
