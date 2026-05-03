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

function normalizeLoadedMemoryEntry(entry: unknown): SavedMemory | undefined {
  if (!entry || typeof entry !== "object") return undefined;

  const record = entry as Partial<SavedMemory> & { tags?: unknown };
  if (typeof record.kind !== "string" || !isMemoryKind(record.kind)) return undefined;
  if (typeof record.id !== "string" || typeof record.title !== "string" || typeof record.content !== "string") {
    return undefined;
  }
  if (typeof record.createdAt !== "string" || typeof record.updatedAt !== "string") {
    return undefined;
  }

  return {
    id: record.id,
    title: record.title,
    content: record.content,
    kind: record.kind,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : [],
    pinned: record.pinned === true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceConversationId: typeof record.sourceConversationId === "string" ? record.sourceConversationId : undefined,
    sourceRunId: typeof record.sourceRunId === "string" ? record.sourceRunId : undefined,
  };
}

export function loadMemoryEntries(cwd: string): SavedMemory[] {
  const path = getMemoryPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortEntries(parsed.map((entry) => normalizeLoadedMemoryEntry(entry)).filter((entry): entry is SavedMemory => Boolean(entry)));
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
