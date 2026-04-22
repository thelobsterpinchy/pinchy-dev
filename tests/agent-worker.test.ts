import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentGuidance, createConversation, createHumanReply, createNotificationDelivery, createQuestion, createRun, listAgentGuidances, listMessages, listNotificationDeliveries, listRuns, listQuestions, markQuestionAnswered, updateRunStatus } from "../apps/host/src/agent-state-store.js";
import { enqueueTask, loadTasks, updateTaskStatus } from "../apps/host/src/task-queue.js";
import { readAuditEntries } from "../apps/host/src/audit-log.js";
import { processAvailableQueuedRuns, processNextPendingQuestionDelivery, processNextQueuedRun, processNextResumableRun } from "../services/agent-worker/src/worker.js";

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
        piSessionPath: "/tmp/pi-session-run-1.json",
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
    assert.equal(completedRun?.piSessionPath, "/tmp/pi-session-run-1.json");
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

test("processNextQueuedRun returns undefined when no queued run exists", async () => {
  await withTempDir(async (cwd) => {
    const result = await processNextQueuedRun(cwd, {
      executeRun: async () => ({ kind: "completed", summary: "noop", message: "noop" }),
    });

    assert.equal(result, undefined);
  });
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


test("processNextQueuedRun marks a linked delegated task done and appends orchestration progress plus final synthesis", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Worker linked task demo" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Investigate failing tests" });
    const task = enqueueTask(cwd, "Investigate failing tests", "Investigate failing tests.");
    updateTaskStatus(cwd, task.id, "running", { runId: run.id, conversationId: conversation.id });

    await processNextQueuedRun(cwd, {
      executeRun: async (claimedRun) => ({
        summary: `Completed: ${claimedRun.goal}`,
        message: `Finished run ${claimedRun.id}`,
      }),
    });

    assert.equal(loadTasks(cwd)[0]?.status, "done");
    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 3);
    assert.equal(messages[0]?.content, `Finished run ${run.id}`);
    assert.equal(messages[1]?.kind, "orchestration_update");
    assert.match(messages[1]?.content ?? "", /background task update/i);
    assert.match(messages[1]?.content ?? "", /Investigate failing tests/);
    assert.equal(messages[2]?.kind, "orchestration_final");
    assert.match(messages[2]?.content ?? "", /final synthesis summary/i);
    assert.match(messages[2]?.content ?? "", /ready to synthesize the final thread update/i);
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
        piSessionPath: "/tmp/pi-session-waiting.json",
      }),
    });

    const runs = listRuns(cwd, conversation.id);
    const questions = listQuestions(cwd, conversation.id);
    const messages = listMessages(cwd, conversation.id);

    assert.equal(processed?.status, "waiting_for_human");
    assert.equal(runs[0]?.blockedReason, "Need persistence choice");
    assert.equal(runs[0]?.piSessionPath, "/tmp/pi-session-waiting.json");
    assert.equal(questions.length, 1);
    assert.equal(questions[0]?.prompt, "Should I use JSON files or SQLite?");
    assert.equal(questions[0]?.status, "pending_delivery");
    assert.equal(messages[0]?.content, "Need a persistence decision.");
    assert.equal(run.id, runs[0]?.id);
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
        piSessionPath: "/tmp/pi-session-approval.json",
      }),
    });

    const runs = listRuns(cwd, conversation.id);
    const questions = listQuestions(cwd, conversation.id);
    const messages = listMessages(cwd, conversation.id);

    assert.equal(processed?.status, "waiting_for_approval");
    assert.equal(runs[0]?.blockedReason, "desktop_open_app requires approval");
    assert.equal(runs[0]?.piSessionPath, "/tmp/pi-session-approval.json");
    assert.equal(questions.length, 0);
    assert.equal(messages[0]?.content, "Need approval before opening the app.");
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
        piSessionPath: "/tmp/pi-session-failed.json",
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
    assert.equal(runs[0]?.piSessionPath, "/tmp/pi-session-failed.json");
    assert.equal(questions.length, 0);
    assert.equal(messages[0]?.content, "Pi could not finish the migration plan.");
    assert.equal(finishEntry?.summary, "Run failed");
    assert.equal(finishEntry?.error, "tool execution failed");
    assert.equal(finishEntry?.details && typeof finishEntry.details === "object" && "outcomeKind" in finishEntry.details ? finishEntry.details.outcomeKind : undefined, "failed");
  });
});

test("processNextResumableRun resumes a waiting run after a human reply", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Resume demo" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Continue after clarification" });
    updateRunStatus(cwd, run.id, "waiting_for_human", { blockedReason: "Need a persistence decision", piSessionPath: "/tmp/pi-session-run-2.json" });
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
        piSessionPath: resumableRun.piSessionPath,
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
    updateRunStatus(cwd, run.id, "waiting_for_human", { blockedReason: "Need answer", piSessionPath: "/tmp/pi-session-resume-guidance.json" });
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
          piSessionPath: "/tmp/pi-session-resume-guidance.json",
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
