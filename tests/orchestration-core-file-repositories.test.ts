import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnReadyAgents } from "../apps/host/src/orchestration-core/application/spawn-ready-agents.js";
import {
  FileBackedAgentRunRepository,
  FileBackedEventRecorder,
  FileBackedTaskRepository,
  buildOrchestrationMemorySnapshot,
  getOrchestrationEventsPath,
} from "../apps/host/src/orchestration-core/adapters/file-repositories.js";
import type {
  AgentExecutor,
  Clock,
  ContextAssembler,
  ModelSelectionStrategy,
} from "../apps/host/src/orchestration-core/ports/index.js";
import type { OrchestrationTask } from "../packages/shared/src/contracts.js";

class StubContextAssembler implements ContextAssembler {
  async buildForTask(input: { parentRunId: string; taskId: string; conversationId: string }) {
    return {
      objective: `Objective for ${input.taskId}`,
      constraints: ["keep orchestration state in Pinchy"],
      repoFacts: [`conversation:${input.conversationId}`],
      dependencyOutputs: [],
    };
  }
}

class StubModelSelectionStrategy implements ModelSelectionStrategy {
  async chooseForTask() {
    return {
      backend: "pi",
      modelProfile: "subagent-default",
    } as const;
  }
}

class StubAgentExecutor implements AgentExecutor {
  backend() {
    return "pi" as const;
  }

  async start(request: Parameters<AgentExecutor["start"]>[0]) {
    return {
      backend: "pi",
      backendRunRef: `pi:${request.taskId}`,
    } as const;
  }

  async poll(): Promise<{ state: "running" }> {
    throw new Error("not implemented");
  }

  async sendGuidance(): Promise<void> {
    throw new Error("not implemented");
  }

  async answerQuestion(): Promise<void> {
    throw new Error("not implemented");
  }

  async cancel(): Promise<void> {
    throw new Error("not implemented");
  }
}

class FixedClock implements Clock {
  nowIso() {
    return "2026-05-04T12:00:00.000Z";
  }
}

test("file-backed orchestration repositories persist spawn-ready-agent state", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-orchestration-core-files-"));
  const taskRepository = new FileBackedTaskRepository(cwd);
  const agentRunRepository = new FileBackedAgentRunRepository(cwd);
  const eventRecorder = new FileBackedEventRecorder(cwd);

  await taskRepository.save({
    id: "task-1",
    parentRunId: "run-parent",
    title: "Inspect current coupling",
    prompt: "Trace orchestration and executor boundaries.",
    status: "ready",
    dependsOnTaskIds: [],
    createdAt: "2026-05-04T11:00:00.000Z",
    updatedAt: "2026-05-04T11:00:00.000Z",
  });

  const started = await spawnReadyAgents({
    parentRunId: "run-parent",
    conversationId: "conversation-1",
    parentRunKind: "user_prompt",
    taskRepository,
    agentRunRepository,
    contextAssembler: new StubContextAssembler(),
    modelSelection: new StubModelSelectionStrategy(),
    executor: new StubAgentExecutor(),
    clock: new FixedClock(),
    eventRecorder,
  });

  assert.equal(started, 1);
  assert.deepEqual((await taskRepository.listByRun("run-parent")).map((task) => ({
    id: task.id,
    status: task.status,
    assignedAgentRunId: task.assignedAgentRunId,
  })), [
    {
      id: "task-1",
      status: "running",
      assignedAgentRunId: "agent-run-task-1",
    },
  ]);
  assert.deepEqual((await agentRunRepository.listByParentRun("run-parent")).map((agentRun) => ({
    id: agentRun.id,
    taskId: agentRun.taskId,
    backend: agentRun.backend,
    backendRunRef: agentRun.backendRunRef,
    modelProfile: agentRun.modelProfile,
  })), [
    {
      id: "agent-run-task-1",
      taskId: "task-1",
      backend: "pi",
      backendRunRef: "pi:task-1",
      modelProfile: "subagent-default",
    },
  ]);
  assert.deepEqual((await eventRecorder.listByRun("run-parent")).map((event) => event.type), ["AgentStarted"]);
});

test("orchestration event recorder appends json lines and tolerates malformed history", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-orchestration-events-"));
  const recorder = new FileBackedEventRecorder(cwd);

  await recorder.record({
    type: "RunCreated",
    runId: "run-1",
    conversationId: "conversation-1",
    at: "2026-05-04T12:00:00.000Z",
  });
  writeFileSync(getOrchestrationEventsPath(cwd), "\n{not json}\n", { flag: "a" });
  await recorder.record({
    type: "TaskReady",
    runId: "run-1",
    taskId: "task-1",
    at: "2026-05-04T12:00:01.000Z",
  });

  const raw = readFileSync(getOrchestrationEventsPath(cwd), "utf8");
  assert.equal(raw.split("\n").filter((line) => line.trim()).length, 3);
  assert.deepEqual((await recorder.listByRun("run-1")).map((event) => event.type), ["RunCreated", "TaskReady"]);
});

test("orchestration memory snapshot is scoped to one parent run", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-orchestration-memory-"));
  const taskRepository = new FileBackedTaskRepository(cwd);
  const agentRunRepository = new FileBackedAgentRunRepository(cwd);
  const eventRecorder = new FileBackedEventRecorder(cwd);

  const tasks: OrchestrationTask[] = [
    {
      id: "task-1",
      parentRunId: "run-1",
      title: "Patch core",
      prompt: "Add file repositories.",
      status: "done",
      dependsOnTaskIds: [],
      outputSummary: "Core repositories added.",
      createdAt: "2026-05-04T11:00:00.000Z",
      updatedAt: "2026-05-04T12:00:00.000Z",
    },
    {
      id: "task-2",
      parentRunId: "run-2",
      title: "Unrelated",
      prompt: "Do not include this.",
      status: "ready",
      dependsOnTaskIds: [],
      createdAt: "2026-05-04T11:00:00.000Z",
      updatedAt: "2026-05-04T11:00:00.000Z",
    },
  ];

  for (const task of tasks) {
    await taskRepository.save(task);
  }
  await agentRunRepository.save({
    id: "agent-run-1",
    parentRunId: "run-1",
    conversationId: "conversation-1",
    taskId: "task-1",
    backend: "pi",
    backendRunRef: "pi-session-1",
    status: "completed",
    goal: "Add file repositories.",
    modelProfile: "subagent-default",
    createdAt: "2026-05-04T11:00:00.000Z",
    updatedAt: "2026-05-04T12:00:00.000Z",
  });
  await eventRecorder.record({
    type: "TaskCompleted",
    runId: "run-1",
    taskId: "task-1",
    at: "2026-05-04T12:00:00.000Z",
  });

  const snapshot = await buildOrchestrationMemorySnapshot(cwd, "run-1");

  assert.deepEqual(snapshot.tasks.map((task) => task.id), ["task-1"]);
  assert.deepEqual(snapshot.agentRuns.map((agentRun) => agentRun.id), ["agent-run-1"]);
  assert.deepEqual(snapshot.events.map((event) => event.type), ["TaskCompleted"]);
  assert.equal(snapshot.completedTaskSummaries, "Patch core: Core repositories added.");
});
