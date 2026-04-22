import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPinchyRuntimeConfig, loadPinchyRuntimeConfigDetails } from "../apps/host/src/runtime-config.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-runtime-config-"));
  const originalProvider = process.env.PINCHY_DEFAULT_PROVIDER;
  const originalModel = process.env.PINCHY_DEFAULT_MODEL;
  const originalThinking = process.env.PINCHY_DEFAULT_THINKING_LEVEL;
  const originalBaseUrl = process.env.PINCHY_DEFAULT_BASE_URL;
  try {
    run(cwd);
  } finally {
    if (originalProvider === undefined) delete process.env.PINCHY_DEFAULT_PROVIDER;
    else process.env.PINCHY_DEFAULT_PROVIDER = originalProvider;
    if (originalModel === undefined) delete process.env.PINCHY_DEFAULT_MODEL;
    else process.env.PINCHY_DEFAULT_MODEL = originalModel;
    if (originalThinking === undefined) delete process.env.PINCHY_DEFAULT_THINKING_LEVEL;
    else process.env.PINCHY_DEFAULT_THINKING_LEVEL = originalThinking;
    if (originalBaseUrl === undefined) delete process.env.PINCHY_DEFAULT_BASE_URL;
    else process.env.PINCHY_DEFAULT_BASE_URL = originalBaseUrl;
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadPinchyRuntimeConfig reads provider, model, and thinking defaults from .pinchy-runtime.json", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "medium",
      defaultBaseUrl: "http://localhost:11434/v1",
      autoDeleteEnabled: true,
      autoDeleteDays: 14,
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.defaultProvider, "openai");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, "medium");
    assert.equal(config.defaultBaseUrl, "http://localhost:11434/v1");
    assert.equal(config.autoDeleteEnabled, true);
    assert.equal(config.autoDeleteDays, 14);
  });
});

test("loadPinchyRuntimeConfig lets env overrides win", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet",
      defaultThinkingLevel: "low",
      defaultBaseUrl: "http://localhost:11434/v1",
    }));

    process.env.PINCHY_DEFAULT_PROVIDER = "openai";
    process.env.PINCHY_DEFAULT_MODEL = "gpt-5.4";
    process.env.PINCHY_DEFAULT_THINKING_LEVEL = "high";
    process.env.PINCHY_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.defaultProvider, "openai");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, "high");
    assert.equal(config.defaultBaseUrl, "http://127.0.0.1:1234/v1");
  });
});

test("loadPinchyRuntimeConfig ignores invalid thinking level values", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "turbo",
    }));

    const config = loadPinchyRuntimeConfig(cwd, { globalSettingsPath: join(cwd, "missing-global-settings.json") });
    assert.equal(config.defaultProvider, "openai");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, undefined);
  });
});

test("loadPinchyRuntimeConfig falls back to Pi agent defaults when workspace overrides are absent", () => {
  withTempDir((cwd) => {
    const globalSettingsPath = join(cwd, "pi-agent-settings.json");
    writeFileSync(globalSettingsPath, JSON.stringify({
      defaultProvider: "openai-codex",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "medium",
    }));

    const config = loadPinchyRuntimeConfig(cwd, { globalSettingsPath });
    assert.equal(config.defaultProvider, "openai-codex");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, "medium");
    assert.equal(config.defaultBaseUrl, undefined);

    const detailed = loadPinchyRuntimeConfigDetails(cwd, { globalSettingsPath });
    assert.equal(detailed.defaultProvider, "openai-codex");
    assert.equal(detailed.defaultModel, "gpt-5.4");
    assert.equal(detailed.defaultThinkingLevel, "medium");
    assert.equal(detailed.defaultBaseUrl, undefined);
    assert.equal(detailed.sources.defaultProvider, "pi-agent");
    assert.equal(detailed.sources.defaultModel, "pi-agent");
    assert.equal(detailed.sources.defaultThinkingLevel, "pi-agent");
    assert.equal(detailed.sources.defaultBaseUrl, "unset");
    assert.equal(detailed.sources.autoDeleteEnabled, "unset");
    assert.equal(detailed.sources.autoDeleteDays, "unset");
  });
});
