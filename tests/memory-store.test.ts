import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMemoryEntry,
  deleteMemoryEntry,
  listMemoryEntries,
  loadMemoryEntries,
  updateMemoryEntry,
} from "../apps/host/src/memory-store.js";

test("memory store creates, updates, pins, and deletes saved memories", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-memory-store-"));

  const first = createMemoryEntry(cwd, {
    title: "Project direction",
    content: "Pinchy wraps Pi and keeps orchestration local-first.",
    kind: "decision",
    tags: ["architecture", "pi"],
  });
  const second = createMemoryEntry(cwd, {
    title: "Operator note",
    content: "Dashboard should expose blocked questions prominently.",
    kind: "note",
    tags: ["dashboard"],
  });

  const updated = updateMemoryEntry(cwd, first.id, {
    pinned: true,
    content: "Pinchy wraps Pi, keeps orchestration local-first, and should stay auditable.",
  });

  assert.equal(updated?.pinned, true);
  assert.match(String(updated?.updatedAt), /^\d{4}-/);

  const entries = listMemoryEntries(cwd);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.id, first.id);
  assert.equal(entries[0]?.pinned, true);
  assert.equal(entries[1]?.id, second.id);

  const deleted = deleteMemoryEntry(cwd, second.id);
  assert.equal(deleted?.id, second.id);
  assert.deepEqual(listMemoryEntries(cwd).map((entry) => entry.id), [first.id]);
});


test("memory store filters by query across title, content, and tags", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-memory-store-query-"));

  createMemoryEntry(cwd, {
    title: "Discord relay",
    content: "Inbound Discord replies use a normalized ingestion path.",
    kind: "fact",
    tags: ["discord", "inbound"],
  });
  createMemoryEntry(cwd, {
    title: "Dashboard layout",
    content: "Use focused pages instead of one overloaded dashboard screen.",
    kind: "note",
    tags: ["ui"],
  });

  assert.equal(listMemoryEntries(cwd, { query: "discord" }).length, 1);
  assert.equal(listMemoryEntries(cwd, { query: "focused pages" }).length, 1);
  assert.equal(listMemoryEntries(cwd, { query: "ui" }).length, 1);
  assert.equal(listMemoryEntries(cwd, { query: "missing" }).length, 0);
});


test("memory store normalizes tags during create and update", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-memory-store-tags-"));

  const created = createMemoryEntry(cwd, {
    title: "Tag cleanup",
    content: "Trim and de-duplicate tags before persisting memories.",
    tags: [" dashboard ", "dashboard", "", " guardrails "],
  });

  assert.deepEqual(created.tags, ["dashboard", "guardrails"]);

  const updated = updateMemoryEntry(cwd, created.id, {
    tags: [" docs ", "docs", "tests ", ""],
  });

  assert.deepEqual(updated?.tags, ["docs", "tests"]);
  assert.deepEqual(loadMemoryEntries(cwd).map((entry) => entry.tags), [["docs", "tests"]]);
});


test("memory store orders pinned entries first, then by update time and id", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-memory-store-sort-"));

  writeFileSync(join(cwd, ".pinchy-memory.json"), JSON.stringify([
    {
      id: "memory-a",
      title: "Old unpinned",
      content: "Older memories should come later when not pinned.",
      kind: "note",
      tags: [],
      pinned: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
    {
      id: "memory-z",
      title: "Pinned recent",
      content: "Pinned memories should float to the top.",
      kind: "note",
      tags: [],
      pinned: true,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
    },
    {
      id: "memory-b",
      title: "Newer unpinned",
      content: "More recent memories should sort ahead of older ones.",
      kind: "note",
      tags: [],
      pinned: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T12:00:00.000Z",
    },
    {
      id: "memory-c",
      title: "Same timestamp higher id",
      content: "Id order should break ties when timestamps match.",
      kind: "note",
      tags: [],
      pinned: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T12:00:00.000Z",
    },
  ], null, 2), "utf8");

  assert.deepEqual(loadMemoryEntries(cwd).map((entry) => entry.id), ["memory-z", "memory-c", "memory-b", "memory-a"]);
});


test("memory store ignores malformed or unsupported on-disk entries", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-memory-store-load-"));

  writeFileSync(join(cwd, ".pinchy-memory.json"), JSON.stringify([
    {
      id: "memory-1",
      title: "Keep",
      content: "Supported memory kinds should load.",
      kind: "note",
      tags: ["ok"],
      pinned: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
    {
      id: "memory-2",
      title: "Drop",
      content: "Unsupported memory kinds should be ignored.",
      kind: "unknown",
      tags: ["bad"],
      pinned: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
  ], null, 2), "utf8");

  assert.deepEqual(loadMemoryEntries(cwd).map((entry) => entry.id), ["memory-1"]);

  writeFileSync(join(cwd, ".pinchy-memory.json"), "{not valid json", "utf8");
  assert.deepEqual(loadMemoryEntries(cwd), []);
});


test("memory store tolerates malformed tag arrays in otherwise valid on-disk entries", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-memory-store-malformed-tags-"));

  writeFileSync(join(cwd, ".pinchy-memory.json"), JSON.stringify([
    {
      id: "memory-1",
      title: "Keep",
      content: "Malformed tags should not break filtering.",
      kind: "note",
      tags: null,
      pinned: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
  ], null, 2), "utf8");

  assert.doesNotThrow(() => listMemoryEntries(cwd, { query: "keep" }));
  assert.deepEqual(listMemoryEntries(cwd, { query: "keep" }).map((entry) => entry.id), ["memory-1"]);
});


test("memory store loads source metadata only when it is well-formed", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-memory-store-source-metadata-"));

  writeFileSync(join(cwd, ".pinchy-memory.json"), JSON.stringify([
    {
      id: "memory-1",
      title: "Keep metadata",
      content: "Valid source metadata should round-trip from disk.",
      kind: "note",
      tags: [],
      pinned: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
      sourceConversationId: "conversation-123",
      sourceRunId: "run-123",
    },
    {
      id: "memory-2",
      title: "Drop malformed metadata",
      content: "Non-string source metadata should be ignored during load.",
      kind: "note",
      tags: [],
      pinned: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
      sourceConversationId: 42,
      sourceRunId: { bad: true },
    },
  ], null, 2), "utf8");

  assert.deepEqual(loadMemoryEntries(cwd).map((entry) => ({
    id: entry.id,
    sourceConversationId: entry.sourceConversationId,
    sourceRunId: entry.sourceRunId,
  })), [
    {
      id: "memory-2",
      sourceConversationId: undefined,
      sourceRunId: undefined,
    },
    {
      id: "memory-1",
      sourceConversationId: "conversation-123",
      sourceRunId: "run-123",
    },
  ]);
});
