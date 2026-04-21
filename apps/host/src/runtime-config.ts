import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;
export type ThinkingLevel = typeof THINKING_LEVELS[number];
export type RuntimeConfigSource = "env" | "workspace" | "pi-agent" | "unset";

export type PinchyRuntimeConfig = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: ThinkingLevel;
  defaultBaseUrl?: string;
};

export type PinchyRuntimeConfigDetails = PinchyRuntimeConfig & {
  sources: {
    defaultProvider: RuntimeConfigSource;
    defaultModel: RuntimeConfigSource;
    defaultThinkingLevel: RuntimeConfigSource;
    defaultBaseUrl: RuntimeConfigSource;
  };
};

type RuntimeConfigFile = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
  defaultBaseUrl?: string;
};

export type RuntimeConfigLoadOptions = {
  globalSettingsPath?: string;
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

function resolveConfigValue<T>(sources: Array<{ value: T | undefined; source: RuntimeConfigSource }>) {
  const match = sources.find((entry) => entry.value !== undefined);
  return {
    value: match?.value,
    source: match?.source ?? "unset",
  };
}

export function loadPinchyRuntimeConfigDetails(cwd: string, options: RuntimeConfigLoadOptions = {}): PinchyRuntimeConfigDetails {
  const workspaceFile = loadJsonFile<RuntimeConfigFile>(resolve(cwd, ".pinchy-runtime.json")) ?? {};
  const globalSettingsPath = options.globalSettingsPath ?? resolve(homedir(), ".pi/agent/settings.json");
  const globalFile = loadJsonFile<RuntimeConfigFile>(globalSettingsPath) ?? {};

  const provider = resolveConfigValue<string>([
    { value: normalizeOptionalString(process.env.PINCHY_DEFAULT_PROVIDER), source: "env" },
    { value: normalizeOptionalString(workspaceFile.defaultProvider), source: "workspace" },
    { value: normalizeOptionalString(globalFile.defaultProvider), source: "pi-agent" },
  ]);
  const model = resolveConfigValue<string>([
    { value: normalizeOptionalString(process.env.PINCHY_DEFAULT_MODEL), source: "env" },
    { value: normalizeOptionalString(workspaceFile.defaultModel), source: "workspace" },
    { value: normalizeOptionalString(globalFile.defaultModel), source: "pi-agent" },
  ]);
  const thinking = resolveConfigValue<ThinkingLevel>([
    { value: normalizeThinkingLevel(process.env.PINCHY_DEFAULT_THINKING_LEVEL), source: "env" },
    { value: normalizeThinkingLevel(workspaceFile.defaultThinkingLevel), source: "workspace" },
    { value: normalizeThinkingLevel(globalFile.defaultThinkingLevel), source: "pi-agent" },
  ]);
  const baseUrl = resolveConfigValue<string>([
    { value: normalizeOptionalString(process.env.PINCHY_DEFAULT_BASE_URL), source: "env" },
    { value: normalizeOptionalString(workspaceFile.defaultBaseUrl), source: "workspace" },
  ]);

  return {
    defaultProvider: provider.value,
    defaultModel: model.value,
    defaultThinkingLevel: thinking.value,
    defaultBaseUrl: baseUrl.value,
    sources: {
      defaultProvider: provider.source,
      defaultModel: model.source,
      defaultThinkingLevel: thinking.source,
      defaultBaseUrl: baseUrl.source,
    },
  };
}

export function loadPinchyRuntimeConfig(cwd: string, options: RuntimeConfigLoadOptions = {}): PinchyRuntimeConfig {
  const details = loadPinchyRuntimeConfigDetails(cwd, options);
  return {
    defaultProvider: details.defaultProvider,
    defaultModel: details.defaultModel,
    defaultThinkingLevel: details.defaultThinkingLevel,
    defaultBaseUrl: details.defaultBaseUrl,
  };
}
