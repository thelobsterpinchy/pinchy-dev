import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation, createRun } from "../apps/host/src/agent-state-store.js";
import { loadDaemonHealth } from "../apps/host/src/daemon-health.js";
import { loadRunHistory } from "../apps/host/src/run-history.js";
import { loadTasks, enqueueDelegationPlan, enqueueTask, updateTaskStatus } from "../apps/host/src/task-queue.js";
import { processNextPendingTaskRun, processPendingTaskRuns, resolveGoals } from "../apps/host/src/pinchy-daemon.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-daemon-task-runs-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("processNextPendingTaskRun enqueues the next pending task as a persistent run and leaves the task running until the subagent run finishes", async () => {
  await withTempDir(async (cwd) => {
    const task = enqueueTask(cwd, "Investigate flaky test", "Check the flaky worker test and fix it safely.");

    const scheduled = await processNextPendingTaskRun(cwd, {
      enqueueTaskRun: async () => {
        const conversation = createConversation(cwd, { title: "Pinchy queued tasks" });
        const run = createRun(cwd, {
          conversationId: conversation.id,
          goal: "Queued task: Investigate flaky test",
          kind: "user_prompt",
        });
        return { conversation, run };
      },
    });

    const tasks = loadTasks(cwd);
    assert.equal(scheduled?.task.id, task.id);
    assert.equal(tasks[0]?.status, "running");
    assert.equal(tasks[0]?.conversationId, scheduled?.conversation.id);
    assert.equal(tasks[0]?.runId, scheduled?.run.id);
    assert.equal(tasks[0]?.executionRunId, scheduled?.run.id);
  });
});

test("processNextPendingTaskRun preserves the parent orchestration run and stores a distinct child execution run", async () => {
  await withTempDir(async (cwd) => {
    const parentConversation = createConversation(cwd, { title: "Main orchestration thread" });
    const parentRun = createRun(cwd, {
      conversationId: parentConversation.id,
      goal: "Coordinate background work",
    });
    const task = enqueueTask(cwd, "Investigate flaky test", "Check the flaky worker test and fix it safely.", {
      conversationId: parentConversation.id,
      runId: parentRun.id,
    });

    const scheduled = await processNextPendingTaskRun(cwd, {
      enqueueTaskRun: async () => {
        const conversation = createConversation(cwd, { title: "Pinchy queued tasks" });
        const run = createRun(cwd, {
          conversationId: conversation.id,
          goal: "Queued task: Investigate flaky test",
          kind: "user_prompt",
        });
        return { conversation, run };
      },
    });

    const persistedTask = loadTasks(cwd).find((entry) => entry.id === task.id);
    assert.equal(persistedTask?.status, "running");
    assert.equal(persistedTask?.conversationId, parentConversation.id);
    assert.equal(persistedTask?.runId, parentRun.id);
    assert.equal(persistedTask?.executionRunId, scheduled?.run.id);
  });
});

test("processNextPendingTaskRun returns undefined when no pending task exists", async () => {
  await withTempDir(async (cwd) => {
    const scheduled = await processNextPendingTaskRun(cwd, {
      enqueueTaskRun: async () => {
        throw new Error("should not enqueue");
      },
    });

    assert.equal(scheduled, undefined);
  });
});

test("processNextPendingTaskRun blocks the task and records failure details when enqueueing fails", async () => {
  await withTempDir(async (cwd) => {
    const task = enqueueTask(cwd, "Investigate flaky test", "Check the flaky worker test and fix it safely.");

    await assert.rejects(
      () => processNextPendingTaskRun(cwd, {
        enqueueTaskRun: async () => {
          throw new Error("queue unavailable");
        },
      }),
      /queue unavailable/,
    );

    const tasks = loadTasks(cwd);
    const history = loadRunHistory(cwd);
    const health = loadDaemonHealth(cwd);

    assert.equal(tasks[0]?.id, task.id);
    assert.equal(tasks[0]?.status, "blocked");
    assert.equal(history[0]?.kind, "task");
    assert.equal(history[0]?.status, "failed");
    assert.match(history[0]?.details ?? "", /queue unavailable/);
    assert.equal(health?.status, "error");
    assert.match(health?.lastError ?? "", /queue unavailable/);
  });
});

test("processPendingTaskRuns schedules multiple ready tasks but leaves dependency-blocked work queued", async () => {
  await withTempDir(async (cwd) => {
    enqueueDelegationPlan(cwd, [
      { id: "inspect", title: "Inspect logs", prompt: "Inspect logs." },
      { id: "review", title: "Review UI", prompt: "Review UI." },
      { id: "fix", title: "Apply fix", prompt: "Apply fix.", dependsOn: ["inspect", "review"] },
    ]);

    const scheduledTitles: string[] = [];
    await processPendingTaskRuns(cwd, {
      enqueueTaskRun: async (_cwd, input) => {
        scheduledTitles.push(input.title);
        const conversation = createConversation(cwd, { title: "Pinchy queued tasks" });
        const run = createRun(cwd, {
          conversationId: conversation.id,
          goal: `Queued task: ${input.title}`,
          kind: "user_prompt",
        });
        return { conversation, run };
      },
    }, { limit: 4 });

    assert.deepEqual(scheduledTitles.sort(), ["Inspect logs", "Review UI"]);
    const tasksAfterFirstPass = loadTasks(cwd);
    const inspectTask = tasksAfterFirstPass.find((task) => task.title === "Inspect logs");
    const reviewTask = tasksAfterFirstPass.find((task) => task.title === "Review UI");
    const fixTask = tasksAfterFirstPass.find((task) => task.title === "Apply fix");
    assert.equal(fixTask?.status, "pending");

    updateTaskStatus(cwd, inspectTask!.id, "done");
    updateTaskStatus(cwd, reviewTask!.id, "done");

    await processPendingTaskRuns(cwd, {
      enqueueTaskRun: async (_cwd, input) => {
        scheduledTitles.push(input.title);
        const conversation = createConversation(cwd, { title: "Pinchy queued tasks" });
        const run = createRun(cwd, {
          conversationId: conversation.id,
          goal: `Queued task: ${input.title}`,
          kind: "user_prompt",
        });
        return { conversation, run };
      },
    }, { limit: 4 });

    assert.deepEqual(scheduledTitles.sort(), ["Apply fix", "Inspect logs", "Review UI"]);
  });
});

test("resolveGoals keeps the enabled flag so daemon goal cycles can be disabled", async () => {
  await withTempDir(async (cwd) => {
    writeFileSync(join(cwd, ".pinchy-goals.json"), JSON.stringify({ enabled: false, intervalMs: 1234, goals: ["demo"] }));

    const config = resolveGoals(cwd);

    assert.equal(config.enabled, false);
    assert.equal(config.intervalMs, 1234);
    assert.deepEqual(config.goals, ["demo"]);
  });
});
