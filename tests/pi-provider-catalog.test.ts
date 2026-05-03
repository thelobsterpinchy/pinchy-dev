import test from "node:test";
import assert from "node:assert/strict";
import { PINCHY_PROVIDER_CATALOG } from "../packages/shared/src/pi-provider-catalog.js";

function findProvider(id: string) {
  return PINCHY_PROVIDER_CATALOG.find((entry) => entry.id === id);
}

test("Pinchy provider catalog includes the major Pi providers plus local endpoints", () => {
  assert.ok(findProvider("openai-codex"));
  assert.ok(findProvider("anthropic"));
  assert.ok(findProvider("github-copilot"));
  assert.ok(findProvider("google-gemini-cli"));
  assert.ok(findProvider("google-antigravity"));
  assert.ok(findProvider("openai"));
  assert.ok(findProvider("openrouter"));
  assert.ok(findProvider("ollama"));
  assert.ok(findProvider("amazon-bedrock"));
  assert.ok(findProvider("google-vertex"));
});

test("Pinchy provider catalog marks auth and endpoint expectations for settings UI", () => {
  assert.equal(findProvider("openai-codex")?.authKind, "oauth");
  assert.equal(findProvider("anthropic")?.authKind, "api-key");
  assert.equal(findProvider("openai")?.supportsBaseUrl, true);
  assert.equal(findProvider("ollama")?.supportsBaseUrl, true);
  assert.equal(findProvider("amazon-bedrock")?.authKind, "environment");
});
