import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSessionScopeEnabled, setSessionScope } from "../apps/host/src/session-approval.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-session-approval-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("setSessionScope persists session approval state", () => {
  withTempDir((cwd) => {
    assert.equal(isSessionScopeEnabled(cwd, "desktop.actions"), false);
    setSessionScope(cwd, "desktop.actions", true);
    assert.equal(isSessionScopeEnabled(cwd, "desktop.actions"), true);
  });
});
