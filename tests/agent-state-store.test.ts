import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendMessage,
  appendRunActivity,
  createAgentGuidance,
  createConversation,
  createHumanReply,
  createNotificationDelivery,
  claimNextQueuedRun,
  createQuestion,
  createRun,
  deleteConversation,
  getConversationSessionBinding,
  getQuestionById,
  getRunById,
  listAgentGuidances,
  listConversationSessions,
  listConversations,
  listMessages,
  listNotificationDeliveries,
  listQuestions,
  listReplies,
  clearRunCancellationRequest,
  clearSubmarineSession,
  createSubmarineSession,
  getSubmarineSession,
  hasRunCancellationRequest,
  listRunActivities,
  listRunCancellationRequests,
  listRuns,
  markAgentGuidanceApplied,
  markQuestionAnswered,
  requestRunCancellation,
  updateQuestionStatus,
  updateRunStatus,
  updateSubmarineSession,
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

test("agent state store persists orchestration message kinds", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Orchestration thread" });
    appendMessage(cwd, {
      conversationId: conversation.id,
      role: "agent",
      content: "Orchestration summary: delegated work is complete.",
      kind: "orchestration_final",
    });

    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages[0]?.kind, "orchestration_final");
  });
});


test("agent state store ignores messages that reference missing conversations or runs", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Valid thread" });
    const otherConversation = createConversation(cwd, { title: "Other thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Track a valid message",
    });
    const otherRun = createRun(cwd, {
      conversationId: otherConversation.id,
      goal: "Do not allow cross-thread messages",
    });

    const missingConversationMessage = appendMessage(cwd, {
      conversationId: "conversation-missing",
      role: "user",
      content: "This should not persist",
    });
    const missingRunMessage = appendMessage(cwd, {
      conversationId: conversation.id,
      runId: "run-missing",
      role: "agent",
      content: "This should not persist either",
    });
    const mismatchedRunMessage = appendMessage(cwd, {
      conversationId: conversation.id,
      runId: otherRun.id,
      role: "agent",
      content: "This should not attach to another conversation's run",
    });
    const validMessage = appendMessage(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      role: "agent",
      content: "This one is valid",
    });

    assert.equal(missingConversationMessage, undefined);
    assert.equal(missingRunMessage, undefined);
    assert.equal(mismatchedRunMessage, undefined);
    assert.equal(validMessage?.runId, run.id);
    assert.equal(listMessages(cwd, conversation.id).length, 1);
  });
});

test("agent state store decorates conversations with notification metadata for active runs and pending questions", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Need review" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Review a risky change",
    });
    createQuestion(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      prompt: "Should I deploy this now?",
      priority: "high",
    });

    const conversations = listConversations(cwd);

    assert.equal(conversations[0]?.hasActiveRun, true);
    assert.equal(conversations[0]?.pendingQuestionCount, 1);
    assert.equal(conversations[0]?.attentionStatus, "needs_reply");
  });
});

test("agent state store decorates conversations with approval attention when a run is waiting for approval", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Open app" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Open the app",
    });
    updateRunStatus(cwd, run.id, "waiting_for_approval");

    const conversations = listConversations(cwd);

    assert.equal(conversations[0]?.attentionStatus, "needs_approval");
    assert.equal(conversations[0]?.hasActiveRun, true);
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

test("claimNextQueuedRun can target interactive and background lanes separately", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Lane scheduling" });
    const backgroundRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Background QA cycle",
      kind: "qa_cycle",
    });
    const interactiveRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Answer the user",
      kind: "user_prompt",
    });

    const claimedInteractive = claimNextQueuedRun(cwd, { lane: "interactive" });
    const claimedBackground = claimNextQueuedRun(cwd, { lane: "background" });

    assert.equal(claimedInteractive?.id, interactiveRun.id);
    assert.equal(claimedBackground?.id, backgroundRun.id);
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

