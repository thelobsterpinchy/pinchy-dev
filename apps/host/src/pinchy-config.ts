import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const PINCHY_CONFIG_KEYS = ["defaultProvider", "defaultModel", "defaultThinkingLevel", "defaultBaseUrl", "autoDeleteEnabled", "autoDeleteDays", "dangerModeEnabled"] as const;
export type PinchyConfigKey = typeof PINCHY_CONFIG_KEYS[number];

type RuntimeConfigValue = string | boolean | number;
type RuntimeConfigRecord = Partial<Record<PinchyConfigKey, RuntimeConfigValue>>;

function loadRuntimeConfigFile(cwd: string): RuntimeConfigRecord {
  const path = resolve(cwd, ".pinchy-runtime.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RuntimeConfigRecord;
  } catch {
    return {};
  }
}

function saveRuntimeConfigFile(cwd: string, value: RuntimeConfigRecord) {
  writeFileSync(resolve(cwd, ".pinchy-runtime.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertSupportedConfigKey(key: string): asserts key is PinchyConfigKey {
  if (!PINCHY_CONFIG_KEYS.includes(key as PinchyConfigKey)) {
    throw new Error(`Unsupported config key: ${key}`);
  }
}

export function readPinchyConfigValue(cwd: string, key: string) {
  assertSupportedConfigKey(key);
  return loadRuntimeConfigFile(cwd)[key];
}

export function setPinchyConfigValue(cwd: string, key: string, value: RuntimeConfigValue) {
  assertSupportedConfigKey(key);
  const config = loadRuntimeConfigFile(cwd);
  config[key] = value;
  saveRuntimeConfigFile(cwd, config);
}
