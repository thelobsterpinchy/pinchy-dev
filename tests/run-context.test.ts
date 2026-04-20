import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunContext, loadRunContext } from "../apps/host/src/run-context.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-runctx-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("createRunContext persists run context", () => {
  withTempDir((cwd) => {
    const created = createRunContext(cwd, "iteration");
    const loaded = loadRunContext(cwd);
    assert.equal(loaded?.currentRunId, created.currentRunId);
    assert.equal(loaded?.currentRunLabel, "iteration");
  });
});
