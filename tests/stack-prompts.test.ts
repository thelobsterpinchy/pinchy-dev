import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStackAwareIterationGuidance } from "../apps/host/src/stack-prompts.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-stack-prompts-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("buildStackAwareIterationGuidance reflects detected stack signals", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    writeFileSync(join(cwd, "playwright.config.ts"), "export default {}\n");
    const guidance = buildStackAwareIterationGuidance(cwd);
    assert.equal(guidance.some((line) => /Node\/TypeScript/.test(line)), true);
    assert.equal(guidance.some((line) => /browser flows/.test(line)), true);
  });
});
