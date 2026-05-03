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
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function parseEnvGoals(): string[] {
  const raw = process.env.PINCHY_DAEMON_GOALS?.trim();
  if (!raw) return [];
  return raw.split("||").map((value) => value.trim()).filter(Boolean);
}

function getDefaultGoals() {
  return [
    "Run a safe self-improvement cycle for this repository. Inspect docs, prompts, extensions, tests, and scripts. Prefer docs, prompts, tests, guardrails, and small refactors. Avoid edited files with unrelated dirty-worktree changes. Validate any changes when practical. If no safe improvement is warranted, explain why and stop. Use /skill:self-improvement-loop if helpful.",
    "Run a safe local debugging readiness review for this repository. Inspect browser debugging, desktop observation, and guardrail workflows for small high-value improvements.",
  ];
}

function parseIntervalMs(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : undefined;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function loadDaemonGoalsConfig(cwd: string) {
  const config = loadJsonFile<GoalConfig>(resolve(cwd, ".pinchy-goals.json")) ?? {};
  const envGoals = parseEnvGoals();
  const enabledOverride = parseBooleanEnv(process.env.PINCHY_DAEMON_AUTO_IMPROVEMENTS);

  return {
    enabled: enabledOverride ?? config.enabled ?? true,
    goals: envGoals.length > 0 ? envGoals : config.goals?.length ? config.goals : getDefaultGoals(),
    intervalMs: parseIntervalMs(process.env.PINCHY_DAEMON_INTERVAL_MS) ?? parseIntervalMs(config.intervalMs) ?? 30 * 60 * 1000,
  };
}
