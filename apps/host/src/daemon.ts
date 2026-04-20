import {
  createAgentSession,
  getAgentDir,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import chokidar from "chokidar";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getNextPendingTask, updateTaskStatus } from "./task-queue.js";
import { loadDaemonGoalsConfig } from "./daemon-config.js";
import { loadIterationConfig } from "./iteration-config.js";
import { detectValidationPlan } from "./project-detection.js";
import { buildStackAwareIterationGuidance } from "./stack-prompts.js";
import { createRunContext } from "./run-context.js";
import { appendRunHistory } from "./run-history.js";
import { updateDaemonHealth } from "./daemon-health.js";
import { consumeNextReloadRequest } from "./reload-requests.js";

type WatchConfig = {
  watch?: string[];
  debounceMs?: number;
  prompt?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function resolveGoals(cwd: string): { goals: string[]; intervalMs: number } {
  const config = loadDaemonGoalsConfig(cwd);
  return { goals: config.goals, intervalMs: config.intervalMs };
}

function resolveWatchConfig(cwd: string): Required<WatchConfig> {
  const config = loadJsonFile<WatchConfig>(resolve(cwd, ".pinchy-watch.json")) ?? {};
  return {
    watch: config.watch ?? ["README.md", "docs", ".pi", "apps/host/src"],
    debounceMs: config.debounceMs ?? 4000,
    prompt: config.prompt ?? "A watched Pinchy file changed. Run a safe bounded maintenance review for the changed area.",
  };
}

function buildIterationPrompt(cwd: string, cycle: number) {
  const config = loadIterationConfig(cwd);
  const validation = detectValidationPlan(cwd);
  const stackGuidance = buildStackAwareIterationGuidance(cwd);
  return {
    enabled: config.enabled,
    intervalMs: config.intervalMs,
    validationCommand: validation.command,
    prompt: [
      `Continuous iteration cycle ${cycle + 1}.`,
      "Run a bounded defect-hunting and edge-case review for this repository.",
      `Prefer validating with: ${validation.command}. Reason: ${validation.reason}`,
      `Edge-case focus areas: ${config.edgeCaseFocus.join(", ")}`,
      ...stackGuidance,
      "Start by checking whether validation currently passes. If validation fails, diagnose the failure, add or refine tests when practical, and make the smallest safe fix.",
      "Look for weak edge cases, missing regression coverage, brittle assumptions, and UI or runtime error paths.",
      "If you identify a safe bug fix, add or update tests first where practical, then implement the smallest fix, then re-run validation.",
      "If no safe fix is warranted, summarize the edge cases checked and stop this cycle.",
      "Stay within this repository unless explicitly instructed otherwise.",
    ].join("\n\n"),
    maxCyclesPerRun: config.maxCyclesPerRun,
  };
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  updateDaemonHealth(cwd, { status: "starting", pid: process.pid, startedAt: new Date().toISOString(), currentActivity: "boot" });
  let { goals, intervalMs } = resolveGoals(cwd);
  let watchConfig = resolveWatchConfig(cwd);
  let iteration = buildIterationPrompt(cwd, 0);

  const { session } = await createAgentSession({
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.continueRecent(cwd),
  });

  const configWatcher = chokidar.watch([
    resolve(cwd, ".pinchy-goals.json"),
    resolve(cwd, ".pinchy-watch.json"),
    resolve(cwd, ".pinchy-iteration.json"),
  ], {
    ignoreInitial: true,
  });
  configWatcher.on("all", () => {
    const nextGoals = resolveGoals(cwd);
    goals = nextGoals.goals;
    intervalMs = nextGoals.intervalMs;
    watchConfig = resolveWatchConfig(cwd);
    iteration = buildIterationPrompt(cwd, 0);
    console.log(`[pinchy-daemon] reloaded config goals=${goals.length} intervalMs=${intervalMs}`);
  });

  let watcherQueued = false;
  let watcherChangedFiles = new Set<string>();
  let watcherTimer: NodeJS.Timeout | undefined;

  const repoWatcher = chokidar.watch(watchConfig.watch.map((entry) => resolve(cwd, entry)), {
    ignoreInitial: true,
  });
  const queueWatcherPrompt = (filePath: string) => {
    watcherChangedFiles.add(filePath.replace(`${cwd}/`, ""));
    watcherQueued = true;
    if (watcherTimer) clearTimeout(watcherTimer);
    watcherTimer = setTimeout(() => {
      const changed = Array.from(watcherChangedFiles).join("\n");
      appendRunHistory(cwd, { kind: "watch", label: "watcher follow-up", status: "started", details: changed });
      updateDaemonHealth(cwd, { status: "running", currentActivity: "watcher follow-up" });
      void session.followUp([
        watchConfig.prompt,
        `Changed files:\n${changed}`,
        "Stay within this repository. Prefer documentation, tests, prompts, and guardrail updates before broad code changes.",
      ].join("\n\n")).then(() => {
        appendRunHistory(cwd, { kind: "watch", label: "watcher follow-up", status: "completed", details: changed });
        updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
      }).catch((error) => {
        appendRunHistory(cwd, { kind: "watch", label: "watcher follow-up", status: "failed", details: error instanceof Error ? error.message : String(error) });
        updateDaemonHealth(cwd, { status: "error", currentActivity: "watcher follow-up", lastError: error instanceof Error ? error.message : String(error) });
      });
      watcherChangedFiles = new Set<string>();
      watcherQueued = false;
    }, watchConfig.debounceMs);
  };
  repoWatcher.on("add", queueWatcherPrompt);
  repoWatcher.on("change", queueWatcherPrompt);
  repoWatcher.on("unlink", queueWatcherPrompt);

  let cycle = 0;
  let iterationCycle = 0;
  try {
    while (true) {
      updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined });
      const reloadRequest = consumeNextReloadRequest(cwd);
      if (reloadRequest) {
        const label = reloadRequest.toolName ? `reload:${reloadRequest.toolName}` : "reload:runtime";
        createRunContext(cwd, label);
        appendRunHistory(cwd, { kind: "reload", label, status: "started" });
        updateDaemonHealth(cwd, { status: "running", currentActivity: label });
        console.log(`[pinchy-daemon] processing reload request ${reloadRequest.id}`);
        try {
          await session.followUp("/reload-runtime");
          appendRunHistory(cwd, { kind: "reload", label, status: "completed" });
          updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
        } catch (error) {
          appendRunHistory(cwd, { kind: "reload", label, status: "failed", details: error instanceof Error ? error.message : String(error) });
          updateDaemonHealth(cwd, { status: "error", currentActivity: label, lastError: error instanceof Error ? error.message : String(error) });
          throw error;
        }
        await sleep(500);
        continue;
      }
      const task = getNextPendingTask(cwd);
      if (task) {
        updateTaskStatus(cwd, task.id, "running");
        createRunContext(cwd, `task:${task.title}`);
        appendRunHistory(cwd, { kind: "task", label: task.title, status: "started", details: task.prompt });
        updateDaemonHealth(cwd, { status: "running", currentActivity: `task:${task.title}` });
        const taskPrompt = [
          `Queued task: ${task.title}`,
          task.prompt,
          "Stay within this repository unless explicitly instructed otherwise.",
          "Prefer documentation, tests, guardrails, and small refactors over broad rewrites.",
          "When changing behavior, prefer a test-first or regression-test-first workflow.",
        ].join("\n\n");
        console.log(`[pinchy-daemon] running queued task=${task.id}`);
        try {
          await session.prompt(taskPrompt);
          updateTaskStatus(cwd, task.id, "done");
          appendRunHistory(cwd, { kind: "task", label: task.title, status: "completed" });
          updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
        } catch (error) {
          updateTaskStatus(cwd, task.id, "blocked");
          appendRunHistory(cwd, { kind: "task", label: task.title, status: "failed", details: error instanceof Error ? error.message : String(error) });
          updateDaemonHealth(cwd, { status: "error", currentActivity: `task:${task.title}`, lastError: error instanceof Error ? error.message : String(error) });
          throw error;
        }
        await sleep(1000);
        continue;
      }

      if (iteration.enabled && iterationCycle < iteration.maxCyclesPerRun) {
        const currentIteration = buildIterationPrompt(cwd, iterationCycle);
        createRunContext(cwd, `iteration:${iterationCycle + 1}`);
        appendRunHistory(cwd, { kind: "iteration", label: `iteration:${iterationCycle + 1}`, status: "started", details: currentIteration.validationCommand });
        updateDaemonHealth(cwd, { status: "running", currentActivity: `iteration:${iterationCycle + 1}` });
        console.log(`[pinchy-daemon] iteration-cycle=${iterationCycle + 1} intervalMs=${currentIteration.intervalMs}`);
        await session.prompt([
          currentIteration.prompt,
          `Before deeper analysis, run validation if safe using: ${currentIteration.validationCommand}.`,
          "Use the run_validation_command tool when appropriate so validation happens during the loop.",
        ].join("\n\n"));
        appendRunHistory(cwd, { kind: "iteration", label: `iteration:${iterationCycle + 1}`, status: "completed" });
        updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
        iterationCycle += 1;
        await sleep(currentIteration.intervalMs);
        continue;
      }

      iterationCycle = 0;
      const goal = goals[cycle % goals.length];
      createRunContext(cwd, `goal:${cycle + 1}`);
      const prompt = [
        `Autonomous cycle ${cycle + 1}.`,
        goal,
        "Stay within this repository unless explicitly instructed otherwise.",
        "Prefer documentation, tests, guardrails, and small refactors over broad rewrites.",
        "When changing behavior, prefer a test-first or regression-test-first workflow.",
        watcherQueued ? "Note: watcher-triggered follow-up work may already be queued." : "",
        "If no safe improvement is warranted, explain why and stop for this cycle.",
      ].filter(Boolean).join("\n\n");

      appendRunHistory(cwd, { kind: "goal", label: `goal:${cycle + 1}`, status: "started", details: goal });
      updateDaemonHealth(cwd, { status: "running", currentActivity: `goal:${cycle + 1}` });
      console.log(`[pinchy-daemon] cycle=${cycle + 1} intervalMs=${intervalMs}`);
      await session.prompt(prompt);
      appendRunHistory(cwd, { kind: "goal", label: `goal:${cycle + 1}`, status: "completed" });
      updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
      cycle += 1;
      await sleep(intervalMs);
    }
  } finally {
    updateDaemonHealth(cwd, { status: "stopped", currentActivity: undefined });
    if (watcherTimer) clearTimeout(watcherTimer);
    await repoWatcher.close();
    await configWatcher.close();
  }
}

main().catch((error) => {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  updateDaemonHealth(cwd, { status: "error", currentActivity: undefined, lastError: error instanceof Error ? error.message : String(error) });
  appendRunHistory(cwd, { kind: "goal", label: "daemon crash", status: "failed", details: error instanceof Error ? error.message : String(error) });
  console.error(error);
  process.exit(1);
});
