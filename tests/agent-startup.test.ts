import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAgentStartupSummary,
  formatAgentStartupNotice,
  requiresInteractiveTerminal,
} from "../apps/host/src/agent-startup.js";

test("requiresInteractiveTerminal returns true only when stdin and stdout are both TTYs", () => {
  assert.equal(requiresInteractiveTerminal({ isTTY: true }, { isTTY: true }), true);
  assert.equal(requiresInteractiveTerminal({ isTTY: true }, { isTTY: false }), false);
  assert.equal(requiresInteractiveTerminal({ isTTY: false }, { isTTY: true }), false);
});

test("buildAgentStartupSummary reports modern dashboard mode when built assets exist", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-agent-startup-"));
  mkdirSync(join(cwd, "apps/dashboard/dist"), { recursive: true });
  writeFileSync(join(cwd, "apps/dashboard/dist/index.html"), "<html></html>");

  const summary = buildAgentStartupSummary(cwd, {
    PINCHY_API_BASE_URL: "http://127.0.0.1:4320",
    PINCHY_DASHBOARD_PORT: "4310",
  });

  assert.equal(summary.dashboardMode, "modern");
  assert.equal(summary.dashboardUrl, "http://127.0.0.1:4310");
  assert.equal(summary.apiBaseUrl, "http://127.0.0.1:4320");
});

test("buildAgentStartupSummary falls back to the default dashboard port when the env value is invalid", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-agent-startup-"));

  for (const value of ["", "not-a-number", "0", "-1", "4310.5", "65536", "99999"]) {
    const summary = buildAgentStartupSummary(cwd, {
      PINCHY_DASHBOARD_PORT: value,
    });

    assert.equal(summary.dashboardUrl, "http://127.0.0.1:4310");
  }
});

test("buildAgentStartupSummary falls back to the default API base URL when the env value is empty", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-agent-startup-"));

  for (const value of ["", "   "]) {
    const summary = buildAgentStartupSummary(cwd, {
      PINCHY_API_BASE_URL: value,
    });

    assert.equal(summary.apiBaseUrl, "http://127.0.0.1:4320");
  }
});

test("formatAgentStartupNotice explains the Pinchy boot sequence and next actions", () => {
  const notice = formatAgentStartupNotice({
    cwd: "/repo",
    dashboardMode: "legacy",
    dashboardUrl: "http://127.0.0.1:4310",
    apiBaseUrl: "http://127.0.0.1:4320",
  });

  assert.match(notice, /Pinchy interactive shell/);
  assert.match(notice, /Pinchy wraps Pi/);
  assert.match(notice, /won't do anything until you give it a task/i);
  assert.match(notice, /Try one of these first actions/i);
  assert.match(notice, /Tell Pinchy:/);
  assert.match(notice, /npm run up/);
  assert.match(notice, /npm run dashboard/);
  assert.match(notice, /npm run api/);
  assert.match(notice, /npm run worker/);
});
