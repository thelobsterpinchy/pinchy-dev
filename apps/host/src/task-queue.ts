import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { OrchestrationTask, PinchyTask } from "../../../packages/shared/src/contracts.js";
import {
  appendOrchestrationEvent,
  loadOrchestrationTasks,
  saveOrchestrationTask,
  saveOrchestrationTasks,
} from "./orchestration-core/adapters/file-repositories.js";

const TASKS_FILE = ".pinchy-tasks.json";

export function getTasksPath(cwd: string) {
  return resolve(cwd, TASKS_FILE);
}

export function loadTasks(cwd: string): PinchyTask[] {
  const path = getTasksPath(cwd);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PinchyTask[];
  } catch {
    return [];
  }
}

export function saveTasks(cwd: string, tasks: PinchyTask[]) {
  const path = getTasksPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(tasks, null, 2), "utf8");
}

type EnqueueTaskOptions = Partial<Pick<PinchyTask, "source" | "conversationId" | "runId" | "executionRunId" | "dependsOnTaskIds">>;

type DelegationPlanTaskInput = {
  id?: string;
  title: string;
  prompt: string;
  dependsOn?: string[];
};

export type TaskReprioritizationDirection = "up" | "down" | "top" | "bottom";

function createTaskRecord(input: {
  title: string;
  prompt: string;
  now: string;
  options?: EnqueueTaskOptions;
}): PinchyTask {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    prompt: input.prompt,
    status: "pending",
    createdAt: input.now,
    updatedAt: input.now,
    source: input.options?.source,
    conversationId: input.options?.conversationId,
    runId: input.options?.runId,
    executionRunId: input.options?.executionRunId,
    dependsOnTaskIds: input.options?.dependsOnTaskIds?.filter(Boolean),
  };
}

function isTaskReady(task: PinchyTask, tasks: PinchyTask[]) {
  if (!task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) {
    return true;
  }

  return task.dependsOnTaskIds.every((dependencyId) => tasks.some((entry) => entry.id === dependencyId && entry.status === "done"));
}

function mapTaskStatusToOrchestrationStatus(task: PinchyTask, allTasks: PinchyTask[]): OrchestrationTask["status"] {
  if (task.status === "pending") {
    return isTaskReady(task, allTasks) ? "ready" : "pending";
  }
  if (task.status === "done") return "done";
  if (task.status === "blocked") return "blocked";
  return "running";
}

