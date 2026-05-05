import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation, createQuestion, createRun, getQuestionById, getRunById, listAgentGuidances, listMessages, listReplies, listRunCancellationRequests, updateRunStatus } from "../apps/host/src/agent-state-store.js";
import { PiAgentExecutor } from "../apps/host/src/orchestration-core/adapters/pi-agent-executor.js";
import { FileBackedAgentRunRepository, FileBackedEventRecorder, FileBackedTaskRepository, loadOrchestrationEvents } from "../apps/host/src/orchestration-core/adapters/file-repositories.js";
import { spawnReadyAgents } from "../apps/host/src/orchestration-core/application/spawn-ready-agents.js";
import { processNextQueuedRun } from "../services/agent-worker/src/worker.js";
import type { Clock, ContextAssembler, ModelSelectionStrategy } from "../apps/host/src/orchestration-core/ports/index.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-pi-agent-executor-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

function createExecutorRequest(conversationId: string) {
  return {
    parentRunId: "run-parent",
    taskId: "task-1",
    conversationId,
    goal: "Inspect the worker and report the smallest safe fix.",
    context: {
      objective: "Find the execution boundary",
      constraints: ["Do not change unrelated files"],
      repoFacts: ["Pinchy owns orchestration state"],
      dependencyOutputs: ["Prior task found the worker entrypoint"],
    },
    modelProfile: "pi-default",
  };
}

class FixedClock implements Clock {
  nowIso() {
    return "2026-05-04T12:00:00.000Z";
  }
}

class StubContextAssembler implements ContextAssembler {
  async buildForTask() {
    return {
      objective: "Execute a core task through Pi",
      constraints: ["stay bounded"],
      repoFacts: ["Pi is an executor"],
      dependencyOutputs: [],
    };
  }
}

class StubModelSelection implements ModelSelectionStrategy {
  async chooseForTask() {
    return {
      backend: "pi",
      modelProfile: "pi-default",
    } as const;
  }
}

test("PiAgentExecutor starts a queued Pi-backed child run through the existing run store", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Parent orchestration thread" });
    const executor = new PiAgentExecutor({ cwd });

    const handle = await executor.start(createExecutorRequest(conversation.id));
    const run = getRunById(cwd, handle.backendRunRef);

    assert.equal(handle.backend, "pi");
    assert.equal(run?.conversationId, conversation.id);
    assert.equal(run?.kind, "queued_task");
    assert.equal(run?.status, "queued");
    assert.match(run?.goal ?? "", /Task: Inspect the worker and report the smallest safe fix\./);
    assert.match(run?.goal ?? "", /Objective:\nFind the execution boundary/);
    assert.match(run?.goal ?? "", /Context constraints:\n- Do not change unrelated files/);
    assert.match(run?.goal ?? "", /Repository facts:\n- Pinchy owns orchestration state/);
    assert.match(run?.goal ?? "", /Dependency outputs:\n- Prior task found the worker entrypoint/);
    assert.match(run?.goal ?? "", /Model profile requested by orchestration-core: pi-default/);
  });
});

test("spawnReadyAgents can start a Pi-backed child run through the AgentExecutor port", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Parent orchestration thread" });
    const parentRun = createRun(cwd, { conversationId: conversation.id, goal: "Coordinate core child work", status: "running" });
    const taskRepository = new FileBackedTaskRepository(cwd);
    const agentRunRepository = new FileBackedAgentRunRepository(cwd);
    const eventRecorder = new FileBackedEventRecorder(cwd);
    await taskRepository.save({
      id: "task-1",
      parentRunId: parentRun.id,
      title: "Patch executor boundary",
      prompt: "Make Pi an executor.",
      status: "ready",
      dependsOnTaskIds: [],
      createdAt: "2026-05-04T11:00:00.000Z",
      updatedAt: "2026-05-04T11:00:00.000Z",
    });

    const started = await spawnReadyAgents({
      parentRunId: parentRun.id,
      conversationId: conversation.id,
      parentRunKind: "user_prompt",
      taskRepository,
      agentRunRepository,
      contextAssembler: new StubContextAssembler(),
      modelSelection: new StubModelSelection(),
      executor: new PiAgentExecutor({ cwd }),
      clock: new FixedClock(),
      eventRecorder,
    });

    const agentRun = (await agentRunRepository.listByParentRun(parentRun.id))[0];
    const executionRun = agentRun ? getRunById(cwd, agentRun.backendRunRef) : undefined;

    assert.equal(started, 1);
    assert.equal(agentRun?.backend, "pi");
    assert.equal(agentRun?.taskId, "task-1");
    assert.equal(executionRun?.kind, "queued_task");
    assert.equal(executionRun?.conversationId, conversation.id);
    assert.match(executionRun?.goal ?? "", /Make Pi an executor\./);
    assert.deepEqual((await eventRecorder.listByRun(parentRun.id)).map((event) => event.type), ["AgentStarted"]);
  });
});

