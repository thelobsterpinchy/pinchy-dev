import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentGuidance, createConversation, createHumanReply, createNotificationDelivery, createQuestion, createRun, listAgentGuidances, listMessages, listNotificationDeliveries, listRuns, listQuestions, markQuestionAnswered, updateRunStatus } from "../apps/host/src/agent-state-store.js";
import { enqueueTask, loadTasks, updateTaskStatus } from "../apps/host/src/task-queue.js";
import { readAuditEntries } from "../apps/host/src/audit-log.js";
import { parseWorkerLoopConfig, processAvailableQueuedRuns, processNextPendingQuestionDelivery, processNextQueuedRun, processNextResumableRun } from "../services/agent-worker/src/worker.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-worker-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("processNextQueuedRun completes the next queued run, writes an agent message, and appends audit entries", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Worker demo" });
    const firstRun = createRun(cwd, { conversationId: conversation.id, goal: "Investigate failing tests" });
    createRun(cwd, { conversationId: conversation.id, goal: "Second queued run" });

    const processed = await processNextQueuedRun(cwd, {
      executeRun: async (run) => ({
        summary: `Completed: ${run.goal}`,
        message: `Finished run ${run.id}`,
        sessionPath: "/tmp/pi-session-run-1.json",
      }),
    });

    assert.equal(processed?.id, firstRun.id);

    const runs = listRuns(cwd, conversation.id);
    const messages = listMessages(cwd, conversation.id);
    const completedRun = runs.find((run) => run.id === firstRun.id);
    const auditEntries = readAuditEntries(cwd);
    const startEntry = auditEntries.find((entry) => entry.type === "worker_run_started" && entry.runId === firstRun.id);
    const finishEntry = auditEntries.find((entry) => entry.type === "worker_run_finished" && entry.runId === firstRun.id);

    assert.equal(completedRun?.status, "completed");
    assert.equal(completedRun?.summary, "Completed: Investigate failing tests");
    assert.equal(completedRun?.sessionPath, "/tmp/pi-session-run-1.json");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, "agent");
    assert.equal(messages[0]?.content, `Finished run ${firstRun.id}`);
    assert.equal(startEntry?.conversationId, conversation.id);
    assert.deepEqual(startEntry?.details, { executionMode: "queued", runKind: "user_prompt" });
    assert.equal(finishEntry?.summary, "Completed: Investigate failing tests");
    assert.equal(finishEntry?.details && typeof finishEntry.details === "object" && "outcomeKind" in finishEntry.details ? finishEntry.details.outcomeKind : undefined, "completed");
    assert.equal(finishEntry?.details && typeof finishEntry.details === "object" && "runStatus" in finishEntry.details ? finishEntry.details.runStatus : undefined, "completed");
  });
});

test("processNextQueuedRun applies pending scoped agent guidance before execution", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Queued agent guidance" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Inspect a delegated task" });
    createAgentGuidance(cwd, {
      conversationId: conversation.id,
      taskId: "task-1",
      runId: run.id,
      content: "Stay focused on tests only.",
    });

    let observedGoal = "";
    await processNextQueuedRun(cwd, {
      executeRun: async (claimedRun) => {
        observedGoal = claimedRun.goal;
        return {
          kind: "completed",
          summary: "Completed with guidance",
          message: "Finished guided run",
        };
      },
    });

    assert.match(observedGoal, /Inspect a delegated task/);
    assert.match(observedGoal, /Additional scoped user guidance/i);
    assert.match(observedGoal, /Stay focused on tests only\./);
    assert.equal(listAgentGuidances(cwd, { runId: run.id, status: "applied" }).length, 1);
    const messages = listMessages(cwd, conversation.id);
    assert.match(messages[0]?.content ?? "", /Scoped guidance acknowledged/i);
    assert.match(messages[0]?.content ?? "", /Stay focused on tests only\./);
  });
});

