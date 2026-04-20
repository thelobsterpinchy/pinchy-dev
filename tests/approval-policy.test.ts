import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isActionAutoApproved, setApprovalScope } from "../apps/host/src/approval-policy.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-policy-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("setApprovalScope persists a scope toggle", () => {
  withTempDir((cwd) => {
    assert.equal(isActionAutoApproved(cwd, "desktop.actions"), false);
    setApprovalScope(cwd, "desktop.actions", true);
    assert.equal(isActionAutoApproved(cwd, "desktop.actions"), true);
  });
});