test("agent state store persists canonical conversation Pi sessions and seeds delegation-eligible follow-up runs from them", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Persistent thread session" });
    const firstRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Start the thread",
    });

    updateRunStatus(cwd, firstRun.id, "completed", {
      sessionPath: "/tmp/pi-thread-session.json",
      runtimeConfigSignature: firstRun.runtimeConfigSignature,
    });

    const storedBinding = getConversationSessionBinding(cwd, conversation.id);
    const followUpRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Investigate the dashboard bug and implement the smallest safe fix.",
    });

    assert.equal(storedBinding?.sessionPath, "/tmp/pi-thread-session.json");
    assert.equal(storedBinding?.sourceRunId, firstRun.id);
    assert.equal(storedBinding?.runtimeConfigSignature, firstRun.runtimeConfigSignature);
    assert.equal(listConversationSessions(cwd)[0]?.conversationId, conversation.id);
    assert.equal(followUpRun.sessionPath, "/tmp/pi-thread-session.json");
  });
});

test("agent state store does not seed a strictly conversational follow-up user prompt from an older delegated session", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Casual follow-up" });
    const firstRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Investigate the dashboard bug and implement the smallest safe fix.",
    });

    updateRunStatus(cwd, firstRun.id, "completed", {
      sessionPath: "/tmp/pi-thread-session.json",
      runtimeConfigSignature: firstRun.runtimeConfigSignature,
    });

    const followUpRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "great! how was your day?",
    });

    assert.equal(followUpRun.sessionPath, undefined);
  });
});

test("agent state store does not seed a new run from a stale conversation session when the runtime model settings changed", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Changed runtime config" });
    const firstRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Start the thread",
    });

    updateRunStatus(cwd, firstRun.id, "completed", {
      sessionPath: "/tmp/pi-thread-session.json",
      runtimeConfigSignature: "old-signature",
    });

    const followUpRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Continue after changing models",
      runtimeConfigSignature: "new-signature",
    });

    assert.equal(followUpRun.sessionPath, undefined);
  });
});

test("agent state store persists run activities and filters them by conversation and run", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Activity thread" });
    const otherConversation = createConversation(cwd, { title: "Other thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Inspect activity",
    });
    const otherRun = createRun(cwd, {
      conversationId: otherConversation.id,
      goal: "Ignore me",
    });

    appendRunActivity(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      kind: "tool",
      status: "completed",
      label: "Tool: read",
      toolName: "read",
      details: ["path: README.md"],
    });
    appendRunActivity(cwd, {
      conversationId: otherConversation.id,
      runId: otherRun.id,
      kind: "tool",
      status: "failed",
      label: "Tool: bash",
      toolName: "bash",
      details: ["command failed"],
    });

    assert.equal(listRunActivities(cwd).length, 2);
    assert.equal(listRunActivities(cwd, { conversationId: conversation.id }).length, 1);
    assert.equal(listRunActivities(cwd, { runId: run.id })[0]?.toolName, "read");
    assert.equal(listRunActivities(cwd, { runId: otherRun.id })[0]?.status, "failed");
  });
});

test("agent state store persists and applies scoped agent guidance", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Scoped guidance" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Investigate a delegated task",
    });

    const guidance = createAgentGuidance(cwd, {
      conversationId: conversation.id,
      taskId: "task-1",
      runId: run.id,
      content: "Focus on tests first.",
    });

    assert.equal(listAgentGuidances(cwd, { taskId: "task-1" }).length, 1);
    assert.equal(listAgentGuidances(cwd, { status: "pending" })[0]?.content, "Focus on tests first.");

    const applied = markAgentGuidanceApplied(cwd, guidance.id);
    assert.equal(applied?.status, "applied");
    assert.ok(applied?.appliedAt);
    assert.equal(listAgentGuidances(cwd, { status: "applied" })[0]?.id, guidance.id);
  });
});

test("agent state store tracks run cancellation request lifecycle", () => {
  withTempDir((cwd) => {
    const first = requestRunCancellation(cwd, "run-123", "Conversation deleted");
    assert.equal(first?.runId, "run-123");
    assert.equal(first?.reason, "Conversation deleted");
    assert.equal(hasRunCancellationRequest(cwd, "run-123"), true);

    const updated = requestRunCancellation(cwd, "run-123", "Operator cancelled task");
    assert.equal(updated?.reason, "Operator cancelled task");
    assert.equal(listRunCancellationRequests(cwd).length, 1);

    assert.equal(clearRunCancellationRequest(cwd, "run-123"), true);
    assert.equal(hasRunCancellationRequest(cwd, "run-123"), false);
    assert.equal(clearRunCancellationRequest(cwd, "run-123"), false);
  });
});

