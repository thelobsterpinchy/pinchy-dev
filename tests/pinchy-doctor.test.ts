import test from "node:test";
import assert from "node:assert/strict";
import { buildPinchyDoctorReport, summarizePinchyDoctorReport, summarizePinchyDoctorReportJson } from "../apps/host/src/pinchy-doctor.js";

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

test("buildPinchyDoctorReport warns when the Playwright CLI exists but the Chromium browser binary is missing", () => {
  const existingPaths = new Set([
    "/tmp/project/.pi/settings.json",
    "/tmp/project/.pinchy-runtime.json",
    "/tmp/project/.pinchy-goals.json",
    "/tmp/project/.pinchy-watch.json",
    "/tmp/project/node_modules/.bin/playwright",
  ]);

  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: (path) => existingPaths.has(path),
    commandExists: (command) => ["git", "ollama"].includes(command),
    resolvePlaywrightBrowserPath: () => "/Users/example/Library/Caches/ms-playwright/chromium/chrome",
  });

  const playwrightCheck = report.checks.find((check) => check.name === "playwright_chromium");
  assert.equal(playwrightCheck?.status, "warn");
  assert.match(playwrightCheck?.message ?? "", /browser binaries are missing/i);
  assert.match(playwrightCheck?.hint ?? "", /playwright:install/);
  assert.equal(report.checks.find((check) => check.name === "local_models")?.status, "ok");
});

test("buildPinchyDoctorReport detects Playwright browser readiness when the CLI and Chromium binary are both available", () => {
  const existingPaths = new Set([
    "/tmp/project/.pi/settings.json",
    "/tmp/project/.pinchy-runtime.json",
    "/tmp/project/.pinchy-goals.json",
    "/tmp/project/.pinchy-watch.json",
    "/tmp/project/node_modules/.bin/playwright",
    "/Users/example/Library/Caches/ms-playwright/chromium/chrome",
  ]);

  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: (path) => existingPaths.has(path),
    commandExists: (command) => ["git", "ollama"].includes(command),
    resolvePlaywrightBrowserPath: () => "/Users/example/Library/Caches/ms-playwright/chromium/chrome",
  });

  assert.equal(report.checks.find((check) => check.name === "playwright_chromium")?.status, "ok");
  assert.equal(report.checks.find((check) => check.name === "local_models")?.status, "ok");
});

test("buildPinchyDoctorReport reports a healthy initialized workspace when core files and tools are available", () => {
  const existingPaths = new Set([
    "/tmp/project/.pi/settings.json",
    "/tmp/project/.pinchy-runtime.json",
    "/tmp/project/.pinchy-goals.json",
    "/tmp/project/.pinchy-watch.json",
    "/tmp/project/node_modules/.bin/playwright",
    "/Users/example/Library/Caches/ms-playwright/chromium/chrome",
  ]);

  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: (path) => existingPaths.has(path),
    commandExists: (command) => ["git", "cliclick", "tesseract", "ollama"].includes(command),
    resolvePlaywrightBrowserPath: () => "/Users/example/Library/Caches/ms-playwright/chromium/chrome",
    env: {
      PINCHY_DISCORD_BOT_TOKEN: "bot-token",
      PINCHY_API_TOKEN: "api-token",
      PINCHY_DISCORD_ALLOWED_GUILD_IDS: "guild-1",
      PINCHY_DISCORD_ALLOWED_CHANNEL_IDS: "channel-1",
    },
  });

  assert.equal(report.summary.status, "ok");
  assert.equal(report.summary.failCount, 0);
  assert.equal(report.summary.warnCount, 0);
  assert.ok(report.checks.every((check) => check.status === "ok"));
});

test("buildPinchyDoctorReport fails Discord bot checks when required gateway settings are incomplete", () => {
  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: () => true,
    commandExists: () => true,
    env: {
      PINCHY_DISCORD_BOT_TOKEN: "bot-token",
    },
  });

  const discordCheck = report.checks.find((check) => check.name === "discord_bot");
  assert.equal(discordCheck?.status, "fail");
  assert.match(discordCheck?.message ?? "", /PINCHY_API_TOKEN/);
  assert.match(discordCheck?.message ?? "", /PINCHY_DISCORD_ALLOWED_GUILD_IDS/);
  assert.match(discordCheck?.message ?? "", /PINCHY_DISCORD_ALLOWED_CHANNEL_IDS/);
});

test("buildPinchyDoctorReport warns when Discord bot gateway is not configured", () => {
  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: () => true,
    commandExists: () => true,
    env: {},
  });

  const discordCheck = report.checks.find((check) => check.name === "discord_bot");
  assert.equal(discordCheck?.status, "warn");
  assert.match(discordCheck?.hint ?? "", /PINCHY_DISCORD_BOT_TOKEN/);
  assert.match(discordCheck?.hint ?? "", /docs\/DISCORD\.md/);
});

test("summarizePinchyDoctorReportJson returns machine-readable doctor output", () => {
  const report = buildPinchyDoctorReport("/tmp/project", {
    pathExists: () => true,
    commandExists: () => true,
  });

  const json = summarizePinchyDoctorReportJson(report);
  const parsed = JSON.parse(json) as { cwd: string; summary: { status: string } };
  assert.equal(parsed.cwd, "/tmp/project");
  assert.equal(parsed.summary.status, "warn");
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
  assert.match(summary, /local_models:/);
  assert.match(summary, /brew install cliclick/);
});
