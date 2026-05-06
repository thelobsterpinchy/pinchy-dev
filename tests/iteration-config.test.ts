import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIterationConfig } from "../apps/host/src/iteration-config.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-iteration-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadIterationConfig reads overrides", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-iteration.json"), JSON.stringify({ enabled: false, intervalMs: 1234, edgeCaseFocus: ["api limits"], maxCyclesPerRun: 2 }));
    const config = loadIterationConfig(cwd);
    assert.equal(config.enabled, false);
    assert.equal(config.intervalMs, 1234);
    assert.deepEqual(config.edgeCaseFocus, ["api limits"]);
    assert.equal(config.maxCyclesPerRun, 2);
  });
});

test("loadIterationConfig falls back when malformed runtime overrides include wrong primitive types or non-positive numeric values", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-iteration.json"), JSON.stringify({
      enabled: "false",
      intervalMs: 0,
      edgeCaseFocus: "api limits",
      maxCyclesPerRun: -1,
    }));

    const config = loadIterationConfig(cwd);

    assert.equal(config.enabled, true);
    assert.equal(config.intervalMs, 45 * 60 * 1000);
    assert.deepEqual(config.edgeCaseFocus, [
      "empty inputs",
      "null/undefined handling",
      "boundary values",
      "error paths",
      "race conditions or timing assumptions",
      "UI states after retries or loading failures",
    ]);
    assert.equal(config.maxCyclesPerRun, 1);
  });
});

test("loadIterationConfig falls back when the config file contains malformed JSON", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-iteration.json"), "{\n  \"enabled\": true,\n");

    const config = loadIterationConfig(cwd);

    assert.equal(config.enabled, true);
    assert.equal(config.intervalMs, 45 * 60 * 1000);
    assert.deepEqual(config.edgeCaseFocus, [
      "empty inputs",
      "null/undefined handling",
      "boundary values",
      "error paths",
      "race conditions or timing assumptions",
      "UI states after retries or loading failures",
    ]);
    assert.equal(config.maxCyclesPerRun, 1);
  });
});

test("loadIterationConfig rejects edge-case focus arrays that contain blank or non-string entries", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-iteration.json"), JSON.stringify({
      edgeCaseFocus: ["", "  api limits  ", null, "   ", 42],
    }));

    const config = loadIterationConfig(cwd);

    assert.deepEqual(config.edgeCaseFocus, [
      "empty inputs",
      "null/undefined handling",
      "boundary values",
      "error paths",
      "race conditions or timing assumptions",
      "UI states after retries or loading failures",
    ]);
  });
});

test("loadIterationConfig accepts the smallest positive numeric boundary values", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-iteration.json"), JSON.stringify({ intervalMs: 1, maxCyclesPerRun: 1 }));

    const config = loadIterationConfig(cwd);

    assert.equal(config.intervalMs, 1);
    assert.equal(config.maxCyclesPerRun, 1);
  });
});

test("loadIterationConfig rejects fractional maxCyclesPerRun values that could overrun iteration cycles", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-iteration.json"), JSON.stringify({ maxCyclesPerRun: 1.5 }));

    const config = loadIterationConfig(cwd);

    assert.equal(config.maxCyclesPerRun, 1);
  });
});