test("processNextQueuedRun drops outcome persistence when the conversation is deleted before execution finishes", async () => {
  await withTempDir(async (cwd) => {
    const { deleteConversation } = await import("../apps/host/src/agent-state-store.js");
    const conversation = createConversation(cwd, { title: "Delete while running" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Long running task" });

    let releaseExecution: (() => void) | undefined;
    const processing = processNextQueuedRun(cwd, {
      executeRun: async () => {
        await new Promise<void>((resolve) => {
          releaseExecution = resolve;
        });
        return {
          kind: "completed",
          summary: "Should not persist",
          message: "This message should be discarded.",
          sessionPath: "/tmp/pi-session-deleted.json",
        };
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(deleteConversation(cwd, conversation.id), true);
    releaseExecution?.();

    const processed = await processing;
    assert.equal(processed, undefined);
    assert.equal(listMessages(cwd, conversation.id).length, 0);
    assert.equal(listRuns(cwd, conversation.id).length, 0);
  });
});

test("processNextQueuedRun returns undefined when no queued run exists", async () => {
  await withTempDir(async (cwd) => {
    const result = await processNextQueuedRun(cwd, {
      executeRun: async () => ({ kind: "completed", summary: "noop", message: "noop" }),
    });

    assert.equal(result, undefined);
  });
});

test("processNextQueuedRun prioritizes the interactive lane separately from background work", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Lane worker demo" });
    const backgroundRun = createRun(cwd, { conversationId: conversation.id, goal: "Background QA", kind: "qa_cycle" });
    const interactiveRun = createRun(cwd, { conversationId: conversation.id, goal: "User request", kind: "user_prompt" });

    const processedInteractive = await processNextQueuedRun(cwd, {
      executeRun: async (run) => ({ summary: `Completed: ${run.goal}`, message: `Finished run ${run.id}` }),
    }, { lane: "interactive" });
    const processedBackground = await processNextQueuedRun(cwd, {
      executeRun: async (run) => ({ summary: `Completed: ${run.goal}`, message: `Finished run ${run.id}` }),
    }, { lane: "background" });

    assert.equal(processedInteractive?.id, interactiveRun.id);
    assert.equal(processedBackground?.id, backgroundRun.id);
  });
});

test("parseWorkerLoopConfig falls back to defaults for invalid numeric env values", () => {
  const config = parseWorkerLoopConfig({
    PINCHY_CWD: "/tmp/pinchy-worker",
    PINCHY_WORKER_ONCE: "true",
    PINCHY_WORKER_INTERVAL_MS: "not-a-number",
    PINCHY_WORKER_CONCURRENCY: "0",
  });

  assert.deepEqual(config, {
    cwd: "/tmp/pinchy-worker",
    once: true,
    intervalMs: 5000,
    concurrency: 2,
  });

  const decimalConfig = parseWorkerLoopConfig({
    PINCHY_WORKER_INTERVAL_MS: "2500.9",
    PINCHY_WORKER_CONCURRENCY: "3.8",
  });

  assert.equal(decimalConfig.intervalMs, 2500);
  assert.equal(decimalConfig.concurrency, 3);
});

test("processAvailableQueuedRuns executes multiple queued runs in parallel up to the worker concurrency", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Parallel worker demo" });
    const runA = createRun(cwd, { conversationId: conversation.id, goal: "Task A" });
    const runB = createRun(cwd, { conversationId: conversation.id, goal: "Task B" });
    const runC = createRun(cwd, { conversationId: conversation.id, goal: "Task C" });
    const started: string[] = [];
    const releases = new Map<string, () => void>();

    const execution = processAvailableQueuedRuns(cwd, {
      executeRun: async (run) => {
        started.push(run.id);
        await new Promise<void>((resolve) => {
          releases.set(run.id, resolve);
        });
        return {
          summary: `Completed: ${run.goal}`,
          message: `Finished run ${run.id}`,
        };
      },
    }, { concurrency: 2 });

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(started.length, 2);
    assert.ok(!started.includes(runC.id) || !started.includes(runB.id) || !started.includes(runA.id));

    for (const startedRunId of [...started]) {
      releases.get(startedRunId)?.();
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(started.length, 3);
    const lastStartedRunId = started[2];
    assert.ok(lastStartedRunId);
    releases.get(lastStartedRunId)?.();

    const processed = await execution;
    assert.equal(processed.length, 3);
  });
});

