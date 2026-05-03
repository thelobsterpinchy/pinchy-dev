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

test("buildManagedServiceDefinitions returns installable direct-entry service commands", () => {
  const services = buildManagedServiceDefinitions();

  assert.deepEqual(services.map((service) => service.name), ["api", "worker", "dashboard", "daemon"]);
  assert.equal(typeof services[0]?.command, "string");
  assert.ok((services[0]?.command ?? "").length > 0);
  assert.ok((services[0]?.args ?? []).some((entry) => /apps\/api\/src\/server\.ts$/.test(entry)));
  assert.ok((services[1]?.args ?? []).some((entry) => /services\/agent-worker\/src\/worker\.ts$/.test(entry)));
  assert.ok((services[2]?.args ?? []).some((entry) => /apps\/host\/src\/dashboard\.ts$/.test(entry)));
  assert.ok((services[3]?.args ?? []).some((entry) => /apps\/host\/src\/daemon\.ts$/.test(entry)));
  assert.ok((services[0]?.args ?? []).every((entry) => !/^run$/.test(entry)));
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
    { name: "daemon", status: "started", logPath: "/repo/.pinchy/run/daemon.log", pid: 1004 },
  ]);

  assert.match(summary, /Started Pinchy local stack helpers/);
  assert.match(summary, /api: started/);
  assert.match(summary, /worker: already_running/);
  assert.match(summary, /dashboard: started/);
  assert.match(summary, /daemon: started/);
  assert.match(summary, /Use npm run agent in this terminal/);
});

test("buildManagedServiceReadinessChecks includes API health and dashboard root checks", () => {
  const checks = buildManagedServiceReadinessChecks();

  assert.deepEqual(checks, [
    { name: "api", url: "http://127.0.0.1:4320/health" },
    { name: "dashboard", url: "http://127.0.0.1:4310/" },
  ]);
});
