import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDaemonGoalsConfig } from "../apps/host/src/daemon-config.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-daemon-config-"));
  const originalAutoImprovements = process.env.PINCHY_DAEMON_AUTO_IMPROVEMENTS;
  const originalIntervalMs = process.env.PINCHY_DAEMON_INTERVAL_MS;
  const originalGoals = process.env.PINCHY_DAEMON_GOALS;
  try {
    run(cwd);
  } finally {
    if (originalAutoImprovements === undefined) delete process.env.PINCHY_DAEMON_AUTO_IMPROVEMENTS;
    else process.env.PINCHY_DAEMON_AUTO_IMPROVEMENTS = originalAutoImprovements;
    if (originalIntervalMs === undefined) delete process.env.PINCHY_DAEMON_INTERVAL_MS;
    else process.env.PINCHY_DAEMON_INTERVAL_MS = originalIntervalMs;
    if (originalGoals === undefined) delete process.env.PINCHY_DAEMON_GOALS;
    else process.env.PINCHY_DAEMON_GOALS = originalGoals;
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadDaemonGoalsConfig reads enabled override from .pinchy-goals.json", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-goals.json"), JSON.stringify({ enabled: false, intervalMs: 1234, goals: ["demo"] }));
    const config = loadDaemonGoalsConfig(cwd);
    assert.equal(config.enabled, false);
    assert.equal(config.intervalMs, 1234);
    assert.deepEqual(config.goals, ["demo"]);
  });
});

test("loadDaemonGoalsConfig falls back to enabled when no override exists", () => {
  withTempDir((cwd) => {
    const config = loadDaemonGoalsConfig(cwd);
    assert.equal(config.enabled, true);
    assert.ok(config.goals.length > 0);
  });
});

test("loadDaemonGoalsConfig allows env override for auto improvements", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-goals.json"), JSON.stringify({ enabled: true, goals: ["demo"] }));
    process.env.PINCHY_DAEMON_AUTO_IMPROVEMENTS = "false";
    const config = loadDaemonGoalsConfig(cwd);
    assert.equal(config.enabled, false);
  });
});

test("loadDaemonGoalsConfig falls back to defaults when .pinchy-goals.json is invalid", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-goals.json"), "{not-valid-json");
    const config = loadDaemonGoalsConfig(cwd);
    assert.equal(config.enabled, true);
    assert.equal(config.intervalMs, 30 * 60 * 1000);
    assert.ok(config.goals.length > 0);
  });
});

test("loadDaemonGoalsConfig ignores invalid interval env overrides", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-goals.json"), JSON.stringify({ intervalMs: 1234, goals: ["demo"] }));
    process.env.PINCHY_DAEMON_INTERVAL_MS = "not-a-number";
    const config = loadDaemonGoalsConfig(cwd);
    assert.equal(config.intervalMs, 1234);
  });
});