test("processAvailableQueuedRuns keeps background work progressing on the background lane even when interactive work is queued", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Hybrid lane demo" });
    const backgroundRun = createRun(cwd, { conversationId: conversation.id, goal: "Background QA", kind: "qa_cycle" });
    createRun(cwd, { conversationId: conversation.id, goal: "User request", kind: "user_prompt" });

    const processed = await processAvailableQueuedRuns(cwd, {
      executeRun: async (run) => ({
        summary: `Completed: ${run.goal}`,
        message: `Finished run ${run.id}`,
      }),
    }, { concurrency: 1, lane: "background" });

    assert.equal(processed.length, 1);
    assert.equal(processed[0]?.id, backgroundRun.id);
    assert.equal(processed[0]?.kind, "qa_cycle");
  });
});

test("processNextQueuedRun does not mark delegated tasks done when only the parent orchestration run completes", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Parent orchestration thread" });
    const parentRun = createRun(cwd, { conversationId: conversation.id, goal: "Coordinate background work" });
    const task = enqueueTask(cwd, "Investigate failing tests", "Investigate failing tests.", {
      conversationId: conversation.id,
      runId: parentRun.id,
    });
    updateTaskStatus(cwd, task.id, "running", { conversationId: conversation.id, runId: parentRun.id });

    await processNextQueuedRun(cwd, {
      executeRun: async (claimedRun) => ({
        summary: `Completed: ${claimedRun.goal}`,
        message: `Finished run ${claimedRun.id}`,
      }),
    });

    assert.equal(loadTasks(cwd)[0]?.status, "running");
    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.content, `Finished run ${parentRun.id}`);
    assert.equal(messages[0]?.kind, undefined);
  });
});

test("processNextQueuedRun marks a linked delegated task done, wakes up the main thread, and appends orchestration progress plus final synthesis", async () => {
  await withTempDir(async (cwd) => {
    const parentConversation = createConversation(cwd, { title: "Main orchestration thread" });
    const parentRun = createRun(cwd, { conversationId: parentConversation.id, goal: "Coordinate background work", status: "completed" });
    const workerConversation = createConversation(cwd, { title: "Worker linked task demo" });
    const run = createRun(cwd, { conversationId: workerConversation.id, goal: "Investigate failing tests" });
    const task = enqueueTask(cwd, "Investigate failing tests", "Investigate failing tests.", {
      conversationId: parentConversation.id,
      runId: parentRun.id,
    });
    updateTaskStatus(cwd, task.id, "running", { runId: parentRun.id, executionRunId: run.id, conversationId: parentConversation.id });

    await processNextQueuedRun(cwd, {
      executeRun: async (claimedRun) => ({
        summary: `Completed: ${claimedRun.goal}`,
        message: `Finished run ${claimedRun.id}`,
      }),
    });

    assert.equal(loadTasks(cwd)[0]?.status, "done");

    const workerMessages = listMessages(cwd, workerConversation.id);
    assert.equal(workerMessages.length, 1);
    assert.equal(workerMessages[0]?.content, `Finished run ${run.id}`);

    const parentMessages = listMessages(cwd, parentConversation.id);
    assert.equal(parentMessages.length, 3);
    assert.equal(parentMessages[0]?.kind, undefined);
    assert.match(parentMessages[0]?.content ?? "", /I finished delegated task/i);
    assert.match(parentMessages[0]?.content ?? "", /Investigate failing tests/i);
    assert.match(parentMessages[0]?.content ?? "", /Completed: Investigate failing tests/i);
    assert.equal(parentMessages[1]?.kind, "orchestration_update");
    assert.match(parentMessages[1]?.content ?? "", /delegated agent finished|the delegated agent finished/i);
    assert.match(parentMessages[1]?.content ?? "", /Investigate failing tests/);
    assert.match(parentMessages[1]?.content ?? "", /Completed: Investigate failing tests/i);
    assert.equal(parentMessages[2]?.kind, "orchestration_final");
    assert.match(parentMessages[2]?.content ?? "", /final synthesis summary/i);
    assert.match(parentMessages[2]?.content ?? "", /ready to synthesize the final thread update/i);
  });
});

