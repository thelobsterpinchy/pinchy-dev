import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import taskInbox from "../.pi/extensions/task-inbox/index.js";
import { createConversation, createRun } from "../apps/host/src/agent-state-store.js";
import { enqueueTask, loadTasks } from "../apps/host/src/task-queue.js";
import { setRunContext } from "../apps/host/src/run-context.js";

function createHarness(cwd: string) {
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const notifications: Array<{ message: string; level: string }> = [];
  const pi = {
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
    registerCommand(name: string, definition: any) {
      commands.set(name, definition);
    },
  };

  taskInbox(pi as never);
  return {
    tools,
    commands,
    notifications,
    ctx: {
      cwd,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    },
  };
}

test("queue_task links delegated work to the current conversation and run context", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-inbox-"));
  try {
    const conversation = createConversation(cwd, { title: "Main orchestration thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Investigate bug",
      kind: "user_prompt",
    });
    setRunContext(cwd, {
      currentRunId: run.id,
      currentRunLabel: "Investigate bug",
      currentConversationId: conversation.id,
      updatedAt: "2026-04-26T00:00:00.000Z",
    });

    const harness = createHarness(cwd);
    const tool = harness.tools.get("queue_task");

    await tool.execute(
      "call-1",
      { title: "Inspect sidebar", prompt: "Inspect the details sidebar." },
      undefined,
      undefined,
      { cwd },
    );

    assert.deepEqual(loadTasks(cwd).map((task) => ({
      title: task.title,
      conversationId: task.conversationId,
      runId: task.runId,
      source: task.source,
    })), [
      {
        title: "Inspect sidebar",
        conversationId: conversation.id,
        runId: run.id,
        source: "agent",
      },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("delegate_task_plan links all delegated subtasks to the current conversation and run context", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-inbox-plan-"));
  try {
    const conversation = createConversation(cwd, { title: "Main orchestration thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Coordinate background work",
      kind: "user_prompt",
    });
    setRunContext(cwd, {
      currentRunId: run.id,
      currentRunLabel: "Coordinate background work",
      currentConversationId: conversation.id,
      updatedAt: "2026-04-26T00:00:00.000Z",
    });

    const harness = createHarness(cwd);
    const tool = harness.tools.get("delegate_task_plan");

    await tool.execute(
      "call-2",
      {
        tasks: [
          { id: "inspect", title: "Inspect logs", prompt: "Inspect logs." },
          { id: "fix", title: "Apply fix", prompt: "Apply fix.", dependsOn: ["inspect"] },
        ],
      },
      undefined,
      undefined,
      { cwd },
    );

    const tasks = loadTasks(cwd);
    assert.equal(tasks.length, 2);
    assert.ok(tasks.every((task) => task.conversationId === conversation.id));
    assert.ok(tasks.every((task) => task.runId === run.id));
    assert.ok(tasks.every((task) => task.source === "agent"));
    assert.equal(tasks.find((task) => task.title === "Apply fix")?.dependsOnTaskIds?.length, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("delegated or background runs cannot spawn more subagents", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-inbox-nested-"));
  try {
    const conversation = createConversation(cwd, { title: "Pinchy queued tasks" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Queued task: inspect worker scheduling",
      kind: "user_prompt",
    });
    setRunContext(cwd, {
      currentRunId: run.id,
      currentRunLabel: run.goal,
      currentConversationId: conversation.id,
      updatedAt: "2026-04-26T00:00:00.000Z",
    });

    const harness = createHarness(cwd);
    const queueTask = harness.tools.get("queue_task");
    const delegatePlan = harness.tools.get("delegate_task_plan");

    await assert.rejects(
      () => queueTask.execute(
        "call-3",
        { title: "Nested task", prompt: "Should not be allowed." },
        undefined,
        undefined,
        { cwd },
      ),
      /Only the main orchestration thread may spawn subagents/i,
    );

    await assert.rejects(
      () => delegatePlan.execute(
        "call-4",
        { tasks: [{ title: "Nested plan task", prompt: "Should not be allowed." }] },
        undefined,
        undefined,
        { cwd },
      ),
      /Only the main orchestration thread may spawn subagents/i,
    );

    assert.equal(loadTasks(cwd).length, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tasks command reports when no work is queued", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-inbox-empty-command-"));
  try {
    const harness = createHarness(cwd);

    await harness.commands.get("tasks").handler(undefined, harness.ctx);

    assert.deepEqual(harness.notifications, [
      { message: "No tasks queued.", level: "info" },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("complete-task marks a task done and tasks command reports the updated status", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-inbox-command-"));
  try {
    const createdTask = enqueueTask(cwd, "Inspect dashboard", "Inspect the dashboard task list.");
    const harness = createHarness(cwd);

    await harness.commands.get("complete-task").handler(createdTask.id, harness.ctx);
    await harness.commands.get("tasks").handler(undefined, harness.ctx);

    assert.deepEqual(harness.notifications, [
      { message: `Marked ${createdTask.id} done`, level: "info" },
      { message: `${createdTask.id} [done] Inspect dashboard`, level: "info" },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("complete-task requires an id and reports missing tasks", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-task-inbox-command-errors-"));
  try {
    const harness = createHarness(cwd);

    await harness.commands.get("complete-task").handler("   ", harness.ctx);
    await harness.commands.get("complete-task").handler("missing-task", harness.ctx);

    assert.deepEqual(harness.notifications, [
      { message: "Usage: /complete-task <id>", level: "error" },
      { message: "Task not found: missing-task", level: "error" },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
