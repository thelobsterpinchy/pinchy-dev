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

test("updateTaskStatus updates a queued task", () => {
  withTempDir((cwd) => {
    const task = enqueueTask(cwd, "Test task", "Do a thing");
    const updated = updateTaskStatus(cwd, task.id, "done");
    assert.equal(updated?.status, "done");
    assert.equal(getNextPendingTask(cwd), undefined);
  });
});