test("processNextQueuedRun persists waiting_for_human outcomes as blocked runs and questions", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Blocked worker run" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Need clarification before coding" });

    const processed = await processNextQueuedRun(cwd, {
      executeRun: async () => ({
        kind: "waiting_for_human",
        summary: "Blocked on a clarification",
        message: "Need a persistence decision.",
        blockedReason: "Need persistence choice",
        question: {
          prompt: "Should I use JSON files or SQLite?",
          priority: "normal",
          channelHints: ["discord"],
        },
        sessionPath: "/tmp/pi-session-waiting.json",
      }),
    });

    const runs = listRuns(cwd, conversation.id);
    const questions = listQuestions(cwd, conversation.id);
    const messages = listMessages(cwd, conversation.id);

    assert.equal(processed?.status, "waiting_for_human");
    assert.equal(runs[0]?.blockedReason, "Need persistence choice");
    assert.equal(runs[0]?.sessionPath, "/tmp/pi-session-waiting.json");
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.prompt, "Should I use JSON files or SQLite?");
    assert.equal(questions[0]?.status, "pending_delivery");
    assert.equal(messages[0]?.content, "Need a persistence decision.");
    assert.equal(run.id, runs[0]?.id);
  });
});

test("processNextQueuedRun relays delegated-agent questions back through the main thread and orchestration thread", async () => {
  await withTempDir(async (cwd) => {
    const parentConversation = createConversation(cwd, { title: "Delegated question relay" });
    const parentRun = createRun(cwd, { conversationId: parentConversation.id, goal: "Need clarification before coding", status: "completed" });
    const workerConversation = createConversation(cwd, { title: "Queued task worker thread" });
    const run = createRun(cwd, { conversationId: workerConversation.id, goal: "Need clarification before coding" });
    const task = enqueueTask(cwd, "Choose persistence approach", "Investigate persistence options and ask if blocked.", {
      conversationId: parentConversation.id,
      runId: parentRun.id,
    });
    updateTaskStatus(cwd, task.id, "running", { runId: parentRun.id, executionRunId: run.id, conversationId: parentConversation.id });

    await processNextQueuedRun(cwd, {
      executeRun: async () => ({
        kind: "waiting_for_human",
        summary: "Blocked on persistence choice",
        message: "Need your decision before I continue.",
        blockedReason: "Need persistence choice",
        question: {
          prompt: "Should I use JSON files or SQLite?",
          priority: "high",
          channelHints: ["dashboard"],
        },
      }),
    });

    const workerMessages = listMessages(cwd, workerConversation.id);
    assert.equal(workerMessages.length, 1);
    assert.equal(workerMessages[0]?.content, "Need your decision before I continue.");

    const parentMessages = listMessages(cwd, parentConversation.id);
    assert.equal(parentMessages.length, 2);
    assert.equal(parentMessages[0]?.kind, undefined);
    assert.match(parentMessages[0]?.content ?? "", /I need your input to continue delegated task/i);
    assert.match(parentMessages[0]?.content ?? "", /Should I use JSON files or SQLite\?/i);
    assert.match(parentMessages[0]?.content ?? "", /Need persistence choice/i);
    assert.equal(parentMessages[1]?.kind, "orchestration_update");
    assert.match(parentMessages[1]?.content ?? "", /delegated agent question|the delegated agent is blocked and needs your input/i);
    assert.match(parentMessages[1]?.content ?? "", /Should I use JSON files or SQLite\?/i);
    assert.match(parentMessages[1]?.content ?? "", /Need persistence choice/i);
    assert.match(parentMessages[1]?.content ?? "", /Choose persistence approach/i);
  });
});

test("processNextQueuedRun persists waiting_for_approval outcomes without creating questions", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Approval-gated worker run" });
    createRun(cwd, { conversationId: conversation.id, goal: "Open the app after approval" });

    const processed = await processNextQueuedRun(cwd, {
      executeRun: async () => ({
        kind: "waiting_for_approval",
        summary: "Waiting for approval",
        message: "Need approval before opening the app.",
        blockedReason: "desktop_open_app requires approval",
        sessionPath: "/tmp/pi-session-approval.json",
      }),
    });

    const runs = listRuns(cwd, conversation.id);
    const questions = listQuestions(cwd, conversation.id);
    const messages = listMessages(cwd, conversation.id);

    assert.equal(processed?.status, "waiting_for_approval");
    assert.equal(runs[0]?.blockedReason, "desktop_open_app requires approval");
    assert.equal(runs[0]?.sessionPath, "/tmp/pi-session-approval.json");
    assert.equal(questions.length, 0);
    assert.equal(messages[0]?.content, "Need approval before opening the app.");
  });
});

