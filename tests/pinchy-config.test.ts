import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPinchyConfigValue, setPinchyConfigValue } from "../apps/host/src/pinchy-config.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-config-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("setPinchyConfigValue writes runtime config keys and readPinchyConfigValue returns them", () => {
  withTempDir((cwd) => {
    setPinchyConfigValue(cwd, "defaultProvider", "ollama");
    setPinchyConfigValue(cwd, "defaultModel", "qwen2.5-coder");
    setPinchyConfigValue(cwd, "defaultThinkingLevel", "medium");
    setPinchyConfigValue(cwd, "defaultBaseUrl", "http://localhost:11434/v1");

    assert.equal(readPinchyConfigValue(cwd, "defaultProvider"), "ollama");
    assert.equal(readPinchyConfigValue(cwd, "defaultModel"), "qwen2.5-coder");
    assert.equal(readPinchyConfigValue(cwd, "defaultThinkingLevel"), "medium");
    assert.equal(readPinchyConfigValue(cwd, "defaultBaseUrl"), "http://localhost:11434/v1");

    const file = JSON.parse(readFileSync(join(cwd, ".pinchy-runtime.json"), "utf8")) as Record<string, string>;
    assert.equal(file.defaultProvider, "ollama");
    assert.equal(file.defaultBaseUrl, "http://localhost:11434/v1");
  });
});

test("setPinchyConfigValue rejects unsupported keys", () => {
  withTempDir((cwd) => {
    assert.throws(() => setPinchyConfigValue(cwd, "badKey", "x"), /Unsupported config key/);
  });
});
