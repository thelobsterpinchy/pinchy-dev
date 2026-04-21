import type { PinchyRuntimeConfig } from "./runtime-config.js";

export function summarizePinchyConfigView(config: PinchyRuntimeConfig) {
  return [
    "[pinchy] Current Pinchy runtime config:",
    `[pinchy] defaultProvider: ${config.defaultProvider ?? ""}`,
    `[pinchy] defaultModel: ${config.defaultModel ?? ""}`,
    `[pinchy] defaultThinkingLevel: ${config.defaultThinkingLevel ?? ""}`,
    `[pinchy] defaultBaseUrl: ${config.defaultBaseUrl ?? ""}`,
  ].join("\n") + "\n";
}

export function summarizePinchyConfigSet(key: string, value: string) {
  return [
    "[pinchy] Updated runtime config:",
    `[pinchy] ${key} = ${value}`,
    "[pinchy] Next step: pinchy config view",
  ].join("\n") + "\n";
}