test("processNextQueuedRun relays delegated-agent approval waits back through the main thread and orchestration thread", async () => {
  await withTempDir(async (cwd) => {
    const parentConversation = createConversation(cwd, { title: "Delegated approval relay" });
    const parentRun = createRun(cwd, { conversationId: parentConversation.id, goal: "Need approval before app action", status: "completed" });
    const workerConversation = createConversation(cwd, { title: "Queued task worker thread" });
    const run = createRun(cwd, { conversationId: workerConversation.id, goal: "Open the app after approval" });
    const task = enqueueTask(cwd, "Open the app", "Open the app after getting approval.", {
      conversationId: parentConversation.id,
      runId: parentRun.id,
    });
    updateTaskStatus(cwd, task.id, "running", { runId: parentRun.id, executionRunId: run.id, conversationId: parentConversation.id });

    await processNextQueuedRun(cwd, {
      executeRun: async () => ({
        kind: "waiting_for_approval",
        summary: "Waiting for approval",
        message: "Need approval before opening the app.",
        blockedReason: "desktop_open_app requires approval",
      }),
    });

    const parentMessages = listMessages(cwd, parentConversation.id);
    assert.equal(parentMessages.length, 2);
    assert.equal(parentMessages[0]?.kind, undefined);
    assert.match(parentMessages[0]?.content ?? "", /I need approval before delegated task/i);
    assert.match(parentMessages[0]?.content ?? "", /Open the app/i);
    assert.match(parentMessages[0]?.content ?? "", /desktop_open_app requires approval/i);
    assert.equal(parentMessages[1]?.kind, "orchestration_update");
    assert.match(parentMessages[1]?.content ?? "", /delegated agent is waiting for approval/i);
    assert.match(parentMessages[1]?.content ?? "", /Open the app/i);
    assert.match(parentMessages[1]?.content ?? "", /desktop_open_app requires approval/i);
  });
});

test("processNextQueuedRun persists failed outcomes without creating questions and records failure summaries in audit logs", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Failed worker run" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Run a risky migration" });

    const processed = await processNextQueuedRun(cwd, {
      executeRun: async () => ({
        kind: "failed",
        summary: "Run failed",
        message: "Pi could not finish the migration plan.",
        error: "tool execution failed",
        sessionPath: "/tmp/pi-session-failed.json",
      }),
    });

    const runs = listRuns(cwd, conversation.id);
    const questions = listQuestions(cwd, conversation.id);
    const messages = listMessages(cwd, conversation.id);
    const auditEntries = readAuditEntries(cwd);
    const finishEntry = auditEntries.find((entry) => entry.type === "worker_run_finished" && entry.runId === run.id);

    assert.equal(processed?.status, "failed");
    assert.equal(runs[0]?.summary, "Run failed");
    assert.equal(runs[0]?.blockedReason, "tool execution failed");
    assert.equal(runs[0]?.sessionPath, "/tmp/pi-session-failed.json");
    assert.equal(questions.length, 0);
    assert.equal(messages[0]?.content, "Pi could not finish the migration plan.");
    assert.equal(finishEntry?.summary, "Run failed");
    assert.equal(finishEntry?.error, "tool execution failed");
    assert.equal(finishEntry?.details && typeof finishEntry.details === "object" && "outcomeKind" in finishEntry.details ? finishEntry.details.outcomeKind : undefined, "failed");
  });
});

