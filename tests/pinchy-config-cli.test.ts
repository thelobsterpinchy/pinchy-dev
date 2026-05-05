import test from "node:test";
import assert from "node:assert/strict";
import { summarizePinchyConfigView, summarizePinchyConfigSet } from "../apps/host/src/pinchy-config-cli.js";

test("summarizePinchyConfigView renders current config values", () => {
  const text = summarizePinchyConfigView({
    defaultProvider: "ollama",
    defaultModel: "qwen2.5-coder",
    defaultThinkingLevel: "medium",
    defaultBaseUrl: "http://localhost:11434/v1",
    orchestrationProvider: "ollama",
    orchestrationModel: "qwen3-coder",
    orchestrationBaseUrl: "http://localhost:11434/v1",
    subagentProvider: "openai",
    subagentModel: "deepseek-coder",
    subagentBaseUrl: "http://localhost:1234/v1",
  });

  assert.match(text, /Current Pinchy runtime config/);
  assert.match(text, /defaultProvider: ollama/);
  assert.match(text, /defaultModel: qwen2.5-coder/);
  assert.match(text, /defaultBaseUrl: http:\/\/localhost:11434\/v1/);
  assert.match(text, /orchestrationProvider: ollama/);
  assert.match(text, /subagentProvider: openai/);
  assert.match(text, /subagentBaseUrl: http:\/\/localhost:1234\/v1/);
});

test("summarizePinchyConfigSet confirms the updated key and value", () => {
  const text = summarizePinchyConfigSet("defaultProvider", "ollama");
  assert.match(text, /Updated runtime config/);
  assert.match(text, /defaultProvider = ollama/);
  assert.match(text, /pinchy config view/);
});
