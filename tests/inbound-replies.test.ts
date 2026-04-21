import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation, createQuestion, createRun, getQuestionById, listReplies, updateRunStatus } from "../apps/host/src/agent-state-store.js";
import { ingestInboundReply } from "../services/notifiers/inbound-replies.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-inbound-replies-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("ingestInboundReply persists a normalized reply and marks the question answered", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Normalize inbound reply" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Wait for inbound reply" });
    updateRunStatus(cwd, run.id, "waiting_for_human", { blockedReason: "Need answer", piSessionPath: "/tmp/pi-session.json" });
    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Should I use JSON?",
      priority: "normal",
      channelHints: ["dashboard"],
    });

    const reply = ingestInboundReply(cwd, {
      questionId: question.id,
      conversationId: conversation.id,
      channel: "dashboard",
      content: "Yes, use JSON.",
      rawPayload: { source: "dashboard" },
    });

    assert.equal(reply.channel, "dashboard");
    assert.equal(reply.content, "Yes, use JSON.");
    assert.equal(listReplies(cwd, question.id).length, 1);
    assert.equal(getQuestionById(cwd, question.id)?.status, "answered");
    assert.deepEqual(listReplies(cwd, question.id)[0]?.rawPayload, { source: "dashboard" });
  });
});

test("ingestInboundReply rejects replies for unknown, mismatched, or already answered questions", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Reply validation" });
    const otherConversation = createConversation(cwd, { title: "Other conversation" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Wait for one reply" });
    updateRunStatus(cwd, run.id, "waiting_for_human", { blockedReason: "Need answer", piSessionPath: "/tmp/pi-session.json" });
    const question = createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Only one reply should count",
      priority: "normal",
    });

    assert.throws(() => {
      ingestInboundReply(cwd, {
        questionId: "question-missing",
        conversationId: conversation.id,
        channel: "dashboard",
        content: "Unknown",
      });
    }, /Question not found/);

    assert.throws(() => {
      ingestInboundReply(cwd, {
        questionId: question.id,
        conversationId: otherConversation.id,
        channel: "dashboard",
        content: "Wrong conversation",
      });
    }, /conversation/);

    ingestInboundReply(cwd, {
      questionId: question.id,
      conversationId: conversation.id,
      channel: "dashboard",
      content: "First reply",
    });

    assert.throws(() => {
      ingestInboundReply(cwd, {
        questionId: question.id,
        conversationId: conversation.id,
        channel: "dashboard",
        content: "Second reply",
      });
    }, /already answered/);
  });
});
