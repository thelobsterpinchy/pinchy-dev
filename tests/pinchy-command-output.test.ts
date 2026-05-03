import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPinchyVersion,
  summarizeStatus,
  summarizeStatusJson,
  summarizeLogs,
  summarizeLogsJson,
  summarizeRestartResults,
  summarizeStopResults,
} from "../apps/host/src/pinchy-command-output.js";

test("formatPinchyVersion renders a concise version banner", () => {
  assert.equal(formatPinchyVersion("0.2.1"), "[pinchy] version 0.2.1\n");
});

test("summarizeStatus includes counts and next-step hints", () => {
  const summary = summarizeStatus([
    { name: "api", status: "running", pid: 1001, logPath: "/repo/.pinchy/run/api.log" },
    { name: "worker", status: "stopped", logPath: "/repo/.pinchy/run/worker.log" },
    { name: "dashboard", status: "running", pid: 1003, logPath: "/repo/.pinchy/run/dashboard.log" },
    { name: "daemon", status: "running", pid: 1004, logPath: "/repo/.pinchy/run/daemon.log" },
  ]);

  assert.match(summary, /Managed service status/);
  assert.match(summary, /running=3 stopped=1/);
  assert.match(summary, /pinchy up/);
  assert.match(summary, /pinchy logs dashboard/);
});

test("summarizeStatusJson returns a machine-readable status payload", () => {
  const summary = summarizeStatusJson([
    { name: "api", status: "running", pid: 1001, logPath: "/repo/.pinchy/run/api.log" },
  ]);
  const parsed = JSON.parse(summary) as { services: Array<{ name: string }> };
  assert.equal(parsed.services[0]?.name, "api");
});

test("summarizeLogs renders per-service headers and a fallback for empty logs", () => {
  const summary = summarizeLogs([
    { name: "api", logPath: "/repo/.pinchy/run/api.log", content: "api line" },
    { name: "worker", logPath: "/repo/.pinchy/run/worker.log", content: "" },
  ]);

  assert.match(summary, /logs: api/);
  assert.match(summary, /api line/);
  assert.match(summary, /worker/);
  assert.match(summary, /no log output yet/);
});

test("summarizeLogsJson returns machine-readable log sections", () => {
  const summary = summarizeLogsJson([
    { name: "api", logPath: "/repo/.pinchy/run/api.log", content: "api line" },
  ]);
  const parsed = JSON.parse(summary) as { sections: Array<{ name: string }> };
  assert.equal(parsed.sections[0]?.name, "api");
});

test("summarizeRestartResults reports stopped and restarted services with next steps", () => {
  const summary = summarizeRestartResults({
    stopped: [
      { name: "api", status: "stopped", pid: 1001 },
      { name: "worker", status: "stopped" },
      { name: "daemon", status: "stopped", pid: 1003 },
    ],
    started: [
      { name: "api", status: "started", pid: 2001, logPath: "/repo/.pinchy/run/api.log" },
      { name: "worker", status: "already_running", pid: 2002, logPath: "/repo/.pinchy/run/worker.log" },
      { name: "daemon", status: "started", pid: 2004, logPath: "/repo/.pinchy/run/daemon.log" },
    ],
  });

  assert.match(summary, /Restarted managed services/);
  assert.match(summary, /api: restarted/);
  assert.match(summary, /worker: restarted/);
  assert.match(summary, /daemon: restarted/);
  assert.match(summary, /pinchy status/);
  assert.match(summary, /pinchy logs dashboard/);
});

test("summarizeStopResults reports whether services were stopped or already inactive", () => {
  const summary = summarizeStopResults([
    { name: "api", status: "stopped", pid: 1001 },
    { name: "worker", status: "stopped" },
    { name: "dashboard", status: "stopped", pid: 1003 },
    { name: "daemon", status: "stopped", pid: 1004 },
  ]);

  assert.match(summary, /Stopped managed services/);
  assert.match(summary, /api: stopped/);
  assert.match(summary, /worker: already stopped/);
  assert.match(summary, /daemon: stopped/);
  assert.match(summary, /pinchy status/);
});
