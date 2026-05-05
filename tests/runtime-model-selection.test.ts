import test from "node:test";
import assert from "node:assert/strict";
import { selectRuntimeModel } from "../services/agent-worker/src/runtime-model-selection.js";

test("selectRuntimeModel lets orchestration use its own provider model and local server", () => {
  const selection = selectRuntimeModel({
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.4",
    defaultBaseUrl: "https://api.openai.com/v1",
    orchestrationProvider: "ollama",
    orchestrationModel: "qwen3-coder",
    orchestrationBaseUrl: "http://127.0.0.1:11434/v1",
    subagentProvider: "anthropic",
    subagentModel: "claude-sonnet",
    subagentBaseUrl: "https://anthropic.example.invalid",
  }, "orchestration");

  assert.deepEqual(selection, {
    provider: "ollama",
    modelId: "qwen3-coder",
    baseUrl: "http://127.0.0.1:11434/v1",
    thinkingLevel: undefined,
    modelOptions: undefined,
  });
});

test("selectRuntimeModel lets subagents use their own provider model and local server", () => {
  const selection = selectRuntimeModel({
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.4",
    defaultBaseUrl: "https://api.openai.com/v1",
    subagentProvider: "ollama",
    subagentModel: "deepseek-coder",
    subagentBaseUrl: "http://127.0.0.1:1234/v1",
  }, "subagent");

  assert.equal(selection.provider, "ollama");
  assert.equal(selection.modelId, "deepseek-coder");
  assert.equal(selection.baseUrl, "http://127.0.0.1:1234/v1");
});

test("selectRuntimeModel falls back to workspace defaults for unset role fields", () => {
  const orchestration = selectRuntimeModel({
    defaultProvider: "openai",
    defaultModel: "gpt-5.4",
    defaultBaseUrl: "https://api.openai.com/v1",
  }, "orchestration");
  const subagent = selectRuntimeModel({
    defaultProvider: "openai",
    defaultModel: "gpt-5.4",
    defaultBaseUrl: "https://api.openai.com/v1",
  }, "subagent");

  assert.equal(orchestration.provider, "openai");
  assert.equal(orchestration.modelId, "gpt-5.4");
  assert.equal(orchestration.baseUrl, "https://api.openai.com/v1");
  assert.deepEqual(subagent, orchestration);
});
