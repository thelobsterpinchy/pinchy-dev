import type { PinchyRuntimeConfig, RuntimeModelOptions, ThinkingLevel } from "../../../apps/host/src/runtime-config.js";

export type RuntimeModelRole = "orchestration" | "subagent";

export type RuntimeModelSelection = {
  provider?: string;
  modelId?: string;
  baseUrl?: string;
  thinkingLevel?: ThinkingLevel;
  modelOptions?: RuntimeModelOptions;
};

export function selectRuntimeModel(config: PinchyRuntimeConfig, role: RuntimeModelRole): RuntimeModelSelection {
  if (role === "orchestration") {
    return {
      provider: config.orchestrationProvider ?? config.defaultProvider,
      modelId: config.orchestrationModel ?? config.defaultModel,
      baseUrl: config.orchestrationBaseUrl ?? config.defaultBaseUrl,
      thinkingLevel: config.defaultThinkingLevel,
      modelOptions: config.modelOptions,
    };
  }

  return {
    provider: config.subagentProvider ?? config.defaultProvider,
    modelId: config.subagentModel ?? config.defaultModel,
    baseUrl: config.subagentBaseUrl ?? config.defaultBaseUrl,
    thinkingLevel: config.defaultThinkingLevel,
    modelOptions: config.modelOptions,
  };
}
