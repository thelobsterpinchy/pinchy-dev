import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildManagedServiceDefinitions,
  buildManagedServiceReadinessChecks,
  getManagedServiceStatePaths,
  summarizeManagedServices,
} from "../apps/host/src/dev-stack.js";

test("buildManagedServiceDefinitions returns the expected local stack services and commands", () => {
  const services = buildManagedServiceDefinitions();

  assert.deepEqual(services.map((service) => service.name), ["api", "worker", "dashboard"]);
  assert.equal(services[0]?.command, "npm");
  assert.deepEqual(services[0]?.args, ["run", "api"]);
  assert.deepEqual(services[1]?.args, ["run", "worker"]);
  assert.deepEqual(services[2]?.args, ["run", "dashboard"]);
});

test("getManagedServiceStatePaths keeps pid and log files under .pinchy/run", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-dev-stack-"));

  const paths = getManagedServiceStatePaths(cwd, "api");

  assert.equal(paths.pidPath, join(cwd, ".pinchy/run/api.pid"));
  assert.equal(paths.logPath, join(cwd, ".pinchy/run/api.log"));
});

test("summarizeManagedServices renders a human-readable startup summary", () => {
  const summary = summarizeManagedServices([
    { name: "api", status: "started", logPath: "/repo/.pinchy/run/api.log", pid: 1001 },
    { name: "worker", status: "already_running", logPath: "/repo/.pinchy/run/worker.log", pid: 1002 },
    { name: "dashboard", status: "started", logPath: "/repo/.pinchy/run/dashboard.log", pid: 1003 },
  ]);

  assert.match(summary, /Started Pinchy local stack helpers/);
  assert.match(summary, /api: started/);
  assert.match(summary, /worker: already_running/);
  assert.match(summary, /dashboard: started/);
  assert.match(summary, /Use npm run agent in this terminal/);
});

test("buildManagedServiceReadinessChecks includes API health and dashboard root checks", () => {
  const checks = buildManagedServiceReadinessChecks();

  assert.deepEqual(checks, [
    { name: "api", url: "http://127.0.0.1:4320/health" },
    { name: "dashboard", url: "http://127.0.0.1:4310/" },
  ]);
});
