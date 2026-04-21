import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isMemoryKind, type MemoryKind, type SavedMemory } from "../../../packages/shared/src/contracts.js";

const FILE = ".pinchy-memory.json";

function getMemoryPath(cwd: string) {
  return resolve(cwd, FILE);
}

function saveMemoryEntries(cwd: string, entries: SavedMemory[]) {
  const path = getMemoryPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2), "utf8");
}

function sortEntries(entries: SavedMemory[]) {
  return [...entries].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    if (left.updatedAt !== right.updatedAt) {
      return right.updatedAt.localeCompare(left.updatedAt);
    }
    return right.id.localeCompare(left.id);
  });
}

export function loadMemoryEntries(cwd: string): SavedMemory[] {
  const path = getMemoryPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as SavedMemory[];
    return sortEntries(parsed.filter((entry) => isMemoryKind(entry.kind)));
  } catch {
    return [];
  }
}

export function listMemoryEntries(cwd: string, filter: { query?: string } = {}) {
  const query = filter.query?.trim().toLowerCase();
  const entries = loadMemoryEntries(cwd);
  if (!query) return entries;
  return entries.filter((entry) => [entry.title, entry.content, ...entry.tags].join(" ").toLowerCase().includes(query));
}

export function createMemoryEntry(cwd: string, input: {
  title: string;
  content: string;
  kind?: MemoryKind;
  tags?: string[];
  pinned?: boolean;
  sourceConversationId?: string;
  sourceRunId?: string;
}) {
  const entries = loadMemoryEntries(cwd);
  const now = new Date().toISOString();
  const entry: SavedMemory = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    content: input.content,
    kind: input.kind ?? "note",
    tags: [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
    pinned: input.pinned ?? false,
    createdAt: now,
    updatedAt: now,
    sourceConversationId: input.sourceConversationId,
    sourceRunId: input.sourceRunId,
  };
  saveMemoryEntries(cwd, sortEntries([entry, ...entries]));
  return entry;
}

export function updateMemoryEntry(cwd: string, id: string, patch: Partial<Pick<SavedMemory, "title" | "content" | "kind" | "tags" | "pinned" | "sourceConversationId" | "sourceRunId">>) {
  const entries = loadMemoryEntries(cwd);
  const match = entries.find((entry) => entry.id === id);
  if (!match) return undefined;
  if (typeof patch.title === "string") match.title = patch.title;
  if (typeof patch.content === "string") match.content = patch.content;
  if (patch.kind && isMemoryKind(patch.kind)) match.kind = patch.kind;
  if (Array.isArray(patch.tags)) match.tags = [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))];
  if (typeof patch.pinned === "boolean") match.pinned = patch.pinned;
  if (typeof patch.sourceConversationId === "string") match.sourceConversationId = patch.sourceConversationId;
  if (typeof patch.sourceRunId === "string") match.sourceRunId = patch.sourceRunId;
  match.updatedAt = new Date().toISOString();
  saveMemoryEntries(cwd, sortEntries(entries));
  return match;
}

export function deleteMemoryEntry(cwd: string, id: string) {
  const entries = loadMemoryEntries(cwd);
  const match = entries.find((entry) => entry.id === id);
  if (!match) return undefined;
  saveMemoryEntries(cwd, entries.filter((entry) => entry.id !== id));
  return match;
}
