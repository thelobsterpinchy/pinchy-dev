import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;
export type ThinkingLevel = typeof THINKING_LEVELS[number];
export type RuntimeConfigSource = "env" | "workspace" | "pi-agent" | "unset";

export type RuntimeModelOptions = {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  maxTokens?: number;
  seed?: number;
  stop?: string[];
  repeatPenalty?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  contextWindow?: number;
};

export type SavedModelConfig = {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  thinkingLevel?: ThinkingLevel;
  modelOptions?: RuntimeModelOptions;
};

export type PinchyRuntimeConfig = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: ThinkingLevel;
  defaultBaseUrl?: string;
  modelOptions?: RuntimeModelOptions;
  orchestrationModel?: string;
  subagentModel?: string;
  savedModelConfigs?: SavedModelConfig[];
  autoDeleteEnabled?: boolean;
  autoDeleteDays?: number;
  toolRetryWarningThreshold?: number;
  toolRetryHardStopThreshold?: number;
  dangerModeEnabled?: boolean;
};

export type PinchyRuntimeConfigDetails = PinchyRuntimeConfig & {
  sources: {
    defaultProvider: RuntimeConfigSource;
    defaultModel: RuntimeConfigSource;
    defaultThinkingLevel: RuntimeConfigSource;
    defaultBaseUrl: RuntimeConfigSource;
    orchestrationModel: RuntimeConfigSource;
    subagentModel: RuntimeConfigSource;
    autoDeleteEnabled: RuntimeConfigSource;
    autoDeleteDays: RuntimeConfigSource;
    toolRetryWarningThreshold: RuntimeConfigSource;
    toolRetryHardStopThreshold: RuntimeConfigSource;
    dangerModeEnabled: RuntimeConfigSource;
  };
};

type RuntimeConfigFile = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
  defaultBaseUrl?: string;
  modelOptions?: unknown;
  savedModelConfigs?: unknown;
  orchestrationModel?: string;
  subagentModel?: string;
  autoDeleteEnabled?: boolean;
  autoDeleteDays?: number;
  toolRetryWarningThreshold?: number;
  toolRetryHardStopThreshold?: number;
  dangerModeEnabled?: boolean;
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

function normalizeOptionalBoolean(value: boolean | undefined) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeOptionalPositiveInteger(value: number | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeOptionalFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .flatMap((entry) => typeof entry === "string" && entry.trim().length > 0 ? [entry] : []);
  return items.length > 0 ? items : undefined;
}

