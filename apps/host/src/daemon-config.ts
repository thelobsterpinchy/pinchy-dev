import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type GoalConfig = {
  enabled?: boolean;
  goals?: string[];
  intervalMs?: number;
};

function parseBooleanEnv(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function loadJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function parseEnvGoals(): string[] {
  const raw = process.env.PINCHY_DAEMON_GOALS?.trim();
  if (!raw) return [];
  return raw.split("||").map((value) => value.trim()).filter(Boolean);
}

function getDefaultGoals() {
  return [
    "Run a safe self-improvement cycle for this repository. Inspect docs, prompts, extensions, tests, and scripts. Prefer small improvements, tests, and safety. Use /skill:self-improvement-loop if helpful.",
    "Run a safe local debugging readiness review for this repository. Inspect browser debugging, desktop observation, and guardrail workflows for small high-value improvements.",
  ];
}

export function loadDaemonGoalsConfig(cwd: string) {
  const config = loadJsonFile<GoalConfig>(resolve(cwd, ".pinchy-goals.json")) ?? {};
  const envGoals = parseEnvGoals();
  const enabledOverride = parseBooleanEnv(process.env.PINCHY_DAEMON_AUTO_IMPROVEMENTS);

  return {
    enabled: enabledOverride ?? config.enabled ?? true,
    goals: envGoals.length > 0 ? envGoals : config.goals?.length ? config.goals : getDefaultGoals(),
    intervalMs: Number(process.env.PINCHY_DAEMON_INTERVAL_MS ?? config.intervalMs ?? 30 * 60 * 1000),
  };
}
