import { DefaultResourceLoader, type ExtensionFactory } from "@mariozechner/pi-coding-agent";
import type { RuntimeModelOptions } from "../../../apps/host/src/runtime-config.js";

export function hasRuntimeModelOptions(options: RuntimeModelOptions | undefined) {
  return Boolean(options && Object.values(options).some((value) => value !== undefined));
}

export function applyRuntimeModelOptionsToPayload(payload: unknown, options: RuntimeModelOptions | undefined) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !hasRuntimeModelOptions(options)) {
    return payload;
  }

  const nextPayload = { ...(payload as Record<string, unknown>) };
  const config = options!;

  if (config.temperature !== undefined) nextPayload.temperature = config.temperature;
  if (config.topP !== undefined) nextPayload.top_p = config.topP;
  if (config.topK !== undefined) nextPayload.top_k = config.topK;
  if (config.minP !== undefined) nextPayload.min_p = config.minP;
  if (config.seed !== undefined) nextPayload.seed = config.seed;
  if (config.stop !== undefined) nextPayload.stop = config.stop;
  if (config.repeatPenalty !== undefined) nextPayload.repetition_penalty = config.repeatPenalty;
  if (config.frequencyPenalty !== undefined) nextPayload.frequency_penalty = config.frequencyPenalty;
  if (config.presencePenalty !== undefined) nextPayload.presence_penalty = config.presencePenalty;
  if (config.maxTokens !== undefined) {
    if ("max_completion_tokens" in nextPayload) nextPayload.max_completion_tokens = config.maxTokens;
    else nextPayload.max_tokens = config.maxTokens;
  }

  const originalOptions = nextPayload.options;
  if (originalOptions && typeof originalOptions === "object") {
    const nestedOptions = { ...(originalOptions as Record<string, unknown>) };
    if (config.temperature !== undefined) nestedOptions.temperature = config.temperature;
    if (config.topP !== undefined) nestedOptions.top_p = config.topP;
    if (config.topK !== undefined) nestedOptions.top_k = config.topK;
    if (config.minP !== undefined) nestedOptions.min_p = config.minP;
    if (config.maxTokens !== undefined) nestedOptions.num_predict = config.maxTokens;
    if (config.seed !== undefined) nestedOptions.seed = config.seed;
    if (config.stop !== undefined) nestedOptions.stop = config.stop;
    if (config.repeatPenalty !== undefined) nestedOptions.repeat_penalty = config.repeatPenalty;
    if (config.frequencyPenalty !== undefined) nestedOptions.frequency_penalty = config.frequencyPenalty;
    if (config.presencePenalty !== undefined) nestedOptions.presence_penalty = config.presencePenalty;
    if (config.contextWindow !== undefined) nestedOptions.num_ctx = config.contextWindow;
    nextPayload.options = nestedOptions;
  }

  return nextPayload;
}

export function buildRuntimeModelSettingsExtensionFactory(options: RuntimeModelOptions | undefined): ExtensionFactory | undefined {
  if (!hasRuntimeModelOptions(options)) return undefined;
  return (pi) => {
    pi.on("before_provider_request", (event) => applyRuntimeModelOptionsToPayload(event.payload, options));
  };
}

export async function createRuntimeModelSettingsResourceLoader(args: {
  cwd: string;
  agentDir: string;
  options: RuntimeModelOptions | undefined;
}) {
  const extensionFactory = buildRuntimeModelSettingsExtensionFactory(args.options);
  if (!extensionFactory) return undefined;
  const resourceLoader = new DefaultResourceLoader({
    cwd: args.cwd,
    agentDir: args.agentDir,
    extensionFactories: [extensionFactory],
  });
  await resourceLoader.reload();
  return resourceLoader;
}
