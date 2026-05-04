import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildObservableTasks } from "../apps/host/src/task-observability.js";
import { createConversation, createRun, setConversationSessionBinding, updateRunStatus } from "../apps/host/src/agent-state-store.js";
import { enqueueTask, updateTaskStatus } from "../apps/host/src/task-queue.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-observability-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("buildObservableTasks prefers executionRunId over parent runId for linked delegated task diagnostics", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Main orchestration thread" });
    const parentRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Coordinate background work",
    });
    const childRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Queued task: Inspect worker logs",
      kind: "queued_task",
    });

    updateRunStatus(cwd, parentRun.id, "completed", {
      summary: "Parent thread finished planning.",
    });
    updateRunStatus(cwd, childRun.id, "running", {
      sessionPath: "/tmp/pi-child-run.json",
    });
    setConversationSessionBinding(cwd, {
      conversationId: conversation.id,
      sessionPath: "/tmp/pi-thread-session.json",
      sourceRunId: parentRun.id,
    });

    const task = enqueueTask(cwd, "Inspect worker logs", "Inspect worker logs safely.", {
      conversationId: conversation.id,
      runId: parentRun.id,
    });
    updateTaskStatus(cwd, task.id, "running", {
      conversationId: conversation.id,
      runId: parentRun.id,
      executionRunId: childRun.id,
    });

    const observableTask = buildObservableTasks(cwd).find((entry) => entry.id === task.id);

    assert.equal(observableTask?.execution?.queueState, "linked_run");
    assert.equal(observableTask?.execution?.linkedRunStatus, "running");
    assert.equal(observableTask?.execution?.sessionPath, "/tmp/pi-child-run.json");
    assert.equal(observableTask?.execution?.conversationSessionPath, "/tmp/pi-thread-session.json");
  });
});
