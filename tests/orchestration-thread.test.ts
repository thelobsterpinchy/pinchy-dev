import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendMessage, createConversation, createRun, listMessages } from "../apps/host/src/agent-state-store.js";
import { appendDelegatedOutcomeRelay } from "../apps/host/src/orchestration-thread.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-orchestration-thread-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("appendDelegatedOutcomeRelay appends a plain agent relay message", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Delegated relay" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Coordinate delegated work", status: "completed" });

    appendDelegatedOutcomeRelay(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      content: "I finished delegated task \"Inspect tests\". Summary: Done.",
    });

    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, "agent");
    assert.equal(messages[0]?.kind, undefined);
    assert.equal(messages[0]?.runId, run.id);
    assert.equal(messages[0]?.content, "I finished delegated task \"Inspect tests\". Summary: Done.");
  });
});

test("appendDelegatedOutcomeRelay suppresses duplicate plain agent relays for the same run", () => {
  withTempDir((cwd) => {
    const conversation = createConversation(cwd, { title: "Duplicate relay suppression" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Coordinate delegated work", status: "completed" });
    appendMessage(cwd, {
      conversationId: conversation.id,
      role: "agent",
      runId: run.id,
      content: "I need your input to continue delegated task \"Choose persistence\": JSON or SQLite? Reason: Need persistence choice.",
    });

    appendDelegatedOutcomeRelay(cwd, {
      conversationId: conversation.id,
      runId: run.id,
      content: "I need your input to continue delegated task \"Choose persistence\": JSON or SQLite? Reason: Need persistence choice.",
    });

    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.kind, undefined);
    assert.equal(messages[0]?.content, "I need your input to continue delegated task \"Choose persistence\": JSON or SQLite? Reason: Need persistence choice.");
  });
});
