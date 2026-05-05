import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import approvalInbox from "../.pi/extensions/approval-inbox/index.js";
import { setApprovalScope } from "../apps/host/src/approval-policy.js";
import type { ApprovalRecord } from "../packages/shared/src/contracts.js";

type EventHandler = (event: any, ctx: any) => Promise<any> | any;

function createHarness(cwd: string, options: { hasUI?: boolean } = {}) {
  const handlers = new Map<string, EventHandler[]>();
  const notifications: Array<{ message: string; level: string }> = [];
  const pi = {
    on(eventName: string, handler: EventHandler) {
      const existing = handlers.get(eventName) ?? [];
      existing.push(handler);
      handlers.set(eventName, existing);
    },
    registerCommand() {
      // commands are not needed for these regression tests
    },
  };

  approvalInbox(pi as never);

  const ctx = {
    cwd,
    hasUI: options.hasUI ?? false,
    ui: {
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };

  return {
    notifications,
    async emit(eventName: string, event: any) {
      let result;
      for (const handler of handlers.get(eventName) ?? []) {
        result = await handler(event, ctx);
        if (result) return result;
      }
      return result;
    },
  };
}

function readApprovals(cwd: string) {
  return JSON.parse(readFileSync(join(cwd, ".pinchy-approvals.json"), "utf8")) as ApprovalRecord[];
}

test("approval inbox persists and blocks pending desktop_click approvals when desktop actions require review", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-approval-inbox-click-"));
  try {
    setApprovalScope(cwd, "desktop.actions", false);
    const harness = createHarness(cwd);

    const result = await harness.emit("tool_call", {
      toolName: "desktop_click",
      input: { x: 12, y: 34, reason: "Focus the save button" },
    });

    assert.deepEqual(result, {
      block: true,
      reason: "Pending approval required. Review .pinchy-approvals.json, run /approvals to inspect pending requests, then /approve <id> or /deny <id> before retrying.",
    });

    assert.deepEqual(readApprovals(cwd).map((entry) => ({
      status: entry.status,
      toolName: entry.toolName,
      reason: entry.reason,
      payload: entry.payload,
    })), [
      {
        status: "pending",
        toolName: "desktop_click",
        reason: "Focus the save button",
        payload: { x: 12, y: 34, reason: "Focus the save button" },
      },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("approval inbox allows a headless retry after the matching desktop_click approval is marked approved", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-approval-inbox-approved-"));
  try {
    setApprovalScope(cwd, "desktop.actions", false);
    const harness = createHarness(cwd);

    await harness.emit("tool_call", {
      toolName: "desktop_click",
      input: { x: 12, y: 34, reason: "Focus the save button" },
    });

    const approvals = readApprovals(cwd);
    approvals[0]!.status = "approved";
    writeFileSync(join(cwd, ".pinchy-approvals.json"), JSON.stringify(approvals, null, 2), "utf8");

    const retryResult = await harness.emit("tool_call", {
      toolName: "desktop_click",
      input: { x: 12, y: 34, reason: "Focus the save button" },
    });

    assert.equal(retryResult, undefined);
    assert.equal(readApprovals(cwd).length, 1);
    assert.equal(readApprovals(cwd)[0]?.status, "approved");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
