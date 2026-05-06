import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearCompletedTasks, deleteTask, enqueueDelegationPlan, enqueueTask, getNextPendingTask, loadTasks, reprioritizeTask, updateTaskStatus, updateTaskStatusByExecutionRunId } from "../apps/host/src/task-queue.js";
import { loadOrchestrationEvents, loadOrchestrationTasks } from "../apps/host/src/orchestration-core/adapters/file-repositories.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadTasks ignores corrupted parseable task storage instead of returning invalid data", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-tasks.json"), JSON.stringify({ broken: true }), "utf8");

    assert.deepEqual(loadTasks(cwd), []);
    assert.equal(getNextPendingTask(cwd), undefined);
  });
});

test("loadTasks filters out invalid persisted task entries before queue helpers inspect them", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-tasks.json"), JSON.stringify([
      { broken: true },
      {
        id: "task-1",
        title: "Valid task",
        prompt: "Inspect the edge case.",
        status: "pending",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]), "utf8");

    assert.deepEqual(loadTasks(cwd).map((task) => task.id), ["task-1"]);
    assert.equal(getNextPendingTask(cwd)?.id, "task-1");
  });
});

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
      executionRunId: "run-child-1",
    });

    assert.equal(task.source, "user");
    assert.equal(task.conversationId, "conversation-1");
    assert.equal(task.runId, "run-1");
    assert.equal(task.executionRunId, "run-child-1");
    assert.equal(loadTasks(cwd)[0]?.conversationId, "conversation-1");
    assert.equal(loadTasks(cwd)[0]?.executionRunId, "run-child-1");
    assert.deepEqual(loadOrchestrationTasks(cwd).map((entry) => ({
      id: entry.id,
      parentRunId: entry.parentRunId,
      title: entry.title,
      status: entry.status,
    })), [
      {
        id: task.id,
        parentRunId: "run-1",
        title: "Audit worker logs",
        status: "ready",
      },
    ]);
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), ["TaskReady"]);
  });
});

test("enqueueTask trims and filters dependency ids so invalid input does not block ready work", () => {
  withTempDir((cwd) => {
    const dependency = enqueueTask(cwd, "Inspect logs", "Inspect logs first.");
    const dependent = enqueueTask(cwd, "Apply fix", "Apply the smallest safe fix.", {
      dependsOnTaskIds: ["  ", `  ${dependency.id}  `, "", null] as unknown as string[],
    });

    assert.deepEqual(dependent.dependsOnTaskIds, [dependency.id]);
    assert.deepEqual(loadTasks(cwd).find((task) => task.id === dependent.id)?.dependsOnTaskIds, [dependency.id]);
    assert.equal(getNextPendingTask(cwd)?.id, dependency.id);

    updateTaskStatus(cwd, dependency.id, "done");

    assert.equal(getNextPendingTask(cwd)?.id, dependent.id);
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
      executionRunId: "run-child-1",
    });

    assert.equal(updated?.conversationId, "conversation-1");
    assert.equal(updated?.runId, "run-1");
    assert.equal(updated?.executionRunId, "run-child-1");
    assert.equal(loadTasks(cwd)[0]?.conversationId, "conversation-1");
    assert.equal(loadTasks(cwd)[0]?.runId, "run-1");
    assert.equal(loadTasks(cwd)[0]?.executionRunId, "run-child-1");
    assert.equal(loadOrchestrationTasks(cwd)[0]?.status, "done");
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), ["TaskCompleted"]);
  });
});

test("updateTaskStatusByExecutionRunId resolves tasks by delegated execution run ids", () => {
  withTempDir((cwd) => {
    const task = enqueueTask(cwd, "Test task", "Do a thing", {
      runId: "parent-run-1",
      executionRunId: "child-run-1",
    });

    const updated = updateTaskStatusByExecutionRunId(cwd, "child-run-1", "running");

    assert.equal(updated?.id, task.id);
    assert.equal(updated?.status, "running");
    assert.equal(loadTasks(cwd)[0]?.status, "running");
  });
});


