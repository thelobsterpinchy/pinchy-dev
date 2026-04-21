import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const AUDIT_FILE = "logs/pinchy-audit.jsonl";

export type AuditLogEntry = {
  ts: string;
  type: string;
  runId?: string;
  questionId?: string;
  conversationId?: string;
  summary?: string;
  error?: string;
  details?: Record<string, unknown>;
};

function getAuditFilePath(cwd: string) {
  return resolve(cwd, AUDIT_FILE);
}

export function appendAuditEntry(cwd: string, entry: Omit<AuditLogEntry, "ts"> & { ts?: string }) {
  const path = getAuditFilePath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const nextEntry: AuditLogEntry = {
    ts: entry.ts ?? new Date().toISOString(),
    type: entry.type,
    runId: entry.runId,
    questionId: entry.questionId,
    conversationId: entry.conversationId,
    summary: entry.summary,
    error: entry.error,
    details: entry.details,
  };
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  writeFileSync(path, `${existing}${JSON.stringify(nextEntry)}\n`, "utf8");
  return nextEntry;
}

export function readAuditEntries(cwd: string) {
  const path = getAuditFilePath(cwd);
  if (!existsSync(path)) return [] as AuditLogEntry[];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditLogEntry);
}
