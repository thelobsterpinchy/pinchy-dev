import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDaemonHealth, updateDaemonHealth } from "../apps/host/src/daemon-health.js";

test("updateDaemonHealth persists daemon status", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-daemon-health-"));
  updateDaemonHealth(cwd, { status: "running", currentActivity: "goal:1" });
  const health = loadDaemonHealth(cwd);
  assert.ok(health);
  assert.equal(health?.status, "running");
  assert.equal(health?.currentActivity, "goal:1");
});
