import {
  createAgentSession,
  getAgentDir,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import chokidar from "chokidar";
import { resolve } from "node:path";
import { getNextPendingTask, updateTaskStatus } from "./task-queue.js";
import { loadDaemonGoalsConfig } from "./daemon-config.js";
import { shouldRunAsCliEntry } from "./module-entry.js";
import { loadIterationConfig } from "./iteration-config.js";
import { detectValidationPlan } from "./project-detection.js";
import { buildStackAwareIterationGuidance } from "./stack-prompts.js";
import { createRunContext } from "./run-context.js";
import { appendRunHistory } from "./run-history.js";
import { updateDaemonHealth } from "./daemon-health.js";
import { consumeNextReloadRequest } from "./reload-requests.js";
import { enqueueAutonomousGoalRun, enqueueIterationRun, enqueueQueuedTaskRun, enqueueWatcherFollowUpRun } from "./run-enqueue.js";
import { loadWatchConfig } from "./watch-config.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveGoals(cwd: string): { enabled: boolean; goals: string[]; intervalMs: number } {
  const config = loadDaemonGoalsConfig(cwd);
  return { enabled: config.enabled, goals: config.goals, intervalMs: config.intervalMs };
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

type PendingTaskRunDependencies = {
  enqueueTaskRun: (cwd: string, input: { title: string; prompt: string }) => ReturnType<typeof enqueueQueuedTaskRun> | Promise<ReturnType<typeof enqueueQueuedTaskRun>>;
};

export async function processNextPendingTaskRun(cwd: string, dependencies: PendingTaskRunDependencies = { enqueueTaskRun: enqueueQueuedTaskRun }) {
  const task = getNextPendingTask(cwd);
  if (!task) return undefined;

  updateTaskStatus(cwd, task.id, "running");
  createRunContext(cwd, `task:${task.title}`);
  appendRunHistory(cwd, { kind: "task", label: task.title, status: "started", details: task.prompt });
  updateDaemonHealth(cwd, { status: "running", currentActivity: `task:${task.title}` });
  console.log(`[pinchy-daemon] queueing persistent task run task=${task.id}`);

  try {
    const scheduled = await dependencies.enqueueTaskRun(cwd, {
      title: task.title,
      prompt: task.prompt,
    });
    updateTaskStatus(cwd, task.id, "done", {
      conversationId: scheduled.conversation.id,
      runId: scheduled.run.id,
    });
    appendRunHistory(cwd, { kind: "task", label: task.title, status: "completed", details: `queued run ${scheduled.run.id}` });
    updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
    return { task, ...scheduled };
  } catch (error) {
    updateTaskStatus(cwd, task.id, "blocked");
    appendRunHistory(cwd, { kind: "task", label: task.title, status: "failed", details: error instanceof Error ? error.message : String(error) });
    updateDaemonHealth(cwd, { status: "error", currentActivity: `task:${task.title}`, lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  updateDaemonHealth(cwd, { status: "starting", pid: process.pid, startedAt: new Date().toISOString(), currentActivity: "boot" });
  let { enabled: goalsEnabled, goals, intervalMs } = resolveGoals(cwd);
  let watchConfig = loadWatchConfig(cwd);
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
    goalsEnabled = nextGoals.enabled;
    goals = nextGoals.goals;
    intervalMs = nextGoals.intervalMs;
    watchConfig = loadWatchConfig(cwd);
    iteration = buildIterationPrompt(cwd, 0);
    console.log(`[pinchy-daemon] reloaded config enabled=${goalsEnabled} goals=${goals.length} intervalMs=${intervalMs}`);
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
      updateDaemonHealth(cwd, { status: "running", currentActivity: "watcher follow-up" });
      try {
        enqueueWatcherFollowUpRun(cwd, {
          prompt: watchConfig.prompt,
          changedFiles: Array.from(watcherChangedFiles),
        });
        updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
      } catch (error) {
        appendRunHistory(cwd, { kind: "watch", label: "watcher follow-up", status: "failed", details: error instanceof Error ? error.message : String(error) });
        updateDaemonHealth(cwd, { status: "error", currentActivity: "watcher follow-up", lastError: error instanceof Error ? error.message : String(error) });
      }
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
        await processNextPendingTaskRun(cwd);
        await sleep(1000);
        continue;
      }

      if (iteration.enabled && iterationCycle < iteration.maxCyclesPerRun) {
        const currentIteration = buildIterationPrompt(cwd, iterationCycle);
        updateDaemonHealth(cwd, { status: "running", currentActivity: `iteration:${iterationCycle + 1}` });
        console.log(`[pinchy-daemon] iteration-cycle=${iterationCycle + 1} intervalMs=${currentIteration.intervalMs}`);
        enqueueIterationRun(cwd, {
          cycle: iterationCycle + 1,
          prompt: currentIteration.prompt,
          validationCommand: currentIteration.validationCommand,
        });
        updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
        iterationCycle += 1;
        await sleep(currentIteration.intervalMs);
        continue;
      }

      iterationCycle = 0;
      if (!goalsEnabled) {
        await sleep(intervalMs);
        continue;
      }

      const goal = goals[cycle % goals.length];
      updateDaemonHealth(cwd, { status: "running", currentActivity: `goal:${cycle + 1}` });
      console.log(`[pinchy-daemon] cycle=${cycle + 1} intervalMs=${intervalMs}`);
      enqueueAutonomousGoalRun(cwd, {
        cycle: cycle + 1,
        goal,
        watcherQueued,
      });
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

if (shouldRunAsCliEntry(import.meta.url)) {
  main().catch((error) => {
    const cwd = process.env.PINCHY_CWD ?? process.cwd();
    updateDaemonHealth(cwd, { status: "error", currentActivity: undefined, lastError: error instanceof Error ? error.message : String(error) });
    appendRunHistory(cwd, { kind: "goal", label: "daemon crash", status: "failed", details: error instanceof Error ? error.message : String(error) });
    console.error(error);
    process.exit(1);
  });
}
