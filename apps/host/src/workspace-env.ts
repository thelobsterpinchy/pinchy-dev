import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function getPinchyWorkspaceEnvPath(cwd: string) {
  return resolve(cwd, ".pinchy/env");
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
  if (!match) return undefined;
  const [, key, rawValue = ""] = match;
  const value = rawValue.trim();
  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      return { key, value: JSON.parse(value) as string };
    } catch {
      return { key, value: value.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\") };
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return { key, value: value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\") };
  }
  return { key, value };
}

export function loadPinchyWorkspaceEnv(cwd: string): Record<string, string> {
  const path = getPinchyWorkspaceEnvPath(cwd);
  if (!existsSync(path)) return {};
  const entries = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .flatMap((line) => {
      const parsed = parseEnvLine(line);
      return parsed ? [[parsed.key, parsed.value] as const] : [];
    });
  return Object.fromEntries(entries);
}

function quoteEnvValue(value: string) {
  return JSON.stringify(value);
}

export function savePinchyWorkspaceEnv(cwd: string, patch: Record<string, string | undefined>) {
  const current = loadPinchyWorkspaceEnv(cwd);
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value.trim() === "") {
      delete next[key];
      continue;
    }
    next[key] = value.trim();
  }

  const path = getPinchyWorkspaceEnvPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    "# Pinchy local environment. This file may contain secrets; do not commit it.",
    ...Object.entries(next)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `export ${key}=${quoteEnvValue(value)}`),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

export function mergePinchyWorkspaceEnv(cwd: string, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...loadPinchyWorkspaceEnv(cwd),
    ...env,
  };
}

export function applyPinchyWorkspaceEnv(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const workspaceEnv = loadPinchyWorkspaceEnv(cwd);
  for (const [key, value] of Object.entries(workspaceEnv)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
  return env;
}
