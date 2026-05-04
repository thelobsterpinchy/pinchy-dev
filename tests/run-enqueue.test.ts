import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listConversations, listMessages, listRuns } from "../apps/host/src/agent-state-store.js";
import { loadRunContext } from "../apps/host/src/run-context.js";
import { loadRunHistory } from "../apps/host/src/run-history.js";
import { enqueueAutonomousGoalRun, enqueueIterationRun, enqueueQueuedTaskRun, enqueueWatcherFollowUpRun } from "../apps/host/src/run-enqueue.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-run-enqueue-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("enqueueAutonomousGoalRun creates a persistent queued run with user prompt context", () => {
  withTempDir((cwd) => {
    const scheduled = enqueueAutonomousGoalRun(cwd, {
      cycle: 1,
      goal: "Run a safe self-improvement cycle for this repository.",
      watcherQueued: true,
    });

    const conversations = listConversations(cwd);
    const runs = listRuns(cwd, scheduled.conversation.id);
    const messages = listMessages(cwd, scheduled.conversation.id);
    const runContext = loadRunContext(cwd);
    const history = loadRunHistory(cwd);

    assert.equal(conversations.length, 1);
    assert.equal(conversations[0]?.title, "Pinchy autonomous goals");
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.status, "queued");
    assert.equal(runs[0]?.kind, "autonomous_goal");
    assert.match(runs[0]?.goal ?? "", /Autonomous cycle 1/);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, "user");
    assert.match(messages[0]?.content ?? "", /watcher-triggered follow-up work may already be queued/i);
    assert.equal(runContext?.currentRunLabel, "goal:1");
    assert.equal(history[0]?.kind, "goal");
    assert.equal(history[0]?.status, "started");
    assert.match(history[0]?.details ?? "", /queued run/i);
  });
});

test("enqueueWatcherFollowUpRun reuses its conversation and persists changed-file context", () => {
  withTempDir((cwd) => {
    const first = enqueueWatcherFollowUpRun(cwd, {
      prompt: "A watched Pinchy file changed. Run a bounded maintenance review for the changed area.",
      changedFiles: ["apps/host/src/pinchy-daemon.ts", "docs/ROADMAP_STATUS.md"],
    });
    const second = enqueueWatcherFollowUpRun(cwd, {
      prompt: "A watched Pinchy file changed. Run a bounded maintenance review for the changed area.",
      changedFiles: ["apps/api/src/server.ts"],
    });

    const conversations = listConversations(cwd);
    const runs = listRuns(cwd, first.conversation.id);
    const messages = listMessages(cwd, first.conversation.id);

    assert.equal(first.conversation.id, second.conversation.id);
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0]?.title, "Pinchy watcher follow-ups");
    assert.equal(runs.length, 2);
    assert.equal(runs[0]?.kind, "watch_followup");
    assert.equal(runs[1]?.kind, "watch_followup");
    assert.match(messages[0]?.content ?? "", /Changed files:/);
    assert.match(messages[0]?.content ?? "", /apps\/host\/src\/daemon.ts/);
    assert.match(messages[0]?.content ?? "", /If no safe improvement is warranted, explain why and stop/i);
    assert.match(messages[1]?.content ?? "", /apps\/api\/src\/server.ts/);
  });
});

test("enqueueIterationRun persists a queued iteration run with validation guidance", () => {
  withTempDir((cwd) => {
    const scheduled = enqueueIterationRun(cwd, {
      cycle: 2,
      prompt: "Continuous iteration cycle 2.\n\nRun a bounded defect-hunting review.",
      validationCommand: "npm test",
    });

    const runs = listRuns(cwd, scheduled.conversation.id);
    const messages = listMessages(cwd, scheduled.conversation.id);
    const runContext = loadRunContext(cwd);

    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.status, "queued");
    assert.equal(runs[0]?.kind, "qa_cycle");
    assert.match(runs[0]?.goal ?? "", /Before deeper analysis, run validation if safe using: npm test/);
    assert.equal(messages.length, 1);
    assert.match(messages[0]?.content ?? "", /run_validation_command/);
    assert.equal(runContext?.currentRunLabel, "iteration:2");
  });
});

test("enqueueQueuedTaskRun persists a queued manual task as a background run", () => {
  withTempDir((cwd) => {
    const scheduled = enqueueQueuedTaskRun(cwd, {
      title: "Investigate flaky test",
      prompt: "Check the flaky worker test and fix it safely.",
    });

    const conversations = listConversations(cwd);
    const runs = listRuns(cwd, scheduled.conversation.id);
    const messages = listMessages(cwd, scheduled.conversation.id);
    const history = loadRunHistory(cwd);

    assert.equal(conversations[0]?.title, "Pinchy queued tasks");
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.status, "queued");
    assert.equal(runs[0]?.kind, "queued_task");
    assert.match(runs[0]?.goal ?? "", /Queued task: Investigate flaky test/);
    assert.equal(messages.length, 1);
    assert.match(messages[0]?.content ?? "", /Prefer documentation, tests, guardrails/);
    assert.equal(history[0]?.kind, "task");
    assert.match(history[0]?.details ?? "", /queued run/i);
  });
});