function toOrchestrationTask(task: PinchyTask, allTasks: PinchyTask[]): OrchestrationTask | undefined {
  if (!task.runId) return undefined;
  return {
    id: task.id,
    parentRunId: task.runId,
    title: task.title,
    prompt: task.prompt,
    status: mapTaskStatusToOrchestrationStatus(task, allTasks),
    dependsOnTaskIds: task.dependsOnTaskIds ?? [],
    assignedAgentRunId: task.executionRunId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function recordTaskReadyIfNeeded(cwd: string, task: OrchestrationTask, previousStatus?: OrchestrationTask["status"]) {
  if (task.status !== "ready" || previousStatus === "ready") return;
  appendOrchestrationEvent(cwd, {
    type: "TaskReady",
    runId: task.parentRunId,
    taskId: task.id,
    at: task.updatedAt,
  });
}

function recordTaskCompletedIfNeeded(cwd: string, task: OrchestrationTask, previousStatus?: OrchestrationTask["status"]) {
  if (task.status !== "done" || previousStatus === "done") return;
  appendOrchestrationEvent(cwd, {
    type: "TaskCompleted",
    runId: task.parentRunId,
    taskId: task.id,
    at: task.updatedAt,
  });
}

function mirrorTaskToOrchestrationCore(cwd: string, task: PinchyTask, allTasks: PinchyTask[]) {
  const orchestrationTask = toOrchestrationTask(task, allTasks);
  if (!orchestrationTask) return undefined;
  const previousStatus = loadOrchestrationTasks(cwd).find((entry) => entry.id === orchestrationTask.id)?.status;
  saveOrchestrationTask(cwd, orchestrationTask);
  recordTaskReadyIfNeeded(cwd, orchestrationTask, previousStatus);
  recordTaskCompletedIfNeeded(cwd, orchestrationTask, previousStatus);
  return orchestrationTask;
}

function markReadyOrchestrationDependents(cwd: string, completedTask: PinchyTask, allTasks: PinchyTask[]) {
  if (!completedTask.runId || completedTask.status !== "done") return;

  const readyDependents = allTasks
    .filter((task) => task.runId === completedTask.runId && task.status === "pending" && isTaskReady(task, allTasks))
    .map((task) => {
      const previous = loadOrchestrationTasks(cwd).find((entry) => entry.id === task.id);
      const mirrored = toOrchestrationTask(task, allTasks);
      return mirrored && previous?.status !== "ready" ? mirrored : undefined;
    })
    .filter((task): task is OrchestrationTask => Boolean(task));

  if (readyDependents.length === 0) return;
  saveOrchestrationTasks(cwd, readyDependents);
  for (const task of readyDependents) {
    appendOrchestrationEvent(cwd, {
      type: "TaskReady",
      runId: task.parentRunId,
      taskId: task.id,
      at: task.updatedAt,
    });
  }
}

function markBlockedDependents(tasks: PinchyTask[]) {
  const changed: PinchyTask[] = [];
  const changedIds = new Set<string>();
  let didChange = true;

  while (didChange) {
    didChange = false;
    for (const task of tasks) {
      if (task.status !== "pending" || !task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) {
        continue;
      }

      const hasBlockedDependency = task.dependsOnTaskIds.some((dependencyId) => {
        const dependency = tasks.find((entry) => entry.id === dependencyId);
        return !dependency || dependency.status === "blocked";
      });
      if (!hasBlockedDependency) {
        continue;
      }

      task.status = "blocked";
      task.updatedAt = new Date().toISOString();
      didChange = true;
      if (!changedIds.has(task.id)) {
        changedIds.add(task.id);
        changed.push(task);
      }
    }
  }

  return changed;
}

export function enqueueTask(
  cwd: string,
  title: string,
  prompt: string,
  options: EnqueueTaskOptions = {},
): PinchyTask {
  const tasks = loadTasks(cwd);
  const now = new Date().toISOString();
  const task = createTaskRecord({
    title,
    prompt,
    now,
    options,
  });
  tasks.push(task);
  saveTasks(cwd, tasks);
  mirrorTaskToOrchestrationCore(cwd, task, tasks);
  return task;
}

export function enqueueDelegationPlan(
  cwd: string,
  planTasks: DelegationPlanTaskInput[],
  options: EnqueueTaskOptions = {},
): PinchyTask[] {
  const existingTasks = loadTasks(cwd);
  const now = new Date().toISOString();
  const localIdToTaskId = new Map<string, string>();

  const createdTasks = planTasks.map((task, index) => {
    const created = createTaskRecord({
      title: task.title,
      prompt: task.prompt,
      now,
      options,
    });
    localIdToTaskId.set(task.id?.trim() || `task-${index + 1}`, created.id);
    return { input: task, created };
  }).map(({ input, created }, index) => ({
    ...created,
    dependsOnTaskIds: (input.dependsOn ?? [])
      .map((dependencyId) => dependencyId.trim())
      .filter(Boolean)
      .map((dependencyId) => localIdToTaskId.get(dependencyId))
      .filter((value): value is string => Boolean(value)),
  } satisfies PinchyTask));

  saveTasks(cwd, [...existingTasks, ...createdTasks]);
  if (options.runId && createdTasks.length > 0) {
    saveOrchestrationTasks(cwd, createdTasks
      .map((task) => toOrchestrationTask(task, [...existingTasks, ...createdTasks]))
      .filter((task): task is OrchestrationTask => Boolean(task)));
    appendOrchestrationEvent(cwd, {
      type: "RunPlanned",
      runId: options.runId,
      taskIds: createdTasks.map((task) => task.id),
      at: now,
    });
    for (const task of createdTasks) {
      const mirrored = toOrchestrationTask(task, [...existingTasks, ...createdTasks]);
      if (mirrored) {
        recordTaskReadyIfNeeded(cwd, mirrored);
      }
    }
  }
  return createdTasks;
}

export function updateTaskStatus(cwd: string, id: string, status: PinchyTask["status"], patch: Partial<Pick<PinchyTask, "conversationId" | "runId" | "executionRunId">> = {}): PinchyTask | undefined {
  const tasks = loadTasks(cwd);
  const match = tasks.find((task) => task.id === id);
  if (!match) return undefined;
  match.status = status;
  match.updatedAt = new Date().toISOString();
  match.conversationId = patch.conversationId ?? match.conversationId;
  match.runId = patch.runId ?? match.runId;
  match.executionRunId = patch.executionRunId ?? match.executionRunId;
  const blockedDependents = status === "blocked" ? markBlockedDependents(tasks) : [];
  saveTasks(cwd, tasks);
  mirrorTaskToOrchestrationCore(cwd, match, tasks);
  for (const dependent of blockedDependents) {
    mirrorTaskToOrchestrationCore(cwd, dependent, tasks);
  }
  markReadyOrchestrationDependents(cwd, match, tasks);
  return match;
}

export function updateTaskStatusByExecutionRunId(cwd: string, runId: string, status: PinchyTask["status"]): PinchyTask | undefined {
  const tasks = loadTasks(cwd);
  const match = tasks.find((task) => task.executionRunId === runId);
  if (!match) return undefined;
  match.status = status;
  match.updatedAt = new Date().toISOString();
  const blockedDependents = status === "blocked" ? markBlockedDependents(tasks) : [];
  saveTasks(cwd, tasks);
  mirrorTaskToOrchestrationCore(cwd, match, tasks);
  for (const dependent of blockedDependents) {
    mirrorTaskToOrchestrationCore(cwd, dependent, tasks);
  }
  markReadyOrchestrationDependents(cwd, match, tasks);
  return match;
}

export function reprioritizeTask(cwd: string, id: string, direction: TaskReprioritizationDirection): PinchyTask | undefined {
  const tasks = loadTasks(cwd);
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) return undefined;

  const targetIndex = direction === "up"
    ? Math.max(0, index - 1)
    : direction === "down"
      ? Math.min(tasks.length - 1, index + 1)
      : direction === "top"
        ? 0
        : tasks.length - 1;
  if (targetIndex === index) {
    return tasks[index];
  }

  const [task] = tasks.splice(index, 1);
  task.updatedAt = new Date().toISOString();
  tasks.splice(targetIndex, 0, task);
  saveTasks(cwd, tasks);
  return task;
}

export function clearCompletedTasks(cwd: string): PinchyTask[] {
  const tasks = loadTasks(cwd);
  const removed = tasks.filter((task) => task.status === "done");
  if (removed.length === 0) {
    return [];
  }
  saveTasks(cwd, tasks.filter((task) => task.status !== "done"));
  return removed;
}

export function deleteTask(cwd: string, id: string): PinchyTask | undefined {
  const tasks = loadTasks(cwd);
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) return undefined;
  const [deleted] = tasks.splice(index, 1);
  const blockedDependents = markBlockedDependents(tasks);
  saveTasks(cwd, tasks);
  for (const dependent of blockedDependents) {
    mirrorTaskToOrchestrationCore(cwd, dependent, tasks);
  }
  return deleted;
}

export function getNextPendingTask(cwd: string): PinchyTask | undefined {
  const tasks = loadTasks(cwd);
  return tasks.find((task) => task.status === "pending" && isTaskReady(task, tasks));
}
