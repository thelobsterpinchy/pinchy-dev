import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findSessionByConversationId,
  getSessionEntry,
  listSessionEntries,
  saveSessionEntry,
  updateSessionEntry,
} from "../services/agent-worker/src/session-store.js";

test("session store ignores corrupted session files when listing and searching", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-session-store-"));

  try {
    const sessionsDir = join(cwd, ".pinchy", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, "broken.json"), "{not valid json", "utf8");
    const saved = saveSessionEntry(cwd, {
      id: "session-1",
      sessionPath: "/tmp/session-1.json",
      conversationId: "conversation-1",
    });

    assert.deepEqual(listSessionEntries(cwd), [saved]);
    assert.equal(findSessionByConversationId(cwd, "conversation-1")?.id, "session-1");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("session store returns undefined instead of throwing for corrupted session entry reads and updates", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-session-store-"));

  try {
    const sessionsDir = join(cwd, ".pinchy", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, "broken.json"), "{not valid json", "utf8");

    assert.equal(getSessionEntry(cwd, "broken"), undefined);
    assert.equal(updateSessionEntry(cwd, "broken", { conversationId: "conversation-1" }), undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
