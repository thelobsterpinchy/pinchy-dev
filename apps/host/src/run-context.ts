import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RunContext } from "../../../packages/shared/src/contracts.js";

const FILE = ".pinchy-run-context.json";

export function loadRunContext(cwd: string): RunContext | undefined {
  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunContext;
  } catch {
    return undefined;
  }
}

export function saveRunContext(cwd: string, context: RunContext) {
  const path = resolve(cwd, FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(context, null, 2), "utf8");
}

export function clearRunContext(cwd: string) {
  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return;
  try {
    writeFileSync(path, "", "utf8");
  } catch {
    // best effort clear
  }
}

export function createRunContext(cwd: string, label: string): RunContext {
  const context: RunContext = {
    currentRunId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    currentRunLabel: label,
    updatedAt: new Date().toISOString(),
  };
  saveRunContext(cwd, context);
  return context;
}

export function setRunContext(cwd: string, context: RunContext) {
  saveRunContext(cwd, {
    ...context,
    updatedAt: context.updatedAt ?? new Date().toISOString(),
  });
  return context;
}
