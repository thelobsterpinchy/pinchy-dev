import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentGuidance, createConversation, createHumanReply, createQuestion, markQuestionAnswered } from "../apps/host/src/agent-state-store.js";
import { FileBackedAgentRunRepository, FileBackedEventRecorder, FileBackedTaskRepository, loadOrchestrationEvents } from "../apps/host/src/orchestration-core/adapters/file-repositories.js";
import { recordAgentBlockedQuestion, recordGuidanceQueued, recordHumanReplyReceived } from "../apps/host/src/orchestration-core/application/human-interactions.js";
import type { AgentRun, OrchestrationTask } from "../packages/shared/src/contracts.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-orchestration-human-"));
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

async function seedCoreRun(cwd: string) {
  const taskRepository = new FileBackedTaskRepository(cwd);
  const agentRunRepository = new FileBackedAgentRunRepository(cwd);
  const eventRecorder = new FileBackedEventRecorder(cwd);
  const task: OrchestrationTask = {
    id: "task-1",
    parentRunId: "parent-run-1",
    title: "Inspect worker",
    prompt: "Find the issue.",
    status: "running",
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

test("orchestration-core records blocked child questions against core task and agent-run state", async () => {
  await withTempDir(async (cwd) => {
    createConversation(cwd, { title: "Parent thread" });
    const repos = await seedCoreRun(cwd);
    const question = createQuestion(cwd, {
      conversationId: "conversation-1",
      runId: "child-run-1",
      agentRunId: "agent-run-task-1",
      taskId: "task-1",
      prompt: "Which branch should I target?",
      priority: "high",
    });

    await recordAgentBlockedQuestion({
      ...repos,
      clock,
      backendRunRef: "child-run-1",
      question,
    });

    assert.equal((await repos.agentRunRepository.get("agent-run-task-1"))?.status, "blocked");
    assert.equal((await repos.taskRepository.get("task-1"))?.status, "blocked");
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), ["AgentBlockedWithQuestion"]);
  });
});

test("orchestration-core records human replies and guidance for Pi-backed child agents", async () => {
  await withTempDir(async (cwd) => {
    createConversation(cwd, { title: "Parent thread" });
    const repos = await seedCoreRun(cwd);
    const question = createQuestion(cwd, {
      conversationId: "conversation-1",
      runId: "child-run-1",
      agentRunId: "agent-run-task-1",
      taskId: "task-1",
      prompt: "Which branch should I target?",
      priority: "normal",
    });
    await recordAgentBlockedQuestion({ ...repos, clock, backendRunRef: "child-run-1", question });
    const reply = createHumanReply(cwd, {
      questionId: question.id,
      conversationId: "conversation-1",
      channel: "dashboard",
      content: "Use main.",
    });
    markQuestionAnswered(cwd, question.id);
    const guidance = createAgentGuidance(cwd, {
      conversationId: "conversation-1",
      taskId: "task-1",
      runId: "child-run-1",
      agentRunId: "agent-run-task-1",
      content: "Keep it scoped.",
    });

    await recordHumanReplyReceived({ ...repos, clock, question, reply });
    await recordGuidanceQueued({ ...repos, clock, guidance });

    assert.equal((await repos.agentRunRepository.get("agent-run-task-1"))?.status, "running");
    assert.equal((await repos.taskRepository.get("task-1"))?.status, "running");
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), [
      "AgentBlockedWithQuestion",
      "HumanReplyReceived",
      "GuidanceQueued",
    ]);
  });
});
