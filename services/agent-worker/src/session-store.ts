import fs from "node:fs";
import path from "node:path";

export type SessionEntry = {
  id: string;
  sessionPath: string;
  conversationId?: string;
  sourceRunId?: string;
  runtimeConfigSignature?: string;
  createdAt: string;
  updatedAt: string;
};

const SESSIONS_DIR_NAME = ".pinchy";
const SESSIONS_SUBDIR = "sessions";

function getSessionsDir(cwd: string): string {
  return path.resolve(cwd, SESSIONS_DIR_NAME, SESSIONS_SUBDIR);
}

export function ensureSessionsDir(cwd: string): string {
  const dir = getSessionsDir(cwd);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getEntryPath(sessionsDir: string, sessionId: string): string {
  return path.join(sessionsDir, `${sessionId}.json`);
}

export function saveSessionEntry(cwd: string, entry: Omit<SessionEntry, "createdAt" | "updatedAt">): SessionEntry {
  const sessionsDir = ensureSessionsDir(cwd);
  const now = new Date().toISOString();
  const fullEntry: SessionEntry = {
    ...entry,
    createdAt: now,
    updatedAt: now,
  };
  fs.writeFileSync(getEntryPath(sessionsDir, entry.id), JSON.stringify(fullEntry, null, 2));
  return fullEntry;
}

export function updateSessionEntry(cwd: string, sessionId: string, patch: Partial<Pick<SessionEntry, "sessionPath" | "conversationId" | "sourceRunId" | "runtimeConfigSignature">>): SessionEntry | undefined {
  const sessionsDir = ensureSessionsDir(cwd);
  const entryPath = getEntryPath(sessionsDir, sessionId);
  if (!fs.existsSync(entryPath)) return undefined;
  
  const existing = JSON.parse(fs.readFileSync(entryPath, "utf8")) as SessionEntry;
  const updated: SessionEntry = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(entryPath, JSON.stringify(updated, null, 2));
  return updated;
}

export function getSessionEntry(cwd: string, sessionId: string): SessionEntry | undefined {
  const sessionsDir = ensureSessionsDir(cwd);
  const entryPath = getEntryPath(sessionsDir, sessionId);
  if (!fs.existsSync(entryPath)) return undefined;
  
  return JSON.parse(fs.readFileSync(entryPath, "utf8")) as SessionEntry;
}

export function listSessionEntries(cwd: string): SessionEntry[] {
  const sessionsDir = ensureSessionsDir(cwd);
  if (!fs.existsSync(sessionsDir)) return [];
  
  return fs.readdirSync(sessionsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(sessionsDir, file))
    .map((filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")) as SessionEntry)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteSessionEntry(cwd: string, sessionId: string): boolean {
  const sessionsDir = ensureSessionsDir(cwd);
  const entryPath = getEntryPath(sessionsDir, sessionId);
  if (!fs.existsSync(entryPath)) return false;
  
  fs.unlinkSync(entryPath);
  return true;
}

export function findSessionByConversationId(cwd: string, conversationId: string): SessionEntry | undefined {
  const sessionsDir = ensureSessionsDir(cwd);
  if (!fs.existsSync(sessionsDir)) return undefined;
  
  return fs.readdirSync(sessionsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(sessionsDir, file))
    .map((filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")) as SessionEntry)
    .find((entry) => entry.conversationId === conversationId);
}

export function findSessionsByRuntimeConfigSignature(cwd: string, signature: string): SessionEntry[] {
  const sessionsDir = ensureSessionsDir(cwd);
  if (!fs.existsSync(sessionsDir)) return [];
  
  return fs.readdirSync(sessionsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(sessionsDir, file))
    .map((filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")) as SessionEntry)
    .filter((entry) => entry.runtimeConfigSignature === signature)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function cleanupStaleSessions(cwd: string, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const sessions = listSessionEntries(cwd);
  const now = Date.now();
  let deletedCount = 0;
  
  for (const session of sessions) {
    const createdAtMs = new Date(session.createdAt).getTime();
    if (now - createdAtMs > maxAgeMs) {
      if (deleteSessionEntry(cwd, session.id)) {
        deletedCount += 1;
      }
    }
  }
  
  return deletedCount;
}
