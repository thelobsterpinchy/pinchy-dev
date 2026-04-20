import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ReloadRequest } from "../../../packages/shared/src/contracts.js";

const FILE = ".pinchy-reload-requests.json";

function loadAll(cwd: string): ReloadRequest[] {
  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ReloadRequest[];
  } catch {
    return [];
  }
}

function saveAll(cwd: string, requests: ReloadRequest[]) {
  const path = resolve(cwd, FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(requests, null, 2), "utf8");
}

export function queueReloadRequest(cwd: string, toolName?: string) {
  const requests = loadAll(cwd);
  const next: ReloadRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    toolName,
    requestedAt: new Date().toISOString(),
    status: "pending",
  };
  saveAll(cwd, [...requests, next]);
  return next;
}

export function getPendingReloadRequests(cwd: string) {
  return loadAll(cwd).filter((entry) => entry.status === "pending");
}

export function consumeNextReloadRequest(cwd: string) {
  const requests = loadAll(cwd);
  const next = requests.find((entry) => entry.status === "pending");
  if (!next) return undefined;
  next.status = "processed";
  saveAll(cwd, requests);
  return next;
}
