import test from "node:test";
import assert from "node:assert/strict";
import { applyRuntimeModelOptionsToPayload } from "../services/agent-worker/src/pi-model-runtime-settings.js";

test("applyRuntimeModelOptionsToPayload applies OpenAI-compatible sampling fields", () => {
  const payload = applyRuntimeModelOptionsToPayload({
    model: "qwen3-coder",
    messages: [],
    max_completion_tokens: 500,
  }, {
    temperature: 0.2,
    topP: 0.9,
    topK: 40,
    minP: 0.05,
    maxTokens: 1200,
    seed: 11,
    stop: ["DONE"],
    repeatPenalty: 1.04,
    frequencyPenalty: 0.3,
    presencePenalty: 0.2,
  });

  assert.deepEqual(payload, {
    model: "qwen3-coder",
    messages: [],
    max_completion_tokens: 1200,
    temperature: 0.2,
    top_p: 0.9,
    top_k: 40,
    min_p: 0.05,
    seed: 11,
    stop: ["DONE"],
    repetition_penalty: 1.04,
    frequency_penalty: 0.3,
    presence_penalty: 0.2,
  });
});

test("applyRuntimeModelOptionsToPayload applies Ollama-style nested options too", () => {
  const payload = applyRuntimeModelOptionsToPayload({
    model: "qwen3-coder",
    prompt: "hi",
    options: {
      temperature: 0.8,
    },
  }, {
    temperature: 0.1,
    topP: 0.95,
    topK: 25,
    minP: 0.02,
    maxTokens: 800,
    seed: 5,
    stop: ["Observation:"],
    repeatPenalty: 1.1,
    frequencyPenalty: 0.4,
    presencePenalty: 0.3,
    contextWindow: 8192,
  });

  assert.deepEqual(payload, {
    model: "qwen3-coder",
    prompt: "hi",
    options: {
      temperature: 0.1,
      top_p: 0.95,
      top_k: 25,
      min_p: 0.02,
      num_predict: 800,
      seed: 5,
      stop: ["Observation:"],
      repeat_penalty: 1.1,
      frequency_penalty: 0.4,
      presence_penalty: 0.3,
      num_ctx: 8192,
    },
    temperature: 0.1,
    top_p: 0.95,
    top_k: 25,
    min_p: 0.02,
    max_tokens: 800,
    seed: 5,
    stop: ["Observation:"],
    repetition_penalty: 1.1,
    frequency_penalty: 0.4,
    presence_penalty: 0.3,
  });
});

test("applyRuntimeModelOptionsToPayload leaves unrelated payloads unchanged when no options are set", () => {
  const original = { model: "qwen3-coder", messages: [] };
  assert.deepEqual(applyRuntimeModelOptionsToPayload(original, undefined), original);
});

test("applyRuntimeModelOptionsToPayload ignores non-record payloads like arrays", () => {
  const original = ["not", "a", "request", "payload"];
  assert.deepEqual(applyRuntimeModelOptionsToPayload(original, { temperature: 0.2 }), original);
});