test("processNextQueuedRun relays delegated-agent failures back through the main thread and orchestration thread", async () => {
  await withTempDir(async (cwd) => {
    const parentConversation = createConversation(cwd, { title: "Delegated failure relay" });
    const parentRun = createRun(cwd, { conversationId: parentConversation.id, goal: "Investigate a risky migration", status: "completed" });
    const workerConversation = createConversation(cwd, { title: "Queued task worker thread" });
    const run = createRun(cwd, { conversationId: workerConversation.id, goal: "Run a risky migration" });
    const task = enqueueTask(cwd, "Run the migration", "Try the migration and report back if it fails.", {
      conversationId: parentConversation.id,
      runId: parentRun.id,
    });
    updateTaskStatus(cwd, task.id, "running", { runId: parentRun.id, executionRunId: run.id, conversationId: parentConversation.id });

    await processNextQueuedRun(cwd, {
      executeRun: async () => ({
        kind: "failed",
        summary: "Run failed",
        message: "Pi could not finish the migration plan.",
        error: "tool execution failed",
      }),
    });

    const parentMessages = listMessages(cwd, parentConversation.id);
    assert.equal(parentMessages.length, 2);
    assert.equal(parentMessages[0]?.kind, undefined);
    assert.match(parentMessages[0]?.content ?? "", /I hit a failure while working on delegated task/i);
    assert.match(parentMessages[0]?.content ?? "", /Run the migration/i);
    assert.match(parentMessages[0]?.content ?? "", /tool execution failed/i);
    assert.equal(parentMessages[1]?.kind, "orchestration_update");
    assert.match(parentMessages[1]?.content ?? "", /delegated agent hit a failure/i);
    assert.match(parentMessages[1]?.content ?? "", /Run the migration/i);
    assert.match(parentMessages[1]?.content ?? "", /tool execution failed/i);
  });
});

test("processNextQueuedRun persists a failed run when executeRun throws", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Thrown worker run" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Hit a provider failure" });

    await assert.rejects(
      processNextQueuedRun(cwd, {
        executeRun: async () => {
          throw new Error("fetch failed");
        },
      }),
      /fetch failed/,
    );

    const persistedRun = listRuns(cwd, conversation.id).find((entry) => entry.id === run.id);
    const messages = listMessages(cwd, conversation.id);
    const auditEntries = readAuditEntries(cwd);
    const finishEntry = auditEntries.find((entry) => entry.type === "worker_run_finished" && entry.runId === run.id);

    assert.equal(persistedRun?.status, "failed");
    assert.equal(persistedRun?.summary, "Run execution failed before outcome persistence: Hit a provider failure");
    assert.equal(persistedRun?.blockedReason, "fetch failed");
    assert.equal(messages.at(-1)?.content, "Pinchy could not finish this run because execution failed: fetch failed");
    assert.equal(finishEntry?.error, "fetch failed");
    assert.equal(finishEntry?.details && typeof finishEntry.details === "object" && "runStatus" in finishEntry.details ? finishEntry.details.runStatus : undefined, "failed");
  });
});

test("processNextResumableRun persists a failed run when resumeRun throws", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Thrown resume run" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Continue after provider failure" });
    updateRunStatus(cwd, run.id, "waiting_for_human", { blockedReason: "Need answer", sessionPath: "/tmp/pi-session-run-2.json" });
    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Should I continue?",
      priority: "normal",
      channelHints: ["dashboard"],
    });
    createHumanReply(cwd, {
      conversationId: conversation.id,
      questionId: question.id,
      channel: "dashboard",
      content: "Yes",
    });
    markQuestionAnswered(cwd, question.id);

    await assert.rejects(
      processNextResumableRun(cwd, {
        resumeRun: async () => {
          throw new Error("terminated");
        },
      }),
      /terminated/,
    );

    const persistedRun = listRuns(cwd, conversation.id).find((entry) => entry.id === run.id);
    const messages = listMessages(cwd, conversation.id);
    const auditEntries = readAuditEntries(cwd);
    const finishEntry = auditEntries.find((entry) => entry.type === "worker_run_finished" && entry.runId === run.id);

    assert.equal(persistedRun?.status, "failed");
    assert.equal(persistedRun?.summary, "Run resume failed before outcome persistence: Continue after provider failure");
    assert.equal(persistedRun?.blockedReason, "terminated");
    assert.equal(messages.at(-1)?.content, "Pinchy could not finish this run because execution failed: terminated");
    assert.equal(finishEntry?.error, "terminated");
    assert.equal(finishEntry?.details && typeof finishEntry.details === "object" && "runStatus" in finishEntry.details ? finishEntry.details.runStatus : undefined, "failed");
  });
});

