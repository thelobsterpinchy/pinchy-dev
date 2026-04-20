import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type SessionApproval = {
  scopes: Record<string, boolean>;
};

const FILE = ".pinchy-session-approvals.json";

export function loadSessionApprovals(cwd: string): SessionApproval {
  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return { scopes: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SessionApproval;
  } catch {
    return { scopes: {} };
  }
}

export function saveSessionApprovals(cwd: string, value: SessionApproval) {
  const path = resolve(cwd, FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

export function setSessionScope(cwd: string, scope: string, enabled: boolean) {
  const current = loadSessionApprovals(cwd);
  current.scopes[scope] = enabled;
  saveSessionApprovals(cwd, current);
  return current;
}

export function isSessionScopeEnabled(cwd: string, scope: string) {
  return loadSessionApprovals(cwd).scopes[scope] === true;
}
