import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { PinchyTask } from "../../../packages/shared/src/contracts.js";

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
  saveTasks(cwd, tasks);
  return match;
}

export function updateTaskStatusByExecutionRunId(cwd: string, runId: string, status: PinchyTask["status"]): PinchyTask | undefined {
  const tasks = loadTasks(cwd);
  const match = tasks.find((task) => task.executionRunId === runId);
  if (!match) return undefined;
  match.status = status;
  match.updatedAt = new Date().toISOString();
  saveTasks(cwd, tasks);
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
  saveTasks(cwd, tasks);
  return deleted;
}

export function getNextPendingTask(cwd: string): PinchyTask | undefined {
  const tasks = loadTasks(cwd);
  return tasks.find((task) => task.status === "pending" && isTaskReady(task, tasks));
}
