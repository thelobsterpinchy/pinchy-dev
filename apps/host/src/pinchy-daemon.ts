import chokidar from "chokidar";
import { resolve } from "node:path";
import type { PinchySessionManager } from "../../../services/agent-worker/src/pinchy-session-manager.js";
import { getNextPendingTask, getTasksPath, updateTaskStatus } from "./task-queue.js";
import { loadDaemonGoalsConfig } from "./daemon-config.js";
import { shouldRunAsCliEntry } from "./module-entry.js";
import { loadIterationConfig } from "./iteration-config.js";
import { detectValidationPlan } from "./project-detection.js";
import { buildStackAwareIterationGuidance } from "./stack-prompts.js";
import { createRunContext } from "./run-context.js";
import { appendRunHistory } from "./run-history.js";
import { updateDaemonHealth } from "./daemon-health.js";
import { consumeNextReloadRequest, getPendingReloadRequests } from "./reload-requests.js";
import { enqueueAutonomousGoalRun, enqueueIterationRun, enqueueQueuedTaskRun, enqueueWatcherFollowUpRun } from "./run-enqueue.js";
import { loadWatchConfig } from "./watch-config.js";
import { applyAutoDeleteRetention } from "./auto-delete-retention.js";

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

type ReloadSession = {
  prompt: (text: string) => Promise<unknown>;
  followUp?: (text: string) => Promise<unknown>;
};

type DaemonDependencies = {
  sessionManager?: PinchySessionManager;
  createReloadSession?: (cwd: string) => Promise<ReloadSession>;
};

type SleepUntilDueDependencies = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  hasPendingTask?: (cwd: string) => boolean;
  hasPendingReloadRequest?: (cwd: string) => boolean;
  consumePendingTaskWakeSignal?: () => boolean;
  pollMs?: number;
};