test("enqueueDelegationPlan persists dependent subtasks and only exposes ready work", () => {
  withTempDir((cwd) => {
    const tasks = enqueueDelegationPlan(cwd, [
      {
        id: "inspect",
        title: "Inspect logs",
        prompt: "Inspect the logs and summarize the issue.",
      },
      {
        id: "fix",
        title: "Apply fix",
        prompt: "Apply the smallest safe fix.",
        dependsOn: ["inspect"],
      },
    ], {
      source: "user",
      conversationId: "conversation-1",
      runId: "run-1",
    });

    assert.equal(tasks.length, 2);
    assert.equal(getNextPendingTask(cwd)?.title, "Inspect logs");
    assert.deepEqual(loadTasks(cwd).find((task) => task.title === "Apply fix")?.dependsOnTaskIds, [tasks[0]?.id]);
    const initialOrchestrationTasks = loadOrchestrationTasks(cwd);
    assert.deepEqual(initialOrchestrationTasks.find((task) => task.title === "Inspect logs") && {
      status: initialOrchestrationTasks.find((task) => task.title === "Inspect logs")?.status,
      dependsOnTaskIds: initialOrchestrationTasks.find((task) => task.title === "Inspect logs")?.dependsOnTaskIds,
    }, {
      status: "ready",
      dependsOnTaskIds: [],
    });
    assert.deepEqual(initialOrchestrationTasks.find((task) => task.title === "Apply fix") && {
      status: initialOrchestrationTasks.find((task) => task.title === "Apply fix")?.status,
      dependsOnTaskIds: initialOrchestrationTasks.find((task) => task.title === "Apply fix")?.dependsOnTaskIds,
    }, {
      status: "pending",
      dependsOnTaskIds: [tasks[0]?.id],
    });
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), ["RunPlanned", "TaskReady"]);

    updateTaskStatus(cwd, tasks[0]!.id, "done");

    assert.equal(getNextPendingTask(cwd)?.title, "Apply fix");
    const updatedOrchestrationTasks = loadOrchestrationTasks(cwd);
    assert.equal(updatedOrchestrationTasks.find((task) => task.title === "Inspect logs")?.status, "done");
    assert.equal(updatedOrchestrationTasks.find((task) => task.title === "Apply fix")?.status, "ready");
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), ["RunPlanned", "TaskReady", "TaskCompleted", "TaskReady"]);
  });
});

test("enqueueDelegationPlan trims whitespace around dependency ids before linking tasks", () => {
  withTempDir((cwd) => {
    const tasks = enqueueDelegationPlan(cwd, [
      {
        id: "inspect",
        title: "Inspect logs",
        prompt: "Inspect the logs and summarize the issue.",
      },
      {
        id: "fix",
        title: "Apply fix",
        prompt: "Apply the smallest safe fix.",
        dependsOn: [" inspect "],
      },
    ]);

    assert.deepEqual(tasks[1]?.dependsOnTaskIds, [tasks[0]?.id]);
    assert.equal(getNextPendingTask(cwd)?.title, "Inspect logs");
  });
});

test("enqueueDelegationPlan ignores invalid dependency entries instead of throwing", () => {
  withTempDir((cwd) => {
    const tasks = enqueueDelegationPlan(cwd, [
      {
        id: "inspect",
        title: "Inspect logs",
        prompt: "Inspect the logs and summarize the issue.",
      },
      {
        id: "fix",
        title: "Apply fix",
        prompt: "Apply the smallest safe fix.",
        dependsOn: [" inspect ", null, 42] as unknown as string[],
      },
    ]);

    assert.deepEqual(tasks[1]?.dependsOnTaskIds, [tasks[0]?.id]);
    assert.equal(getNextPendingTask(cwd)?.title, "Inspect logs");
  });
});

test("reprioritizeTask moves queued work earlier in the persisted task order", () => {
  withTempDir((cwd) => {
    const first = enqueueTask(cwd, "First", "Do first");
    const second = enqueueTask(cwd, "Second", "Do second");
    const third = enqueueTask(cwd, "Third", "Do third");

    const moved = reprioritizeTask(cwd, third.id, "up");

    assert.equal(moved?.id, third.id);
    assert.deepEqual(loadTasks(cwd).map((task) => task.id), [first.id, third.id, second.id]);
  });
});

test("reprioritizeTask can move queued work to the top of the persisted task order", () => {
  withTempDir((cwd) => {
    const first = enqueueTask(cwd, "First", "Do first");
    const second = enqueueTask(cwd, "Second", "Do second");
    const third = enqueueTask(cwd, "Third", "Do third");

    const moved = reprioritizeTask(cwd, third.id, "top");

    assert.equal(moved?.id, third.id);
    assert.deepEqual(loadTasks(cwd).map((task) => task.id), [third.id, first.id, second.id]);
  });
});

test("deleteTask removes a persisted task record", () => {
  withTempDir((cwd) => {
    const first = enqueueTask(cwd, "First", "Do first");
    const second = enqueueTask(cwd, "Second", "Do second");

    const deleted = deleteTask(cwd, first.id);

    assert.equal(deleted?.id, first.id);
    assert.deepEqual(loadTasks(cwd).map((task) => task.id), [second.id]);
  });
});

test("clearCompletedTasks removes completed task history while preserving active work", () => {
  withTempDir((cwd) => {
    const doneTask = enqueueTask(cwd, "Done", "Completed already");
    const pendingTask = enqueueTask(cwd, "Pending", "Still queued");
    updateTaskStatus(cwd, doneTask.id, "done");

    const removed = clearCompletedTasks(cwd);

    assert.equal(removed.length, 1);
    assert.equal(removed[0]?.id, doneTask.id);
    assert.deepEqual(loadTasks(cwd).map((task) => task.id), [pendingTask.id]);
  });
});
