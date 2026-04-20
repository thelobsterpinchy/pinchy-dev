import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadIterationConfig } from "../apps/host/src/iteration-config.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-iteration-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadIterationConfig reads overrides", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-iteration.json"), JSON.stringify({ enabled: false, intervalMs: 1234, edgeCaseFocus: ["api limits"], maxCyclesPerRun: 2 }));
    const config = loadIterationConfig(cwd);
    assert.equal(config.enabled, false);
    assert.equal(config.intervalMs, 1234);
    assert.deepEqual(config.edgeCaseFocus, ["api limits"]);
    assert.equal(config.maxCyclesPerRun, 2);
  });
});
