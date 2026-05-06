import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listMessages } from "../apps/host/src/agent-state-store.js";
import { enqueueAutonomousGoalRun, enqueueQueuedTaskRun } from "../apps/host/src/run-enqueue.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-run-enqueue-guardrails-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("self-improvement autonomous runs keep repository and TDD guardrails in the queued prompt", () => {
  withTempDir((cwd) => {
    const scheduled = enqueueAutonomousGoalRun(cwd, {
      cycle: 13,
      goal: "Run a safe self-improvement cycle for this repository.",
    });

    const [message] = listMessages(cwd, scheduled.conversation.id);

    assert.match(message?.content ?? "", /Stay within this repository unless explicitly instructed otherwise\./i);
    assert.match(message?.content ?? "", /test-first or regression-test-first workflow\./i);
    assert.match(message?.content ?? "", /If no safe improvement is warranted, explain why and stop for this cycle\./i);
  });
});

test("queued background tasks preserve the same repository and TDD self-improvement guardrails", () => {
  withTempDir((cwd) => {
    const scheduled = enqueueQueuedTaskRun(cwd, {
      title: "Review self-improvement prompt coverage",
      prompt: "Add a small guardrail-focused test if one is missing.",
    });

    const [message] = listMessages(cwd, scheduled.conversation.id);

    assert.match(message?.content ?? "", /Stay within this repository unless explicitly instructed otherwise\./i);
    assert.match(message?.content ?? "", /Prefer documentation, tests, guardrails, and small refactors over broad rewrites\./i);
    assert.match(message?.content ?? "", /test-first or regression-test-first workflow\./i);
  });
});
