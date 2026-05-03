import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePinchyConfigCliValue, readPinchyConfigValue, setPinchyConfigValue } from "../apps/host/src/pinchy-config.js";
import { runPinchyCli } from "../apps/host/src/pinchy.js";

function withTempDir(run: (cwd: string) => void | Promise<void>) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-config-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("setPinchyConfigValue writes runtime config keys and readPinchyConfigValue returns them", () => {
  withTempDir((cwd) => {
    setPinchyConfigValue(cwd, "defaultProvider", "ollama");
    setPinchyConfigValue(cwd, "defaultModel", "qwen2.5-coder");
    setPinchyConfigValue(cwd, "defaultThinkingLevel", "medium");
    setPinchyConfigValue(cwd, "defaultBaseUrl", "http://localhost:11434/v1");
    setPinchyConfigValue(cwd, "autoDeleteEnabled", true);
    setPinchyConfigValue(cwd, "autoDeleteDays", 30);

    assert.equal(readPinchyConfigValue(cwd, "defaultProvider"), "ollama");
    assert.equal(readPinchyConfigValue(cwd, "defaultModel"), "qwen2.5-coder");
    assert.equal(readPinchyConfigValue(cwd, "defaultThinkingLevel"), "medium");
    assert.equal(readPinchyConfigValue(cwd, "defaultBaseUrl"), "http://localhost:11434/v1");
    assert.equal(readPinchyConfigValue(cwd, "autoDeleteEnabled"), true);
    assert.equal(readPinchyConfigValue(cwd, "autoDeleteDays"), 30);

    const file = JSON.parse(readFileSync(join(cwd, ".pinchy-runtime.json"), "utf8")) as Record<string, string | boolean | number>;
    assert.equal(file.defaultProvider, "ollama");
    assert.equal(file.defaultBaseUrl, "http://localhost:11434/v1");
    assert.equal(file.autoDeleteEnabled, true);
    assert.equal(file.autoDeleteDays, 30);
  });
});

test("parsePinchyConfigCliValue coerces boolean and numeric config values for CLI usage", () => {
  assert.equal(parsePinchyConfigCliValue("defaultProvider", "ollama"), "ollama");
  assert.equal(parsePinchyConfigCliValue("dangerModeEnabled", "true"), true);
  assert.equal(parsePinchyConfigCliValue("autoDeleteEnabled", "false"), false);
  assert.equal(parsePinchyConfigCliValue("autoDeleteDays", "30"), 30);
  assert.equal(parsePinchyConfigCliValue("toolRetryWarningThreshold", "6"), 6);
  assert.equal(parsePinchyConfigCliValue("toolRetryHardStopThreshold", "12"), 12);
});


test("parsePinchyConfigCliValue rejects invalid boolean, numeric, and unsupported inputs", () => {
  assert.throws(() => parsePinchyConfigCliValue("dangerModeEnabled", "maybe"), /Invalid boolean value/);
  assert.throws(() => parsePinchyConfigCliValue("autoDeleteDays", "0"), /Invalid positive integer value/);
  assert.throws(() => parsePinchyConfigCliValue("toolRetryWarningThreshold", "1.5"), /Invalid positive integer value/);
  assert.throws(() => parsePinchyConfigCliValue("badKey", "x"), /Unsupported config key/);
});

test("runPinchyCli persists typed config set values instead of raw strings", async () => {
  await withTempDir(async (cwd) => {
    const originalLog = console.log;
    console.log = () => {};
    try {
      await runPinchyCli(["config", "set", "dangerModeEnabled", "true"], { ...process.env, PINCHY_CWD: cwd });
      await runPinchyCli(["config", "set", "autoDeleteDays", "30"], { ...process.env, PINCHY_CWD: cwd });
      await runPinchyCli(["config", "set", "toolRetryHardStopThreshold", "12"], { ...process.env, PINCHY_CWD: cwd });
    } finally {
      console.log = originalLog;
    }

    assert.equal(readPinchyConfigValue(cwd, "dangerModeEnabled"), true);
    assert.equal(readPinchyConfigValue(cwd, "autoDeleteDays"), 30);
    assert.equal(readPinchyConfigValue(cwd, "toolRetryHardStopThreshold"), 12);

    const file = JSON.parse(readFileSync(join(cwd, ".pinchy-runtime.json"), "utf8")) as Record<string, string | boolean | number>;
    assert.equal(file.dangerModeEnabled, true);
    assert.equal(file.autoDeleteDays, 30);
    assert.equal(file.toolRetryHardStopThreshold, 12);
  });
});

test("setPinchyConfigValue rejects unsupported keys", () => {
  withTempDir((cwd) => {
    assert.throws(() => setPinchyConfigValue(cwd, "badKey", "x"), /Unsupported config key/);
  });
});
