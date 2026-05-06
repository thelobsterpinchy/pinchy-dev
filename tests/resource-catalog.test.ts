import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceResourceCatalog, hasResource } from "../apps/host/src/resource-catalog.js";
import { buildSubmarineResourceContext } from "../services/agent-worker/src/submarine-resource-bridge.js";

test("workspace resource catalog discovers required skills, prompts, and knowledge", () => {
  const catalog = createWorkspaceResourceCatalog();
  const snapshot = catalog.listResources(process.cwd());

  for (const name of [
    "design-pattern-review",
    "engineering-excellence",
    "tdd-implementation",
    "website-debugger",
    "playwright-investigation",
  ]) {
    assert.equal(hasResource(snapshot, "skill", name), true, `missing skill ${name}`);
  }

  assert.equal(hasResource(snapshot, "prompt", "browser-bug"), true);
  assert.equal(hasResource(snapshot, "knowledge", "design-patterns/adapter"), true);
  assert.equal(hasResource(snapshot, "knowledge", "design-patterns/facade"), true);
  assert.equal(hasResource(snapshot, "knowledge", "design-anti-patterns/god-object"), true);
});

test("workspace resource catalog includes source paths and bounded previews", () => {
  const catalog = createWorkspaceResourceCatalog({ previewCharacters: 400 });
  const snapshot = catalog.listResources(process.cwd());
  const designReview = snapshot.resources.find((resource) => resource.type === "skill" && resource.name === "design-pattern-review");

  assert.ok(designReview);
  assert.match(designReview.path, /\.pi\/skills\/design-pattern-review\/SKILL\.md$/);
  assert.match(designReview.preview, /Design Pattern Review/);
  assert.ok(designReview.preview.length <= 400);
});

test("Submarine resource bridge builds a supervisor context from workspace resources", () => {
  const context = buildSubmarineResourceContext(process.cwd(), {
    catalog: createWorkspaceResourceCatalog({ previewCharacters: 120 }),
  });

  assert.ok(context.resources.some((resource) => resource.type === "skill" && resource.name === "design-pattern-review"));
  assert.ok(context.resources.some((resource) => resource.type === "skill" && resource.name === "engineering-excellence"));
  assert.ok(context.resources.some((resource) => resource.type === "skill" && resource.name === "tdd-implementation"));
  assert.ok(context.resources.some((resource) => resource.type === "prompt" && resource.name === "browser-bug"));
  assert.ok(context.resources.some((resource) => resource.type === "knowledge" && resource.name === "design-patterns/adapter"));

  assert.match(context.systemPrompt, /Workspace resources available to Submarine/);
  assert.match(context.systemPrompt, /\/skill:design-pattern-review/);
  assert.match(context.systemPrompt, /browser-bug/);
  assert.match(context.systemPrompt, /design-patterns\/adapter/);
  assert.doesNotMatch(context.systemPrompt, /Common architectural references also available: Dependency Injection, Repository, Unit of Work, Specification, Service Layer, Hexagonal Architecture, Anti-Corruption Layer, CQRS, Event Sourcing, Saga, Value Object, Domain Model, Aggregate, Domain Event, Policy, Plugin, Retry, Circuit Breaker, Bulkhead, Outbox, Strangler Fig, Feature Toggle, Idempotency Key, Backpressure, Queue-Based Load Leveling, Event Bus, Message Bus, Pipeline, Orchestrator, Coordinator, MVC, MVVM, Presenter, Gateway, BFF, Adapter Registry, Registry, Monostate, Object Pool, Lease, Sharding, Sidecar, Ambassador, Rate Limiter, Token Bucket, Debounce, Throttle, Cache-Aside, Read-Through, Write-Through, Write-Behind/);
});
