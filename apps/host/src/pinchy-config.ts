import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PinchyRuntimeConfig } from "./runtime-config.js";

export const PINCHY_CONFIG_KEYS = ["defaultProvider", "defaultModel", "defaultThinkingLevel", "defaultBaseUrl", "autoDeleteEnabled", "autoDeleteDays", "toolRetryWarningThreshold", "toolRetryHardStopThreshold", "dangerModeEnabled"] as const;
export type PinchyConfigKey = typeof PINCHY_CONFIG_KEYS[number];

type RuntimeConfigValue = string | boolean | number;
type RuntimeConfigRecord = Omit<PinchyRuntimeConfig, PinchyConfigKey> & Partial<Record<PinchyConfigKey, RuntimeConfigValue>>;

function runtimeConfigPath(cwd: string) {
  return resolve(cwd, ".pinchy-runtime.json");
}

export function loadPinchyRuntimeConfigFile(cwd: string): RuntimeConfigRecord {
  const path = runtimeConfigPath(cwd);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RuntimeConfigRecord;
  } catch {
    return {};
  }
}

export function savePinchyRuntimeConfigFile(cwd: string, value: RuntimeConfigRecord) {
  writeFileSync(runtimeConfigPath(cwd), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertSupportedConfigKey(key: string): asserts key is PinchyConfigKey {
  if (!PINCHY_CONFIG_KEYS.includes(key as PinchyConfigKey)) {
    throw new Error(`Unsupported config key: ${key}`);
  }
}

export function readPinchyConfigValue(cwd: string, key: string) {
  assertSupportedConfigKey(key);
  return loadPinchyRuntimeConfigFile(cwd)[key];
}

function parseBooleanConfigValue(key: PinchyConfigKey, value: string) {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value for ${key}: ${value}`);
}

function parsePositiveIntegerConfigValue(key: PinchyConfigKey, value: string) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new Error(`Invalid positive integer value for ${key}: ${value}`);
}

export function parsePinchyConfigCliValue(key: string, value: string): RuntimeConfigValue {
  assertSupportedConfigKey(key);
  if (["autoDeleteEnabled", "dangerModeEnabled"].includes(key)) {
    return parseBooleanConfigValue(key, value);
  }
  if (["autoDeleteDays", "toolRetryWarningThreshold", "toolRetryHardStopThreshold"].includes(key)) {
    return parsePositiveIntegerConfigValue(key, value);
  }
  return value;
}

export function setPinchyConfigValue(cwd: string, key: string, value: RuntimeConfigValue) {
  assertSupportedConfigKey(key);
  const config = loadPinchyRuntimeConfigFile(cwd);
  config[key] = value;
  savePinchyRuntimeConfigFile(cwd, config);
}

export function updatePinchyRuntimeConfig(cwd: string, patch: Partial<RuntimeConfigRecord>) {
  const config = loadPinchyRuntimeConfigFile(cwd);
  savePinchyRuntimeConfigFile(cwd, {
    ...config,
    ...patch,
  });
}
