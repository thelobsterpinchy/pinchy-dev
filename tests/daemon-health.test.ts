import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadDaemonHealth, updateDaemonHealth } from "../apps/host/src/daemon-health.js";

test("updateDaemonHealth persists daemon status", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-daemon-health-"));
  updateDaemonHealth(cwd, { status: "running", currentActivity: "goal:1" });
  const health = loadDaemonHealth(cwd);
  assert.ok(health);
  assert.equal(health?.status, "running");
  assert.equal(health?.currentActivity, "goal:1");
});

test("loadDaemonHealth marks dead daemon pids as stopped", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-daemon-health-"));
  writeFileSync(resolve(cwd, ".pinchy-daemon-health.json"), JSON.stringify({
    pid: 999999,
    status: "idle",
    startedAt: "2026-04-21T00:00:00.000Z",
    heartbeatAt: "2026-04-21T00:05:00.000Z",
  }), "utf8");

  const health = loadDaemonHealth(cwd);
  assert.ok(health);
  assert.equal(health?.status, "stopped");
  assert.equal(health?.pid, 999999);
});
