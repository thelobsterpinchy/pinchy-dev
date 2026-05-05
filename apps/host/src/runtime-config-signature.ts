import type { PinchyRuntimeConfig } from "./runtime-config.js";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildRuntimeConfigSignature(config: Partial<PinchyRuntimeConfig>) {
  return stableSerialize({
    defaultProvider: config.defaultProvider,
    defaultModel: config.defaultModel,
    defaultThinkingLevel: config.defaultThinkingLevel,
    defaultBaseUrl: config.defaultBaseUrl,
    modelOptions: config.modelOptions,
    orchestrationProvider: config.orchestrationProvider,
    orchestrationModel: config.orchestrationModel,
    orchestrationBaseUrl: config.orchestrationBaseUrl,
    subagentProvider: config.subagentProvider,
    subagentModel: config.subagentModel,
    subagentBaseUrl: config.subagentBaseUrl,
  });
}
