import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enqueueTask, getNextPendingTask, loadTasks, updateTaskStatus } from "../apps/host/src/task-queue.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("enqueueTask stores a pending task", () => {
  withTempDir((cwd) => {
    const task = enqueueTask(cwd, "Test task", "Do a thing");
    assert.equal(task.status, "pending");
    assert.equal(loadTasks(cwd).length, 1);
    assert.equal(getNextPendingTask(cwd)?.id, task.id);
  });
});

test("enqueueTask can persist orchestration links when a task is spawned from chat", () => {
  withTempDir((cwd) => {
    const task = enqueueTask(cwd, "Audit worker logs", "Inspect the worker logs and report bounded findings.", {
      source: "user",
      conversationId: "conversation-1",
      runId: "run-1",
    });

    assert.equal(task.source, "user");
    assert.equal(task.conversationId, "conversation-1");
    assert.equal(task.runId, "run-1");
    assert.equal(loadTasks(cwd)[0]?.conversationId, "conversation-1");
  });
});

test("updateTaskStatus updates a queued task", () => {
  withTempDir((cwd) => {
    const task = enqueueTask(cwd, "Test task", "Do a thing");
    const updated = updateTaskStatus(cwd, task.id, "done");
    assert.equal(updated?.status, "done");
    assert.equal(getNextPendingTask(cwd), undefined);
  });
});

test("updateTaskStatus can persist linked conversation and run ids", () => {
  withTempDir((cwd) => {
    const task = enqueueTask(cwd, "Test task", "Do a thing");
    const updated = updateTaskStatus(cwd, task.id, "done", {
      conversationId: "conversation-1",
      runId: "run-1",
    });

    assert.equal(updated?.conversationId, "conversation-1");
    assert.equal(updated?.runId, "run-1");
    assert.equal(loadTasks(cwd)[0]?.conversationId, "conversation-1");
    assert.equal(loadTasks(cwd)[0]?.runId, "run-1");
  });
});
