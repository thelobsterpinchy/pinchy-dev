import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendAuditEntry, readAuditEntries } from "../apps/host/src/audit-log.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-audit-log-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("readAuditEntries returns an empty list when no audit file exists", () => {
  withTempDir((cwd) => {
    assert.deepEqual(readAuditEntries(cwd), []);
  });
});

test("appendAuditEntry stores newline-delimited JSON entries in order", () => {
  withTempDir((cwd) => {
    appendAuditEntry(cwd, {
      type: "worker_run_started",
      runId: "run-1",
      conversationId: "conversation-1",
      details: { executionMode: "queued" },
    });
    appendAuditEntry(cwd, {
      type: "worker_run_finished",
      runId: "run-1",
      conversationId: "conversation-1",
      summary: "Completed run successfully",
      details: { outcomeKind: "completed", durationMs: 25 },
    });

    const entries = readAuditEntries(cwd);
    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.type, "worker_run_started");
    assert.equal(entries[1]?.type, "worker_run_finished");
    assert.equal(entries[1]?.runId, "run-1");
    assert.equal(entries[1]?.summary, "Completed run successfully");
    assert.deepEqual(entries[1]?.details, { outcomeKind: "completed", durationMs: 25 });
    assert.ok(entries[0]?.ts);
  });
});
