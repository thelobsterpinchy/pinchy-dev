import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RunHistoryEntry } from "../../../packages/shared/src/contracts.js";

const FILE = ".pinchy-run-history.json";
const MAX_ENTRIES = 100;

export function loadRunHistory(cwd: string): RunHistoryEntry[] {
  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed as RunHistoryEntry[] : [];
  } catch {
    return [];
  }
}

export function saveRunHistory(cwd: string, entries: RunHistoryEntry[]) {
  const path = resolve(cwd, FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2), "utf8");
}

export function appendRunHistory(cwd: string, entry: Omit<RunHistoryEntry, "id" | "ts"> & { id?: string; ts?: string }) {
  const entries = loadRunHistory(cwd);
  const next: RunHistoryEntry = {
    id: entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: entry.ts ?? new Date().toISOString(),
    kind: entry.kind,
    label: entry.label,
    status: entry.status,
    details: entry.details,
  };
  saveRunHistory(cwd, [next, ...entries]);
  return next;
}
