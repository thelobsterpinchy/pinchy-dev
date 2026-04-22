import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createConversation, createRun } from "../apps/host/src/agent-state-store.js";
import { appendArtifactRecord, loadArtifactIndex } from "../apps/host/src/artifact-index.js";
import { applyAutoDeleteRetention } from "../apps/host/src/auto-delete-retention.js";

test("applyAutoDeleteRetention removes expired conversations and artifacts when enabled", () => {
  const cwd = mkdtemp();
  try {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({ autoDeleteEnabled: true, autoDeleteDays: 7 }));

    const oldConversation = createConversation(cwd, { title: "Old chat" });
    createRun(cwd, { conversationId: oldConversation.id, goal: "Old run" });
    const recentConversation = createConversation(cwd, { title: "Recent chat" });

    const conversationsPath = join(cwd, ".pinchy/state/conversations.json");
    const conversations = JSON.parse(readFileSync(conversationsPath, "utf8")) as Array<{ id: string; updatedAt: string; createdAt: string }>;
    const oldTimestamp = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const recentTimestamp = new Date("2026-01-10T00:00:00.000Z").toISOString();
    for (const conversation of conversations) {
      if (conversation.id === oldConversation.id) {
        conversation.createdAt = oldTimestamp;
        conversation.updatedAt = oldTimestamp;
      }
      if (conversation.id === recentConversation.id) {
        conversation.createdAt = recentTimestamp;
        conversation.updatedAt = recentTimestamp;
      }
    }
    writeFileSync(conversationsPath, JSON.stringify(conversations, null, 2));

    mkdirSync(join(cwd, "artifacts"), { recursive: true });
    const oldArtifactPath = join(cwd, "artifacts", "old.png");
    const recentArtifactPath = join(cwd, "artifacts", "recent.png");
    writeFileSync(oldArtifactPath, "old");
    writeFileSync(recentArtifactPath, "recent");
    appendArtifactRecord(cwd, {
      path: "artifacts/old.png",
      toolName: "browser_debug_scan",
      createdAt: oldTimestamp,
    });
    appendArtifactRecord(cwd, {
      path: "artifacts/recent.png",
      toolName: "browser_debug_scan",
      createdAt: recentTimestamp,
    });

    const result = applyAutoDeleteRetention(cwd, new Date("2026-01-15T00:00:00.000Z"));

    assert.equal(result.deletedConversations, 1);
    assert.equal(result.deletedArtifacts, 1);
    const remainingConversations = JSON.parse(readFileSync(conversationsPath, "utf8")) as Array<{ id: string }>;
    assert.deepEqual(remainingConversations.map((entry) => entry.id), [recentConversation.id]);
    assert.equal(existsSync(oldArtifactPath), false);
    assert.equal(existsSync(recentArtifactPath), true);
    assert.deepEqual(loadArtifactIndex(cwd).map((entry) => entry.path), ["artifacts/recent.png"]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("applyAutoDeleteRetention leaves data untouched when disabled", () => {
  const cwd = mkdtemp();
  try {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({ autoDeleteEnabled: false, autoDeleteDays: 7 }));
    const conversation = createConversation(cwd, { title: "Keep chat" });
    mkdirSync(join(cwd, "artifacts"), { recursive: true });
    const artifactPath = join(cwd, "artifacts", "keep.png");
    writeFileSync(artifactPath, "keep");
    appendArtifactRecord(cwd, {
      path: "artifacts/keep.png",
      toolName: "browser_debug_scan",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = applyAutoDeleteRetention(cwd, new Date("2026-01-15T00:00:00.000Z"));

    assert.deepEqual(result, { enabled: false, deletedConversations: 0, deletedArtifacts: 0 });
    assert.equal(existsSync(artifactPath), true);
    const conversations = JSON.parse(readFileSync(join(cwd, ".pinchy/state/conversations.json"), "utf8")) as Array<{ id: string }>;
    assert.deepEqual(conversations.map((entry) => entry.id), [conversation.id]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function mkdtemp() {
  return mkdtempSync(join(tmpdir(), "pinchy-auto-delete-"));
}
