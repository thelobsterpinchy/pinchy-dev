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

export function enqueueTask(cwd: string, title: string, prompt: string): PinchyTask {
  const tasks = loadTasks(cwd);
  const now = new Date().toISOString();
  const task: PinchyTask = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    prompt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  saveTasks(cwd, tasks);
  return task;
}

export function updateTaskStatus(cwd: string, id: string, status: PinchyTask["status"], patch: Partial<Pick<PinchyTask, "conversationId" | "runId">> = {}): PinchyTask | undefined {
  const tasks = loadTasks(cwd);
  const match = tasks.find((task) => task.id === id);
  if (!match) return undefined;
  match.status = status;
  match.updatedAt = new Date().toISOString();
  match.conversationId = patch.conversationId ?? match.conversationId;
  match.runId = patch.runId ?? match.runId;
  saveTasks(cwd, tasks);
  return match;
}

export function getNextPendingTask(cwd: string): PinchyTask | undefined {
  return loadTasks(cwd).find((task) => task.status === "pending");
}