test("PiAgentExecutor polls queued, running, completed, failed, cancelled, and missing runs", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Parent orchestration thread" });
    const parentRun = createRun(cwd, { conversationId: conversation.id, goal: "Coordinate core child work", status: "running" });
    const executor = new PiAgentExecutor({ cwd });
    const handle = await executor.start(createExecutorRequest(conversation.id));

    assert.deepEqual(await executor.poll(handle.backendRunRef), { state: "starting" });

    updateRunStatus(cwd, handle.backendRunRef, "running");
    assert.deepEqual(await executor.poll(handle.backendRunRef), { state: "running" });

    updateRunStatus(cwd, handle.backendRunRef, "completed", { summary: "Done." });
    assert.deepEqual(await executor.poll(handle.backendRunRef), {
      state: "completed",
      result: { summary: "Done." },
    });

    const failedHandle = await executor.start({ ...createExecutorRequest(conversation.id), taskId: "task-2" });
    updateRunStatus(cwd, failedHandle.backendRunRef, "failed", { blockedReason: "tool failed" });
    assert.deepEqual(await executor.poll(failedHandle.backendRunRef), {
      state: "failed",
      error: "tool failed",
    });

    const cancelledHandle = await executor.start({ ...createExecutorRequest(conversation.id), taskId: "task-3" });
    updateRunStatus(cwd, cancelledHandle.backendRunRef, "cancelled");
    assert.deepEqual(await executor.poll(cancelledHandle.backendRunRef), { state: "cancelled" });

    assert.deepEqual(await executor.poll("missing-run"), {
      state: "failed",
      error: "Pi execution run not found: missing-run",
    });
  });
});

test("PiAgentExecutor maps blocked runs to orchestration questions", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Parent orchestration thread" });
    const executor = new PiAgentExecutor({ cwd });
    const handle = await executor.start(createExecutorRequest(conversation.id));
    updateRunStatus(cwd, handle.backendRunRef, "waiting_for_human", { blockedReason: "Needs target branch" });
    createQuestion(cwd, {
      conversationId: conversation.id,
      runId: handle.backendRunRef,
      prompt: "Which branch should I target?",
      priority: "high",
    });

    assert.deepEqual(await executor.poll(handle.backendRunRef), {
      state: "blocked",
      question: {
        prompt: "Which branch should I target?",
        priority: "high",
      },
    });
  });
});

test("PiAgentExecutor queues guidance, answers the latest blocked question, and requests cancellation", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Parent orchestration thread" });
    const executor = new PiAgentExecutor({ cwd });
    const handle = await executor.start(createExecutorRequest(conversation.id));
    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: handle.backendRunRef,
      prompt: "Which branch should I target?",
      priority: "normal",
    });
    await executor.sendGuidance(handle.backendRunRef, "Keep the change small.");
    await executor.answerQuestion(handle.backendRunRef, "Use main.");
    await executor.cancel(handle.backendRunRef);

    const guidance = listAgentGuidances(cwd, { runId: handle.backendRunRef })[0];
    assert.equal(guidance?.content, "Keep the change small.");
    assert.equal(guidance?.taskId, handle.backendRunRef);

    const reply = listReplies(cwd, question.id)[0];
    assert.equal(reply?.content, "Use main.");
    assert.equal(getQuestionById(cwd, question.id)?.status, "answered");

    const cancellation = listRunCancellationRequests(cwd)[0];
    assert.equal(cancellation?.runId, handle.backendRunRef);
    assert.match(cancellation?.reason ?? "", /orchestration-core/i);
  });
});

test("Pi-backed core child completion updates core state and wakes the parent thread for synthesis", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Parent orchestration thread" });
    const parentRun = createRun(cwd, { conversationId: conversation.id, goal: "Coordinate core child work", status: "running" });
    const taskRepository = new FileBackedTaskRepository(cwd);
    const agentRunRepository = new FileBackedAgentRunRepository(cwd);
    const eventRecorder = new FileBackedEventRecorder(cwd);
    await taskRepository.save({
      id: "task-1",
      parentRunId: parentRun.id,
      title: "Patch executor boundary",
      prompt: "Make Pi an executor.",
      status: "ready",
      dependsOnTaskIds: [],
      createdAt: "2026-05-04T11:00:00.000Z",
      updatedAt: "2026-05-04T11:00:00.000Z",
    });
    await spawnReadyAgents({
      parentRunId: parentRun.id,
      conversationId: conversation.id,
      parentRunKind: "user_prompt",
      taskRepository,
      agentRunRepository,
      contextAssembler: new StubContextAssembler(),
      modelSelection: new StubModelSelection(),
      executor: new PiAgentExecutor({ cwd }),
      clock: new FixedClock(),
      eventRecorder,
    });

    await processNextQueuedRun(cwd, {
      executeRun: async (run) => ({
        summary: "Executor boundary is patched.",
        message: `Finished ${run.id}`,
      }),
    });

    const agentRun = (await agentRunRepository.listByParentRun(parentRun.id))[0];
    const task = await taskRepository.get("task-1");
    const messages = listMessages(cwd, conversation.id);

    assert.equal(agentRun?.status, "completed");
    assert.equal(agentRun?.resultSummary, "Executor boundary is patched.");
    assert.equal(task?.status, "done");
    assert.ok(messages.some((message) => message.kind === "orchestration_final"));
    assert.deepEqual(loadOrchestrationEvents(cwd).map((event) => event.type), [
      "AgentStarted",
      "AgentCompleted",
      "TaskCompleted",
      "RunReadyForSynthesis",
      "RunSummarized",
    ]);
  });
});
