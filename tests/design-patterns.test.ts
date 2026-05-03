import test from "node:test";
import assert from "node:assert/strict";
import { getDesignPatternCard, listDesignPatternCards, searchDesignPatterns } from "../apps/host/src/design-patterns.js";

const cwd = process.cwd();

test("listDesignPatternCards loads the expanded local pattern reference set including dependency injection and architectural patterns", () => {
  const cards = listDesignPatternCards(cwd);
  const slugs = new Set(cards.map((card) => card.slug));

  assert.equal(cards.length, 75);
  assert.equal(slugs.has("strategy"), true);
  assert.equal(slugs.has("adapter"), true);
  assert.equal(slugs.has("dependency-injection"), true);
  assert.equal(slugs.has("repository"), true);
  assert.equal(slugs.has("unit-of-work"), true);
  assert.equal(slugs.has("hexagonal-architecture"), true);
  assert.equal(slugs.has("null-object"), true);
  assert.equal(slugs.has("value-object"), true);
  assert.equal(slugs.has("domain-event"), true);
  assert.equal(slugs.has("plugin"), true);
  assert.equal(slugs.has("outbox"), true);
  assert.equal(slugs.has("strangler-fig"), true);
  assert.equal(slugs.has("message-bus"), true);
  assert.equal(slugs.has("gateway"), true);
  assert.equal(slugs.has("rate-limiter"), true);
  assert.equal(slugs.has("cache-aside"), true);
  assert.equal(slugs.has("throttle"), true);
  assert.equal(slugs.has("object-pool"), true);
});

test("searchDesignPatterns ranks likely matches for common code smells", () => {
  const strategyResults = searchDesignPatterns(cwd, "too many if else branches choosing behavior", 3);
  assert.equal(strategyResults[0]?.slug, "strategy");

  const adapterResults = searchDesignPatterns(cwd, "wrap an existing api to match the interface we expect", 3);
  assert.equal(adapterResults[0]?.slug, "adapter");

  const diResults = searchDesignPatterns(cwd, "constructor receives logger repository and clock instead of creating them inside", 3);
  assert.equal(diResults[0]?.slug, "dependency-injection");
});

test("getDesignPatternCard resolves canonical names and aliases", () => {
  const byName = getDesignPatternCard(cwd, "Strategy");
  const byAlias = getDesignPatternCard(cwd, "di");

  assert.equal(byName?.slug, "strategy");
  assert.equal(byAlias?.slug, "dependency-injection");
  assert.match(byAlias?.summary ?? "", /dependencies/i);
});
