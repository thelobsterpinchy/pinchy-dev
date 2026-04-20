import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendMessage,
  createConversation,
  createHumanReply,
  createNotificationDelivery,
  createQuestion,
  createRun,
  getQuestionById,
  listConversations,
  listMessages,
  listNotificationDeliveries,
  listQuestions,
  listReplies,
  listRuns,
  markQuestionAnswered,
  updateRunStatus,
} from "../apps/host/src/agent-state-store.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-agent-state-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("agent state store persists conversations and messages", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Fix flaky test" });
    appendMessage(cwd, {
      conversationId: conversation.id,
      role: "user",
      content: "Please investigate the flaky test",
    });

    const conversations = listConversations(cwd);
    const messages = listMessages(cwd, conversation.id);

    assert.equal(conversations.length, 1);
    assert.equal(conversations[0]?.title, "Fix flaky test");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.content, "Please investigate the flaky test");
    assert.equal(messages[0]?.conversationId, conversation.id);
  });
});

test("agent state store persists runs and supports status updates", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Implement backend" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Implement file-backed repositories",
    });

    const updated = updateRunStatus(cwd, run.id, "waiting_for_human", {
      blockedReason: "Need clarification on persistence format",
    });

    const runs = listRuns(cwd, conversation.id);

    assert.equal(runs.length, 1);
    assert.equal(updated?.status, "waiting_for_human");
    assert.equal(updated?.blockedReason, "Need clarification on persistence format");
    assert.equal(runs[0]?.status, "waiting_for_human");
  });
});

test("agent state store persists questions and replies", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Async question flow" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Ask a clarifying question",
    });

    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Should I use JSON files or SQLite first?",
      priority: "normal",
      channelHints: ["dashboard", "discord"],
    });

    const reply = createHumanReply(cwd, {
      conversationId: conversation.id,
      questionId: question.id,
      channel: "dashboard",
      content: "Start with JSON files.",
    });

    const answered = markQuestionAnswered(cwd, question.id);

    assert.equal(listQuestions(cwd, conversation.id).length, 1);
    assert.equal(listReplies(cwd, question.id).length, 1);
    assert.equal(listReplies(cwd, question.id)[0]?.content, "Start with JSON files.");
    assert.equal(reply.channel, "dashboard");
    assert.equal(answered?.status, "answered");
    assert.ok(getQuestionById(cwd, question.id)?.resolvedAt);
  });
});

test("agent state store filters notification deliveries by question, run, and channel", () => {
  withTempDir((cwd) => {
    createNotificationDelivery(cwd, {
      channel: "discord",
      status: "sent",
      questionId: "question-1",
      runId: "run-1",
    });
    createNotificationDelivery(cwd, {
      channel: "dashboard",
      status: "failed",
      questionId: "question-2",
      runId: "run-2",
      error: "not configured",
    });

    assert.equal(listNotificationDeliveries(cwd).length, 2);
    assert.equal(listNotificationDeliveries(cwd, { questionId: "question-1" }).length, 1);
    assert.equal(listNotificationDeliveries(cwd, { runId: "run-2" }).length, 1);
    assert.equal(listNotificationDeliveries(cwd, { channel: "discord" }).length, 1);
    assert.equal(listNotificationDeliveries(cwd, { channel: "pinchy-app" }).length, 0);
  });
});

test("agent state store returns newest notification deliveries first", () => {
  withTempDir((cwd) => {
    const first = createNotificationDelivery(cwd, {
      channel: "discord",
      status: "failed",
      runId: "run-1",
      error: "network down",
    });
    const second = createNotificationDelivery(cwd, {
      channel: "discord",
      status: "sent",
      runId: "run-1",
    });

    const deliveries = listNotificationDeliveries(cwd, { runId: "run-1" });
    assert.equal(deliveries.length, 2);
    assert.equal(deliveries[0]?.id, second.id);
    assert.equal(deliveries[1]?.id, first.id);
  });
});
