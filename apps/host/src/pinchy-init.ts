import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_WATCH_CONFIG } from "./watch-config-defaults.js";

const PINCHY_GITIGNORE_LINES = [
  ".pinchy/run/",
  ".pinchy/state/",
  ".pinchy-approvals.json",
  ".pinchy-daemon-health.json",
  ".pinchy-memory.json",
  ".pinchy-run-context.json",
  ".pinchy-run-history.json",
  ".pinchy-tasks.json",
  ".pinchy-tasks.json.bak-*",
  ".pinchy-workspaces.json",
  "artifacts/",
  "logs/*.log",
  "logs/*.jsonl",
];

type InitPlanInput = {
  cwd: string;
  packageRoot: string;
  existingFiles: Set<string>;
  existingGitignore: string;
};

type PlannedWrite = {
  path: string;
  content: string;
};

type PlannedCopy = {
  from: string;
  to: string;
};

export type PinchyInitPlan = {
  copyPaths: PlannedCopy[];
  writeFiles: PlannedWrite[];
  gitignoreText: string;
};

function withTrailingNewline(text: string) {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function buildDefaultRuntimeConfig() {
  return `${JSON.stringify({
    defaultProvider: "",
    defaultModel: "",
    defaultThinkingLevel: "medium",
  }, null, 2)}\n`;
}

function buildDefaultGoalsConfig() {
  return `${JSON.stringify({
    enabled: true,
    intervalMs: 30 * 60 * 1000,
    goals: [
      "Run a safe self-improvement cycle for this repository. Prefer small, auditable changes.",
      "Run a safe local debugging readiness review for this repository and improve only obvious small gaps.",
    ],
  }, null, 2)}\n`;
}

function buildDefaultWatchConfig() {
  return `${JSON.stringify(DEFAULT_WATCH_CONFIG, null, 2)}\n`;
}

function mergeGitignore(existingGitignore: string) {
  const lines = existingGitignore ? withTrailingNewline(existingGitignore).split("\n") : [];
  const existing = new Set(lines.filter(Boolean));
  const merged = [...lines.filter(Boolean)];
  for (const line of PINCHY_GITIGNORE_LINES) {
    if (!existing.has(line)) {
      merged.push(line);
    }
  }
  return merged.length > 0 ? `${merged.join("\n")}\n` : "";
}

export function buildPinchyInitPlan(input: InitPlanInput): PinchyInitPlan {
  const copyPaths: PlannedCopy[] = [];
  const writeFiles: PlannedWrite[] = [];

  const dotPiPath = resolve(input.cwd, ".pi");
  if (!input.existingFiles.has(dotPiPath)) {
    copyPaths.push({ from: resolve(input.packageRoot, ".pi"), to: dotPiPath });
  }

  const runtimeConfigPath = resolve(input.cwd, ".pinchy-runtime.json");
  if (!input.existingFiles.has(runtimeConfigPath)) {
    writeFiles.push({ path: runtimeConfigPath, content: buildDefaultRuntimeConfig() });
  }

  const goalsConfigPath = resolve(input.cwd, ".pinchy-goals.json");
  if (!input.existingFiles.has(goalsConfigPath)) {
    writeFiles.push({ path: goalsConfigPath, content: buildDefaultGoalsConfig() });
  }

  const watchConfigPath = resolve(input.cwd, ".pinchy-watch.json");
  if (!input.existingFiles.has(watchConfigPath)) {
    writeFiles.push({ path: watchConfigPath, content: buildDefaultWatchConfig() });
  }

  return {
    copyPaths,
    writeFiles,
    gitignoreText: mergeGitignore(input.existingGitignore),
  };
}

export function formatPinchyInitSummary(cwd: string, plan: PinchyInitPlan) {
  return [
    `[pinchy] Initialized workspace at ${cwd}`,
    `[pinchy] copied: ${plan.copyPaths.length} paths`,
    `[pinchy] wrote: ${plan.writeFiles.length} files`,
    "[pinchy] Next steps:",
    "[pinchy]   pinchy doctor",
    "[pinchy]   pinchy up",
    "[pinchy]   pinchy agent",
  ].join("\n");
}

export function initializePinchyWorkspace(cwd: string, packageRoot: string) {
  const gitignorePath = resolve(cwd, ".gitignore");
  const plan = buildPinchyInitPlan({
    cwd,
    packageRoot,
    existingFiles: new Set([
      resolve(cwd, ".pi"),
      resolve(cwd, ".pinchy-runtime.json"),
      resolve(cwd, ".pinchy-goals.json"),
      resolve(cwd, ".pinchy-watch.json"),
    ].filter((path) => existsSync(path))),
    existingGitignore: existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "",
  });

  for (const copy of plan.copyPaths) {
    mkdirSync(dirname(copy.to), { recursive: true });
    cpSync(copy.from, copy.to, { recursive: true });
  }

  for (const file of plan.writeFiles) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content, "utf8");
  }

  writeFileSync(gitignorePath, plan.gitignoreText, "utf8");
  return plan;
}
