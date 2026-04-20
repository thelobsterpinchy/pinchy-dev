import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DaemonHealth } from "../../../packages/shared/src/contracts.js";

const FILE = ".pinchy-daemon-health.json";

export function loadDaemonHealth(cwd: string): DaemonHealth | undefined {
  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DaemonHealth;
  } catch {
    return undefined;
  }
}

export function saveDaemonHealth(cwd: string, health: DaemonHealth) {
  const path = resolve(cwd, FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(health, null, 2), "utf8");
}

export function updateDaemonHealth(cwd: string, patch: Partial<DaemonHealth> & Pick<DaemonHealth, "status">) {
  const now = new Date().toISOString();
  const current = loadDaemonHealth(cwd) ?? {
    pid: process.pid,
    status: "starting",
    startedAt: now,
    heartbeatAt: now,
  } satisfies DaemonHealth;
  const next: DaemonHealth = {
    ...current,
    ...patch,
    pid: patch.pid ?? current.pid ?? process.pid,
    heartbeatAt: patch.heartbeatAt ?? now,
  };
  saveDaemonHealth(cwd, next);
  return next;
}
