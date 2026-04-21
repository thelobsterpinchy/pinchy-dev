import test from "node:test";
import assert from "node:assert/strict";
import { buildPinchyDoctorReport, summarizePinchyDoctorReport } from "../apps/host/src/pinchy-doctor.js";

test("buildPinchyDoctorReport flags missing workspace initialization and optional local tools", () => {
  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: (path) => path === "/tmp/project/.pinchy-runtime.json",
    commandExists: () => false,
  });

  assert.equal(report.summary.status, "fail");
  assert.equal(report.checks[0]?.name, "workspace_init");
  assert.equal(report.checks[0]?.status, "fail");
  assert.match(report.checks[0]?.hint ?? "", /pinchy init/);

  const cliclickCheck = report.checks.find((check) => check.name === "cliclick");
  assert.equal(cliclickCheck?.status, "warn");
  assert.match(cliclickCheck?.hint ?? "", /brew install cliclick/);

  const tesseractCheck = report.checks.find((check) => check.name === "tesseract");
  assert.equal(tesseractCheck?.status, "warn");
  assert.match(tesseractCheck?.hint ?? "", /brew install tesseract/);
});

test("buildPinchyDoctorReport reports a healthy initialized workspace when core files and tools are available", () => {
  const existingPaths = new Set([
    "/tmp/project/.pi/settings.json",
    "/tmp/project/.pinchy-runtime.json",
    "/tmp/project/.pinchy-goals.json",
    "/tmp/project/.pinchy-watch.json",
  ]);

  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: (path) => existingPaths.has(path),
    commandExists: (command) => ["git", "cliclick", "tesseract"].includes(command),
  });

  assert.equal(report.summary.status, "ok");
  assert.equal(report.summary.failCount, 0);
  assert.equal(report.summary.warnCount, 0);
  assert.ok(report.checks.every((check) => check.status === "ok"));
});

test("summarizePinchyDoctorReport renders actionable doctor output", () => {
  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: (path) => path === "/tmp/project/.pi/settings.json",
    commandExists: (command) => command === "git",
  });

  const summary = summarizePinchyDoctorReport(report);
  assert.match(summary, /Pinchy doctor/);
  assert.match(summary, /workspace_init: ok/);
  assert.match(summary, /cliclick: warn/);
  assert.match(summary, /tesseract: warn/);
  assert.match(summary, /brew install cliclick/);
});