export function normalizeRuntimeModelOptions(value: unknown): RuntimeModelOptions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const normalized: RuntimeModelOptions = {};

  const temperature = normalizeOptionalFiniteNumber(record.temperature);
  if (temperature !== undefined) normalized.temperature = temperature;

  const topP = normalizeOptionalFiniteNumber(record.topP);
  if (topP !== undefined) normalized.topP = topP;

  const topK = normalizeOptionalPositiveInteger(record.topK as number | undefined);
  if (topK !== undefined) normalized.topK = topK;

  const minP = normalizeOptionalFiniteNumber(record.minP);
  if (minP !== undefined) normalized.minP = minP;

  const maxTokens = normalizeOptionalPositiveInteger(record.maxTokens as number | undefined);
  if (maxTokens !== undefined) normalized.maxTokens = maxTokens;

  const seed = typeof record.seed === "number" && Number.isInteger(record.seed) ? record.seed : undefined;
  if (seed !== undefined) normalized.seed = seed;

  const stop = normalizeOptionalStringArray(record.stop);
  if (stop !== undefined) normalized.stop = stop;

  const repeatPenalty = normalizeOptionalFiniteNumber(record.repeatPenalty);
  if (repeatPenalty !== undefined) normalized.repeatPenalty = repeatPenalty;

  const frequencyPenalty = normalizeOptionalFiniteNumber(record.frequencyPenalty);
  if (frequencyPenalty !== undefined) normalized.frequencyPenalty = frequencyPenalty;

  const presencePenalty = normalizeOptionalFiniteNumber(record.presencePenalty);
  if (presencePenalty !== undefined) normalized.presencePenalty = presencePenalty;

  const contextWindow = normalizeOptionalPositiveInteger(record.contextWindow as number | undefined);
  if (contextWindow !== undefined) normalized.contextWindow = contextWindow;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeSavedModelConfigs(value: unknown): SavedModelConfig[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const configs = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const id = normalizeOptionalString(typeof record.id === "string" ? record.id : undefined);
    const name = normalizeOptionalString(typeof record.name === "string" ? record.name : undefined);
    if (!id || !name) return [];

    const config: SavedModelConfig = { id, name };
    const provider = normalizeOptionalString(typeof record.provider === "string" ? record.provider : undefined);
    if (provider !== undefined) config.provider = provider;
    const model = normalizeOptionalString(typeof record.model === "string" ? record.model : undefined);
    if (model !== undefined) config.model = model;
    const baseUrl = normalizeOptionalString(typeof record.baseUrl === "string" ? record.baseUrl : undefined);
    if (baseUrl !== undefined) config.baseUrl = baseUrl;
    const thinkingLevel = normalizeThinkingLevel(typeof record.thinkingLevel === "string" ? record.thinkingLevel : undefined);
    if (thinkingLevel !== undefined) config.thinkingLevel = thinkingLevel;
    const modelOptions = normalizeRuntimeModelOptions(record.modelOptions);
    if (modelOptions !== undefined) config.modelOptions = modelOptions;

    return [config];
  });
  return configs;
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
    { value: normalizeOptionalString(workspaceFile.defaultProvider), source: "workspace" },
    { value: normalizeOptionalString(process.env.PINCHY_DEFAULT_PROVIDER), source: "env" },
    { value: normalizeOptionalString(globalFile.defaultProvider), source: "pi-agent" },
  ]);
  const model = resolveConfigValue<string>([
    { value: normalizeOptionalString(workspaceFile.defaultModel), source: "workspace" },
    { value: normalizeOptionalString(process.env.PINCHY_DEFAULT_MODEL), source: "env" },
    { value: normalizeOptionalString(globalFile.defaultModel), source: "pi-agent" },
  ]);
  const thinking = resolveConfigValue<ThinkingLevel>([
    { value: normalizeThinkingLevel(workspaceFile.defaultThinkingLevel), source: "workspace" },
    { value: normalizeThinkingLevel(process.env.PINCHY_DEFAULT_THINKING_LEVEL), source: "env" },
    { value: normalizeThinkingLevel(globalFile.defaultThinkingLevel), source: "pi-agent" },
  ]);
  const baseUrl = resolveConfigValue<string>([
    { value: normalizeOptionalString(workspaceFile.defaultBaseUrl), source: "workspace" },
    { value: normalizeOptionalString(process.env.PINCHY_DEFAULT_BASE_URL), source: "env" },
  ]);
  const autoDeleteEnabled = resolveConfigValue<boolean>([
    { value: normalizeOptionalBoolean(workspaceFile.autoDeleteEnabled), source: "workspace" },
  ]);
  const autoDeleteDays = resolveConfigValue<number>([
    { value: normalizeOptionalPositiveInteger(workspaceFile.autoDeleteDays), source: "workspace" },
  ]);
  const toolRetryWarningThreshold = resolveConfigValue<number>([
    { value: normalizeOptionalPositiveInteger(workspaceFile.toolRetryWarningThreshold), source: "workspace" },
  ]);
  const toolRetryHardStopThreshold = resolveConfigValue<number>([
    { value: normalizeOptionalPositiveInteger(workspaceFile.toolRetryHardStopThreshold), source: "workspace" },
  ]);
  const dangerModeEnabled = resolveConfigValue<boolean>([
    { value: normalizeOptionalBoolean(workspaceFile.dangerModeEnabled), source: "workspace" },
  ]);

  const orchestrationModel = resolveConfigValue<string>([
    { value: normalizeOptionalString(workspaceFile.orchestrationModel), source: "workspace" },
    { value: normalizeOptionalString(process.env.PINCHY_ORCHESTRATION_MODEL), source: "env" },
    { value: undefined, source: "unset" },
  ]);

  const subagentModel = resolveConfigValue<string>([
    { value: normalizeOptionalString(workspaceFile.subagentModel), source: "workspace" },
    { value: normalizeOptionalString(process.env.PINCHY_SUBAGENT_MODEL), source: "env" },
    { value: undefined, source: "unset" },
  ]);

  return {
    defaultProvider: provider.value,
    defaultModel: model.value,
    defaultThinkingLevel: thinking.value,
    defaultBaseUrl: baseUrl.value,
    modelOptions: normalizeRuntimeModelOptions(workspaceFile.modelOptions),
    savedModelConfigs: normalizeSavedModelConfigs(workspaceFile.savedModelConfigs),
    orchestrationModel: orchestrationModel.value,
    subagentModel: subagentModel.value,
    autoDeleteEnabled: autoDeleteEnabled.value,
    autoDeleteDays: autoDeleteDays.value,
    toolRetryWarningThreshold: toolRetryWarningThreshold.value,
    toolRetryHardStopThreshold: toolRetryHardStopThreshold.value,
    dangerModeEnabled: dangerModeEnabled.value,
    sources: {
      defaultProvider: provider.source,
      defaultModel: model.source,
      defaultThinkingLevel: thinking.source,
      defaultBaseUrl: baseUrl.source,
      orchestrationModel: orchestrationModel.source,
      subagentModel: subagentModel.source,
      autoDeleteEnabled: autoDeleteEnabled.source,
      autoDeleteDays: autoDeleteDays.source,
      toolRetryWarningThreshold: toolRetryWarningThreshold.source,
      toolRetryHardStopThreshold: toolRetryHardStopThreshold.source,
      dangerModeEnabled: dangerModeEnabled.source,
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
    modelOptions: details.modelOptions,
    savedModelConfigs: details.savedModelConfigs,
    orchestrationModel: details.orchestrationModel,
    subagentModel: details.subagentModel,
    autoDeleteEnabled: details.autoDeleteEnabled,
    autoDeleteDays: details.autoDeleteDays,
    toolRetryWarningThreshold: details.toolRetryWarningThreshold,
    toolRetryHardStopThreshold: details.toolRetryHardStopThreshold,
    dangerModeEnabled: details.dangerModeEnabled,
  };
}
