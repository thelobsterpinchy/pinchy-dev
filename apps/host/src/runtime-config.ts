import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;
export type ThinkingLevel = typeof THINKING_LEVELS[number];

export type PinchyRuntimeConfig = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: ThinkingLevel;
};

type RuntimeConfigFile = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
};

function loadJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function normalizeOptionalString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeThinkingLevel(value: string | undefined): ThinkingLevel | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) return undefined;
  return THINKING_LEVELS.includes(trimmed as ThinkingLevel) ? trimmed as ThinkingLevel : undefined;
}

export function loadPinchyRuntimeConfig(cwd: string): PinchyRuntimeConfig {
  const file = loadJsonFile<RuntimeConfigFile>(resolve(cwd, ".pinchy-runtime.json")) ?? {};

  return {
    defaultProvider: normalizeOptionalString(process.env.PINCHY_DEFAULT_PROVIDER) ?? normalizeOptionalString(file.defaultProvider),
    defaultModel: normalizeOptionalString(process.env.PINCHY_DEFAULT_MODEL) ?? normalizeOptionalString(file.defaultModel),
    defaultThinkingLevel: normalizeThinkingLevel(process.env.PINCHY_DEFAULT_THINKING_LEVEL) ?? normalizeThinkingLevel(file.defaultThinkingLevel),
  };
}