export async function processNextPendingTaskRun(cwd: string, dependencies: PendingTaskRunDependencies = { enqueueTaskRun: enqueueQueuedTaskRun }) {
  const task = getNextPendingTask(cwd);
  if (!task) return undefined;

  createRunContext(cwd, `task:${task.title}`);
  appendRunHistory(cwd, { kind: "task", label: task.title, status: "started", details: task.prompt });
  updateDaemonHealth(cwd, { status: "running", currentActivity: `task:${task.title}` });
  console.log(`[pinchy-daemon] queueing persistent task run task=${task.id}`);

  try {
    const scheduled = await dependencies.enqueueTaskRun(cwd, {
      title: task.title,
      prompt: task.prompt,
    });
    updateTaskStatus(cwd, task.id, "running", {
      conversationId: task.conversationId ?? scheduled.conversation.id,
      runId: task.runId ?? scheduled.run.id,
      executionRunId: scheduled.run.id,
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

export async function processPendingTaskRuns(
  cwd: string,
  dependencies: PendingTaskRunDependencies = { enqueueTaskRun: enqueueQueuedTaskRun },
  options: { limit?: number } = {},
) {
  const limit = Math.max(1, Math.floor(options.limit ?? 4));
  const scheduled = [];

  for (let index = 0; index < limit; index += 1) {
    const processed = await processNextPendingTaskRun(cwd, dependencies);
    if (!processed) {
      break;
    }
    scheduled.push(processed);
  }

  return scheduled;
}

export async function sleepUntilDueOrWorkAvailable(cwd: string, dueAtMs: number, dependencies: SleepUntilDueDependencies = {}) {
  const now = dependencies.now ?? (() => Date.now());
  const sleeper = dependencies.sleep ?? sleep;
  const hasPendingTask = dependencies.hasPendingTask ?? ((currentCwd: string) => Boolean(getNextPendingTask(currentCwd)));
  const hasPendingReloadRequest = dependencies.hasPendingReloadRequest ?? ((currentCwd: string) => getPendingReloadRequests(currentCwd).length > 0);
  const consumePendingTaskWakeSignal = dependencies.consumePendingTaskWakeSignal ?? (() => false);
  const pollMs = Math.max(50, Math.floor(dependencies.pollMs ?? 250));

  while (true) {
    if (consumePendingTaskWakeSignal() || hasPendingTask(cwd) || hasPendingReloadRequest(cwd)) {
      return "work_available" as const;
    }

    const remainingMs = dueAtMs - now();
    if (remainingMs <= 0) {
      return "due" as const;
    }

    await sleeper(Math.min(pollMs, remainingMs));
  }
}

export async function processNextReloadRequest(cwd: string, session: ReloadSession) {
  const reloadRequest = consumeNextReloadRequest(cwd);
  if (!reloadRequest) return undefined;

  const label = reloadRequest.toolName ? `reload:${reloadRequest.toolName}` : "reload:runtime";
  createRunContext(cwd, label);
  appendRunHistory(cwd, { kind: "reload", label, status: "started" });
  updateDaemonHealth(cwd, { status: "running", currentActivity: label });
  console.log(`[pinchy-daemon] processing reload request ${reloadRequest.id}`);

  try {
    await session.prompt("/reload-runtime");
    appendRunHistory(cwd, { kind: "reload", label, status: "completed" });
    updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString(), lastError: undefined });
    return reloadRequest;
  } catch (error) {
    appendRunHistory(cwd, { kind: "reload", label, status: "failed", details: error instanceof Error ? error.message : String(error) });
    updateDaemonHealth(cwd, { status: "error", currentActivity: label, lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  updateDaemonHealth(cwd, { status: "starting", pid: process.pid, startedAt: new Date().toISOString(), currentActivity: "boot" });
  let { enabled: goalsEnabled, goals, intervalMs } = resolveGoals(cwd);
  let watchConfig = loadWatchConfig(cwd);
  let iteration = buildIterationPrompt(cwd, 0);

  const createDefaultReloadSession = async (sessionCwd: string): Promise<ReloadSession> => {
    const { createAgentSession, getAgentDir, SessionManager } = await import("@mariozechner/pi-coding-agent");
    const { session } = await createAgentSession({
      cwd: sessionCwd,
      agentDir: getAgentDir(),
      sessionManager: SessionManager.continueRecent(sessionCwd),
    });
    return session as ReloadSession;
  };

  const session = await createDefaultReloadSession(cwd);

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
    nextIterationDueAt = Date.now();
    nextGoalDueAt = Date.now();
    console.log(`[pinchy-daemon] reloaded config enabled=${goalsEnabled} goals=${goals.length} intervalMs=${intervalMs}`);
  });

  let watcherQueued = false;
  let watcherChangedFiles = new Set<string>();
  let watcherTimer: NodeJS.Timeout | undefined;
  let nextIterationDueAt = Date.now();
  let nextGoalDueAt = Date.now();

  const repoWatcher = chokidar.watch(watchConfig.watch.map((entry) => resolve(cwd, entry)), {
    ignoreInitial: true,
  });
  let taskWakeRequested = false;
  const taskWatcher = chokidar.watch(getTasksPath(cwd), {
    ignoreInitial: true,
  });
  taskWatcher.on("add", () => {
    taskWakeRequested = true;
  });
  taskWatcher.on("change", () => {
    taskWakeRequested = true;
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
      applyAutoDeleteRetention(cwd);
      const reloadRequest = await processNextReloadRequest(cwd, session);
      if (reloadRequest) {
        await sleep(500);
        continue;
      }
      const task = getNextPendingTask(cwd);
      if (task) {
        await processPendingTaskRuns(cwd, { enqueueTaskRun: enqueueQueuedTaskRun }, {
          limit: Math.max(1, Number(process.env.PINCHY_DAEMON_TASK_CONCURRENCY ?? 4)),
        });
        await sleep(1000);
        continue;
      }

      if (iteration.enabled && iterationCycle < iteration.maxCyclesPerRun) {
        const currentIteration = buildIterationPrompt(cwd, iterationCycle);
        if (Date.now() >= nextIterationDueAt) {
          updateDaemonHealth(cwd, { status: "running", currentActivity: `iteration:${iterationCycle + 1}` });
          console.log(`[pinchy-daemon] iteration-cycle=${iterationCycle + 1} intervalMs=${currentIteration.intervalMs}`);
          enqueueIterationRun(cwd, {
            cycle: iterationCycle + 1,
            prompt: currentIteration.prompt,
            validationCommand: currentIteration.validationCommand,
          });
          updateDaemonHealth(cwd, { status: "idle", currentActivity: undefined, lastCompletedAt: new Date().toISOString() });
          iterationCycle += 1;
          nextIterationDueAt = Date.now() + currentIteration.intervalMs;
        }
        await sleepUntilDueOrWorkAvailable(cwd, nextIterationDueAt, {
          consumePendingTaskWakeSignal: () => {
            const wakeRequested = taskWakeRequested;
            taskWakeRequested = false;
            return wakeRequested;
          },
        });
        continue;
      }

      iterationCycle = 0;
      nextIterationDueAt = Math.max(nextIterationDueAt, Date.now() + iteration.intervalMs);
      if (!goalsEnabled) {
        nextGoalDueAt = Math.max(nextGoalDueAt, Date.now() + intervalMs);
        await sleepUntilDueOrWorkAvailable(cwd, nextGoalDueAt, {
          consumePendingTaskWakeSignal: () => {
            const wakeRequested = taskWakeRequested;
            taskWakeRequested = false;
            return wakeRequested;
          },
        });
        continue;
      }

      if (Date.now() >= nextGoalDueAt) {
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
        nextGoalDueAt = Date.now() + intervalMs;
      }
      await sleepUntilDueOrWorkAvailable(cwd, nextGoalDueAt, {
        consumePendingTaskWakeSignal: () => {
          const wakeRequested = taskWakeRequested;
          taskWakeRequested = false;
          return wakeRequested;
        },
      });
    }
  } finally {
    updateDaemonHealth(cwd, { status: "stopped", currentActivity: undefined });
    if (watcherTimer) clearTimeout(watcherTimer);
    await taskWatcher.close();
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