test("processNextResumableRun resumes a waiting run after a human reply", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Resume demo" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Continue after clarification" });
    updateRunStatus(cwd, run.id, "waiting_for_human", { blockedReason: "Need a persistence decision", sessionPath: "/tmp/pi-session-run-2.json" });
    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Should I keep JSON or switch to SQLite?",
      priority: "normal",
      channelHints: ["dashboard"],
    });
    createHumanReply(cwd, {
      conversationId: conversation.id,
      questionId: question.id,
      channel: "dashboard",
      content: "Keep JSON for now.",
    });
    markQuestionAnswered(cwd, question.id);

    const resumed = await processNextResumableRun(cwd, {
      resumeRun: async (resumableRun, reply) => ({
        kind: "completed",
        summary: `Resumed: ${resumableRun.goal}`,
        message: `Applied human reply: ${reply}`,
        sessionPath: resumableRun.sessionPath,
      }),
    });

    const runs = listRuns(cwd, conversation.id);
    const messages = listMessages(cwd, conversation.id);
    const questions = listQuestions(cwd, conversation.id);
    const completedRun = runs.find((entry) => entry.id === run.id);

    assert.equal(resumed?.id, run.id);
    assert.equal(completedRun?.status, "completed");
    assert.equal(completedRun?.summary, "Resumed: Continue after clarification");
    assert.equal(messages.at(-1)?.content, "Applied human reply: Keep JSON for now.");
    assert.equal(questions[0]?.status, "answered");
  });
});

test("processNextResumableRun returns undefined when no answered waiting run exists", async () => {
  await withTempDir(async (cwd) => {
    const result = await processNextResumableRun(cwd, {
      resumeRun: async () => ({ kind: "completed", summary: "noop", message: "noop" }),
    });

    assert.equal(result, undefined);
  });
});

test("processNextPendingQuestionDelivery dispatches the next blocked question and persists a delivery", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Blocked run" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Need clarification" });
    updateRunStatus(cwd, run.id, "waiting_for_human", { blockedReason: "Need provider decision" });
    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Should I use local JSON or SQLite?",
      priority: "normal",
      channelHints: ["discord"],
    });

    const sent = await processNextPendingQuestionDelivery(cwd, {
      dispatchQuestion: async (dispatchCwd, scheduledQuestion) => {
        assert.equal(scheduledQuestion.id, question.id);
        return createNotificationDelivery(dispatchCwd, {
          channel: "discord",
          status: "sent",
          questionId: scheduledQuestion.id,
          runId: scheduledQuestion.runId,
        });
      },
    });

    assert.equal(sent?.question.id, question.id);
    assert.equal(listNotificationDeliveries(cwd).length, 1);
    assert.equal(listNotificationDeliveries(cwd)[0]?.questionId, question.id);
  });
});

test("processNextResumableRun appends pending scoped agent guidance to the resume reply", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Resume guidance demo" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Continue after steering" });
    updateRunStatus(cwd, run.id, "waiting_for_human", { blockedReason: "Need answer", sessionPath: "/tmp/pi-session-resume-guidance.json" });
    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Need an answer",
      priority: "normal",
      channelHints: ["dashboard"],
    });
    createHumanReply(cwd, {
      conversationId: conversation.id,
      questionId: question.id,
      channel: "dashboard",
      content: "Continue.",
    });
    markQuestionAnswered(cwd, question.id);
    createAgentGuidance(cwd, {
      conversationId: conversation.id,
      taskId: "task-1",
      runId: run.id,
      content: "Do not broaden scope.",
    });

    let observedReply = "";
    await processNextResumableRun(cwd, {
      resumeRun: async (_run, reply) => {
        observedReply = reply;
        return {
          kind: "completed",
          summary: "Resumed with guidance",
          message: "Applied resume guidance",
          sessionPath: "/tmp/pi-session-resume-guidance.json",
        };
      },
    });

    assert.match(observedReply, /^Continue\./);
    assert.match(observedReply, /Additional scoped user guidance/i);
    assert.match(observedReply, /Do not broaden scope\./);
    assert.equal(listAgentGuidances(cwd, { runId: run.id, status: "applied" }).length, 1);
  });
});

test("processNextPendingQuestionDelivery returns undefined when no pending question exists", async () => {
  await withTempDir(async (cwd) => {
    const result = await processNextPendingQuestionDelivery(cwd, {
      dispatchQuestion: async () => {
        throw new Error("should not dispatch");
      },
    });

    assert.equal(result, undefined);
  });
});
