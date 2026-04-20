import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type IterationConfig = {
  enabled?: boolean;
  intervalMs?: number;
  edgeCaseFocus?: string[];
  maxCyclesPerRun?: number;
};

const FILE = ".pinchy-iteration.json";

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
      enabled: parsed.enabled ?? fallback.enabled,
      intervalMs: parsed.intervalMs ?? fallback.intervalMs,
      edgeCaseFocus: parsed.edgeCaseFocus?.length ? parsed.edgeCaseFocus : fallback.edgeCaseFocus,
      maxCyclesPerRun: parsed.maxCyclesPerRun ?? fallback.maxCyclesPerRun,
    };
  } catch {
    return fallback;
  }
}
