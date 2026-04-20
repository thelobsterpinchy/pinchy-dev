import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation, createHumanReply, createNotificationDelivery, createQuestion, createRun, listMessages, listNotificationDeliveries, listRuns, listQuestions, markQuestionAnswered, updateRunStatus } from "../apps/host/src/agent-state-store.js";
import { processNextPendingQuestionDelivery, processNextQueuedRun, processNextResumableRun } from "../services/agent-worker/src/worker.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-worker-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("processNextQueuedRun completes the next queued run and writes an agent message", async () => {
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

    assert.equal(completedRun?.status, "completed");
    assert.equal(completedRun?.summary, "Completed: Investigate failing tests");
    assert.equal(completedRun?.piSessionPath, "/tmp/pi-session-run-1.json");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, "agent");
    assert.equal(messages[0]?.content, `Finished run ${firstRun.id}`);
  });
});

test("processNextQueuedRun returns undefined when no queued run exists", async () => {
  await withTempDir(async (cwd) => {
    const result = await processNextQueuedRun(cwd, {
      executeRun: async () => ({ summary: "noop", message: "noop" }),
    });

    assert.equal(result, undefined);
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
      resumeRun: async () => ({ summary: "noop", message: "noop" }),
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
