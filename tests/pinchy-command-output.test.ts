import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPinchyVersion,
  summarizeStatus,
  summarizeLogs,
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
  ]);

  assert.match(summary, /Managed service status/);
  assert.match(summary, /running=2 stopped=1/);
  assert.match(summary, /pinchy up/);
  assert.match(summary, /pinchy logs dashboard/);
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

test("summarizeStopResults reports whether services were stopped or already inactive", () => {
  const summary = summarizeStopResults([
    { name: "api", status: "stopped", pid: 1001 },
    { name: "worker", status: "stopped" },
    { name: "dashboard", status: "stopped", pid: 1003 },
  ]);

  assert.match(summary, /Stopped managed services/);
  assert.match(summary, /api: stopped/);
  assert.match(summary, /worker: already stopped/);
  assert.match(summary, /pinchy status/);
});
