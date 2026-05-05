import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBackedAgentRunRepository, FileBackedEventRecorder, FileBackedTaskRepository, loadOrchestrationEvents } from "../apps/host/src/orchestration-core/adapters/file-repositories.js";
import { buildOrchestrationProgressSnapshot, markRunReadyForSynthesis, recordAgentFinished, recordRunSummarized } from "../apps/host/src/orchestration-core/application/completion-synthesis.js";
import type { AgentRun, OrchestrationTask } from "../packages/shared/src/contracts.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-orchestration-completion-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

const clock = {
  nowIso() {
    return "2026-05-04T12:00:00.000Z";
  },
};

async function seedCoreRun(cwd: string, taskStatus: OrchestrationTask["status"] = "running") {
  const taskRepository = new FileBackedTaskRepository(cwd);
  const agentRunRepository = new FileBackedAgentRunRepository(cwd);
  const eventRecorder = new FileBackedEventRecorder(cwd);
  const task: OrchestrationTask = {
    id: "task-1",
    parentRunId: "parent-run-1",
    title: "Inspect worker",
    prompt: "Find the issue.",
    status: taskStatus,
    dependsOnTaskIds: [],
    assignedAgentRunId: "agent-run-task-1",
    createdAt: "2026-05-04T11:00:00.000Z",
    updatedAt: "2026-05-04T11:00:00.000Z",
  };
  const agentRun: AgentRun = {
    id: "agent-run-task-1",
    parentRunId: "parent-run-1",
    conversationId: "conversation-1",
    taskId: "task-1",
    backend: "pi",
    backendRunRef: "child-run-1",
    status: "running",
    goal: "Find the issue.",
    modelProfile: "pi-default",
    createdAt: "2026-05-04T11:00:00.000Z",
    updatedAt: "2026-05-04T11:00:00.000Z",
  };
  await taskRepository.save(task);
  await agentRunRepository.save(agentRun);
  return { taskRepository, agentRunRepository, eventRecorder };
}

test("recordAgentFinished updates core task and agent state for completed child agents", async () => {
  await withTempDir(async (cwd) => {
    const repos = await seedCoreRun(cwd);

    await recordAgentFinished({
      ...repos,
      clock,
      backendRunRef: "child-run-1",
      outcome: { kind: "completed", summary: "Worker issue fixed." },
    });

    const task = await repos.taskRepository.get("task-1");
    const agentRun = await repos.agentRunRepository.get("agent-run-task-1");

    assert.equal(task?.status, "done");
    assert.equal(task?.outputSummary, "Worker issue fixed.");
    assert.equal(agentRun?.status, "completed");
    assert.equal(agentRun?.resultSummary, "Worker issue fixed.");
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), ["AgentCompleted", "TaskCompleted"]);
  });
});

test("orchestration progress snapshots and synthesis events reflect completed core work", async () => {
  await withTempDir(async (cwd) => {
    const repos = await seedCoreRun(cwd, "done");
    await repos.agentRunRepository.save({
      ...(await repos.agentRunRepository.get("agent-run-task-1"))!,
      status: "completed",
      resultSummary: "Worker issue fixed.",
    });

    const progress = await buildOrchestrationProgressSnapshot({
      taskRepository: repos.taskRepository,
      agentRunRepository: repos.agentRunRepository,
      eventRecorder: repos.eventRecorder,
      parentRunId: "parent-run-1",
    });
    await markRunReadyForSynthesis({ ...repos, clock, parentRunId: "parent-run-1" });
    await markRunReadyForSynthesis({ ...repos, clock, parentRunId: "parent-run-1" });
    await recordRunSummarized({ ...repos, clock, parentRunId: "parent-run-1" });

    assert.equal(progress.totalTasks, 1);
    assert.equal(progress.taskCounts.done, 1);
    assert.equal(progress.readyForSynthesis, true);
    assert.equal(progress.completedAgentRuns.length, 1);
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), ["RunReadyForSynthesis", "RunSummarized"]);
  });
});
