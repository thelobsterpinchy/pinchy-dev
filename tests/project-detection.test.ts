import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProjectSignals, detectValidationPlan } from "../apps/host/src/project-detection.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-detect-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("detectValidationPlan prefers npm test when package.json has test script", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }, null, 2));
    writeFileSync(join(cwd, "package-lock.json"), "");

    const plan = detectValidationPlan(cwd);
    assert.equal(plan.command, "npm test");
    assert.match(plan.reason, /package\.json test script/i);
  });
});

test("detectValidationPlan prefers test:ci when test is absent", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { "test:ci": "vitest run" } }, null, 2));
    const plan = detectValidationPlan(cwd);
    assert.equal(plan.command, "npm run test:ci");
  });
});

test("detectValidationPlan prefers pytest for Python projects without package test script", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, "pyproject.toml"), "[project]\nname='demo'\n");

    const plan = detectValidationPlan(cwd);
    assert.equal(plan.command, "pytest");
  });
});

test("detectProjectSignals reports multiple project markers", () => {
  withTempDir((cwd) => {
    mkdirSync(join(cwd, "docs"));
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: {} }, null, 2));
    writeFileSync(join(cwd, "nx.json"), "{}");
    writeFileSync(join(cwd, "playwright.config.ts"), "export default {}\n");

    const signals = detectProjectSignals(cwd);
    assert.deepEqual(
      signals.map((entry) => entry.kind).sort(),
      ["node-package", "nx-workspace", "playwright"],
    );
  });
});
