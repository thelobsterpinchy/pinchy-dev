import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPinchyRuntimeConfig } from "../apps/host/src/runtime-config.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-runtime-config-"));
  const originalProvider = process.env.PINCHY_DEFAULT_PROVIDER;
  const originalModel = process.env.PINCHY_DEFAULT_MODEL;
  const originalThinking = process.env.PINCHY_DEFAULT_THINKING_LEVEL;
  try {
    run(cwd);
  } finally {
    if (originalProvider === undefined) delete process.env.PINCHY_DEFAULT_PROVIDER;
    else process.env.PINCHY_DEFAULT_PROVIDER = originalProvider;
    if (originalModel === undefined) delete process.env.PINCHY_DEFAULT_MODEL;
    else process.env.PINCHY_DEFAULT_MODEL = originalModel;
    if (originalThinking === undefined) delete process.env.PINCHY_DEFAULT_THINKING_LEVEL;
    else process.env.PINCHY_DEFAULT_THINKING_LEVEL = originalThinking;
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadPinchyRuntimeConfig reads provider, model, and thinking defaults from .pinchy-runtime.json", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "medium",
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.defaultProvider, "openai");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, "medium");
  });
});

test("loadPinchyRuntimeConfig lets env overrides win", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet",
      defaultThinkingLevel: "low",
    }));

    process.env.PINCHY_DEFAULT_PROVIDER = "openai";
    process.env.PINCHY_DEFAULT_MODEL = "gpt-5.4";
    process.env.PINCHY_DEFAULT_THINKING_LEVEL = "high";

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.defaultProvider, "openai");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, "high");
  });
});

test("loadPinchyRuntimeConfig ignores invalid thinking level values", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "turbo",
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.defaultProvider, "openai");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, undefined);
  });
});