test("agent state store preserves cancellation requests for active deleted runs while clearing completed ones", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Delete active thread" });
    const activeRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "delete active thread data",
    });
    const completedRun = createRun(cwd, {
      conversationId: conversation.id,
      goal: "delete completed thread data",
    });
    updateRunStatus(cwd, completedRun.id, "completed");
    requestRunCancellation(cwd, completedRun.id, "Old completed-run request");
    requestRunCancellation(cwd, "run-unrelated", "Keep this request");

    const deleted = deleteConversation(cwd, conversation.id);

    assert.equal(deleted, true);
    assert.equal(hasRunCancellationRequest(cwd, activeRun.id), true);
    assert.equal(listRunCancellationRequests(cwd).some((request) => request.runId === activeRun.id && request.reason === "Conversation deleted"), true);
    assert.equal(hasRunCancellationRequest(cwd, completedRun.id), false);
    assert.equal(hasRunCancellationRequest(cwd, "run-unrelated"), true);
  });
});

test("agent state store persists and clears submarine sessions", () => {
  withTempDir((cwd) => {
    const created = createSubmarineSession(cwd, {
      runId: "run-123",
      sessionKey: "session-abc",
    });

    assert.equal(created.sessionKey, "session-abc");
    assert.equal(getSubmarineSession(cwd, "run-123")?.sessionKey, "session-abc");

    const duplicate = createSubmarineSession(cwd, {
      runId: "run-123",
      sessionKey: "session-new",
    });

    assert.equal(duplicate.sessionKey, "session-abc");
    assert.equal(getSubmarineSession(cwd, "run-123")?.sessionKey, "session-abc");

    const updated = updateSubmarineSession(cwd, "run-123", {
      waitingTaskId: "task-7",
      lastTaskMessage: "Need clarification",
      sessionKey: "session-rotated",
    });

    assert.equal(updated?.waitingTaskId, "task-7");
    assert.equal(updated?.lastTaskMessage, "Need clarification");
    assert.equal(updated?.sessionKey, "session-rotated");
    assert.equal(getSubmarineSession(cwd, "run-123")?.sessionKey, "session-rotated");
    assert.equal(updateSubmarineSession(cwd, "run-missing", { waitingTaskId: "task-8" }), undefined);

    clearSubmarineSession(cwd, "run-123");

    assert.equal(getSubmarineSession(cwd, "run-123"), undefined);
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
    createAgentGuidance(cwd, {
      conversationId: conversation.id,
      taskId: "task-1",
      runId: run.id,
      content: "Stay scoped.",
    });
    appendRunActivity(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      kind: "tool",
      status: "completed",
      label: "Tool: read",
      toolName: "read",
      details: ["path: docs/ARCHITECTURE.md"],
    });
    updateRunStatus(cwd, run.id, "completed", {
      sessionPath: "/tmp/delete-me-session.json",
      runtimeConfigSignature: run.runtimeConfigSignature,
    });

    const deleted = deleteConversation(cwd, conversation.id);

    assert.equal(deleted, true);
    assert.deepEqual(listConversations(cwd).map((entry) => entry.id), [otherConversation.id]);
    assert.equal(listMessages(cwd, conversation.id).length, 0);
    assert.equal(listRuns(cwd, conversation.id).length, 0);
    assert.equal(listQuestions(cwd, conversation.id).length, 0);
    assert.equal(listReplies(cwd, question.id).length, 0);
    assert.equal(listNotificationDeliveries(cwd, { runId: run.id }).length, 0);
    assert.equal(listAgentGuidances(cwd, { conversationId: conversation.id }).length, 0);
    assert.equal(listRunActivities(cwd, { conversationId: conversation.id }).length, 0);
    assert.equal(getConversationSessionBinding(cwd, conversation.id), undefined);
    assert.equal(listRunCancellationRequests(cwd).some((request) => request.runId === run.id), false);
    assert.equal(listMessages(cwd, otherConversation.id).length, 1);
    assert.equal(listRuns(cwd, otherConversation.id).length, 1);
  });
});
