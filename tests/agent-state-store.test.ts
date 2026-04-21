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
  deleteConversation,
  getQuestionById,
  getRunById,
  listConversations,
  listMessages,
  listNotificationDeliveries,
  listQuestions,
  listReplies,
  listRuns,
  markQuestionAnswered,
  updateQuestionStatus,
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
      kind: "qa_cycle",
    });

    const updated = updateRunStatus(cwd, run.id, "waiting_for_human", {
      blockedReason: "Need clarification on persistence format",
    });

    const runs = listRuns(cwd, conversation.id);

    assert.equal(runs.length, 1);
    assert.equal(run.kind, "qa_cycle");
    assert.equal(updated?.status, "waiting_for_human");
    assert.equal(updated?.blockedReason, "Need clarification on persistence format");
    assert.equal(runs[0]?.status, "waiting_for_human");
    assert.equal(runs[0]?.kind, "qa_cycle");
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

test("agent state store defaults runs to user_prompt kind", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Default run kind" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Use the default run kind",
    });

    assert.equal(run.kind, "user_prompt");
    assert.equal(listRuns(cwd, conversation.id)[0]?.kind, "user_prompt");
  });
});

test("agent state store returns runs by id", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Run lookup" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Find this run",
    });

    assert.equal(getRunById(cwd, run.id)?.goal, "Find this run");
    assert.equal(getRunById(cwd, "run-missing"), undefined);
  });
});

test("agent state store updates question status across delivery and answer lifecycle", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Question status transitions" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Track question delivery state",
    });

    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Which channel should I use?",
      priority: "normal",
      channelHints: ["discord"],
    });

    const waiting = updateQuestionStatus(cwd, question.id, "waiting_for_human");
    assert.equal(waiting?.status, "waiting_for_human");
    assert.equal(waiting?.resolvedAt, undefined);

    const answered = updateQuestionStatus(cwd, question.id, "answered");
    assert.equal(answered?.status, "answered");
    assert.ok(answered?.resolvedAt);
    assert.equal(getQuestionById(cwd, question.id)?.status, "answered");
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

test("agent state store deletes a conversation session and its linked records", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Delete me" });
    const otherConversation = createConversation(cwd, { title: "Keep me" });
    appendMessage(cwd, {
      conversationId: conversation.id,
      role: "user",
      content: "remove this thread",
    });
    appendMessage(cwd, {
      conversationId: otherConversation.id,
      role: "user",
      content: "keep this thread",
    });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "delete thread data",
    });
    createRun(cwd, {
      conversationId: otherConversation.id,
      goal: "keep thread data",
    });
    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "delete?",
      priority: "normal",
      channelHints: ["dashboard"],
    });
    createHumanReply(cwd, {
      questionId: question.id,
      conversationId: conversation.id,
      channel: "dashboard",
      content: "yes",
    });
    createNotificationDelivery(cwd, {
      channel: "dashboard",
      status: "sent",
      questionId: question.id,
      runId: run.id,
    });

    const deleted = deleteConversation(cwd, conversation.id);

    assert.equal(deleted, true);
    assert.deepEqual(listConversations(cwd).map((entry) => entry.id), [otherConversation.id]);
    assert.equal(listMessages(cwd, conversation.id).length, 0);
    assert.equal(listRuns(cwd, conversation.id).length, 0);
    assert.equal(listQuestions(cwd, conversation.id).length, 0);
    assert.equal(listReplies(cwd, question.id).length, 0);
    assert.equal(listNotificationDeliveries(cwd, { runId: run.id }).length, 0);
    assert.equal(listMessages(cwd, otherConversation.id).length, 1);
    assert.equal(listRuns(cwd, otherConversation.id).length, 1);
  });
});
