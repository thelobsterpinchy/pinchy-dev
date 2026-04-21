import test from "node:test";
import assert from "node:assert/strict";
import { buildPinchySetupPlan, summarizePinchySetupPlan } from "../apps/host/src/pinchy-setup.js";

test("buildPinchySetupPlan provisions Playwright and reports optional local tooling", () => {
  const plan = buildPinchySetupPlan({
    playwrightCommand: { command: "/pkg/node_modules/.bin/playwright", args: ["install", "chromium"] },
    commandExists: (command) => command === "git",
  });

  assert.deepEqual(plan.steps, [
    {
      label: "Install Playwright Chromium",
      command: "/pkg/node_modules/.bin/playwright",
      args: ["install", "chromium"],
    },
  ]);
  assert.equal(plan.optionalChecks.find((check) => check.name === "git")?.status, "ok");
  assert.equal(plan.optionalChecks.find((check) => check.name === "cliclick")?.status, "warn");
  assert.equal(plan.optionalChecks.find((check) => check.name === "tesseract")?.status, "warn");
  assert.equal(plan.optionalChecks.find((check) => check.name === "local_models")?.status, "warn");
});

test("summarizePinchySetupPlan explains what setup will do and what remains optional", () => {
  const text = summarizePinchySetupPlan({
    steps: [
      {
        label: "Install Playwright Chromium",
        command: "/pkg/node_modules/.bin/playwright",
        args: ["install", "chromium"],
      },
    ],
    optionalChecks: [
      { name: "git", status: "ok", hint: undefined },
      { name: "cliclick", status: "warn", hint: "brew install cliclick" },
      { name: "tesseract", status: "warn", hint: "brew install tesseract" },
    ],
  });

  assert.match(text, /Setup plan/);
  assert.match(text, /Install Playwright Chromium/);
  assert.match(text, /Optional local tools/);
  assert.match(text, /brew install cliclick/);
  assert.match(text, /pinchy doctor/);
  assert.match(text, /Optional local tools/);
});
