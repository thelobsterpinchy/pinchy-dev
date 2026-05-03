import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeConfigSignature } from "../apps/host/src/runtime-config-signature.js";

test("buildRuntimeConfigSignature is stable for the model-shaping runtime settings", () => {
  const left = buildRuntimeConfigSignature({
    defaultProvider: "ollama",
    defaultModel: "qwen3-coder",
    defaultThinkingLevel: "high",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    modelOptions: { temperature: 0.2, topK: 40, stop: ["DONE"] },
  });
  const right = buildRuntimeConfigSignature({
    defaultProvider: "ollama",
    defaultModel: "qwen3-coder",
    defaultThinkingLevel: "high",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    modelOptions: { stop: ["DONE"], topK: 40, temperature: 0.2 },
  });

  assert.equal(left, right);
});

test("buildRuntimeConfigSignature changes when the effective model changes", () => {
  const first = buildRuntimeConfigSignature({ defaultProvider: "openai", defaultModel: "gpt-5.4" });
  const second = buildRuntimeConfigSignature({ defaultProvider: "ollama", defaultModel: "qwen3-coder" });

  assert.notEqual(first, second);
});
