import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type IterationConfig = {
  enabled?: boolean;
  intervalMs?: number;
  edgeCaseFocus?: string[];
  maxCyclesPerRun?: number;
};

const FILE = ".pinchy-iteration.json";

function parsePositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parsePositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseEdgeCaseFocus(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return undefined;
    const trimmed = entry.trim();
    if (!trimmed) return undefined;
    normalized.push(trimmed);
  }
  return normalized.length > 0 ? normalized : undefined;
}

export function loadIterationConfig(cwd: string): Required<IterationConfig> {
  const fallback: Required<IterationConfig> = {
    enabled: true,
    intervalMs: 45 * 60 * 1000,
    edgeCaseFocus: [
      "empty inputs",
      "null/undefined handling",
      "boundary values",
      "error paths",
      "race conditions or timing assumptions",
      "UI states after retries or loading failures",
    ],
    maxCyclesPerRun: 1,
  };

  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as IterationConfig;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : fallback.enabled,
      intervalMs: parsePositiveNumber(parsed.intervalMs) ?? fallback.intervalMs,
      edgeCaseFocus: parseEdgeCaseFocus(parsed.edgeCaseFocus) ?? fallback.edgeCaseFocus,
      maxCyclesPerRun: parsePositiveInteger(parsed.maxCyclesPerRun) ?? fallback.maxCyclesPerRun,
    };
  } catch {
    return fallback;
  }
}
