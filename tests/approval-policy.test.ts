import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterActionableApprovals, isActionAutoApproved, loadApprovalPolicy, requestScopedApproval, setApprovalScope } from "../apps/host/src/approval-policy.js";
import { setSessionScope } from "../apps/host/src/session-approval.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-policy-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadApprovalPolicy includes low-friction repo defaults", () => {
  withTempDir((cwd) => {
    const policy = loadApprovalPolicy(cwd);
    assert.equal(policy.scopes?.["desktop.actions"], true);
    assert.equal(policy.scopes?.["simulator.actions"], true);
    assert.equal(policy.scopes?.["validation.exec"], true);
    assert.equal(policy.scopes?.["routine.exec"], true);
  });
});

test("setApprovalScope overrides a default scope toggle", () => {
  withTempDir((cwd) => {
    assert.equal(isActionAutoApproved(cwd, "desktop.actions"), true);
    setApprovalScope(cwd, "desktop.actions", false);
    assert.equal(isActionAutoApproved(cwd, "desktop.actions"), false);
    setApprovalScope(cwd, "desktop.actions", true);
    assert.equal(isActionAutoApproved(cwd, "desktop.actions"), true);
  });
});

test("requestScopedApproval honors session scope, UI confirmation, and env fallback", async () => {
  await new Promise<void>((resolve, reject) => {
    withTempDir((cwd) => {
      const previous = process.env.PINCHY_TEST_APPROVAL_ENV;
      const ctx = {
        cwd,
        hasUI: true,
        ui: {
          confirm: async () => true,
        },
      };

      Promise.resolve()
        .then(async () => {
          assert.equal(await requestScopedApproval(ctx, { scope: "custom.scope", title: "Confirm", message: "Need approval" }), true);

          setSessionScope(cwd, "custom.scope", true);
          assert.equal(await requestScopedApproval({ ...ctx, ui: { confirm: async () => false } }, { scope: "custom.scope", title: "Ignored", message: "Ignored" }), true);

          process.env.PINCHY_TEST_APPROVAL_ENV = "1";
          assert.equal(await requestScopedApproval({ cwd, hasUI: false }, { scope: "another.custom.scope", title: "Env", message: "Env", envVar: "PINCHY_TEST_APPROVAL_ENV" }), true);
        })
        .then(() => {
          if (previous === undefined) delete process.env.PINCHY_TEST_APPROVAL_ENV;
          else process.env.PINCHY_TEST_APPROVAL_ENV = previous;
          resolve();
        })
        .catch((error) => {
          if (previous === undefined) delete process.env.PINCHY_TEST_APPROVAL_ENV;
          else process.env.PINCHY_TEST_APPROVAL_ENV = previous;
          reject(error);
        });
    });
  });
});

test("filterActionableApprovals hides stale pending approvals for auto-approved scopes", () => {
  withTempDir((cwd) => {
    const approvals = filterActionableApprovals(cwd, [
      { id: "a1", status: "pending", toolName: "desktop_open_app", reason: "Open Safari", payload: { appName: "Safari" } },
      { id: "a2", status: "pending", toolName: "unknown_tool", reason: "Unknown", payload: {} },
      { id: "a3", status: "approved", toolName: "desktop_open_app", reason: "Old", payload: { appName: "Safari" } },
    ]);

    assert.deepEqual(approvals.map((entry) => entry.id), ["a2", "a3"]);
  });
});

test("filterActionableApprovals hides stale pending approvals for session-approved scopes", () => {
  withTempDir((cwd) => {
    setApprovalScope(cwd, "desktop.actions", false);
    setSessionScope(cwd, "desktop.actions", true);

    const approvals = filterActionableApprovals(cwd, [
      { id: "a1", status: "pending", toolName: "desktop_open_app", reason: "Open Safari", payload: { appName: "Safari" } },
      { id: "a2", status: "pending", toolName: "unknown_tool", reason: "Unknown", payload: {} },
      { id: "a3", status: "approved", toolName: "desktop_open_app", reason: "Old", payload: { appName: "Safari" } },
    ]);

    assert.deepEqual(approvals.map((entry) => entry.id), ["a2", "a3"]);
  });
});
