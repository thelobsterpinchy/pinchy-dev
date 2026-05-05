import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentRun, OrchestrationEvent, OrchestrationTask } from "../../../../../packages/shared/src/contracts.js";
import type { AgentRunRepository, EventRecorder, TaskRepository } from "../ports/index.js";

const TASKS_FILE = ".pinchy-orchestration-tasks.json";
const AGENT_RUNS_FILE = ".pinchy-agent-runs.json";
const EVENTS_FILE = ".pinchy-orchestration-events.jsonl";

export type OrchestrationMemorySnapshot = {
  parentRunId: string;
  tasks: OrchestrationTask[];
  agentRuns: AgentRun[];
  events: OrchestrationEvent[];
  completedTaskSummaries: string;
};

export function getOrchestrationTasksPath(cwd: string) {
  return resolve(cwd, TASKS_FILE);
}

export function getAgentRunsPath(cwd: string) {
  return resolve(cwd, AGENT_RUNS_FILE);
}

export function getOrchestrationEventsPath(cwd: string) {
  return resolve(cwd, EVENTS_FILE);
}

function readJsonArray<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(path: string, entries: T[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2), "utf8");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function normalizeTask(value: unknown): OrchestrationTask | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<OrchestrationTask> & { dependsOnTaskIds?: unknown };
  if (
    typeof record.id !== "string"
    || typeof record.parentRunId !== "string"
    || typeof record.title !== "string"
    || typeof record.prompt !== "string"
    || typeof record.status !== "string"
    || !isStringArray(record.dependsOnTaskIds)
    || typeof record.createdAt !== "string"
    || typeof record.updatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: record.id,
    parentRunId: record.parentRunId,
    title: record.title,
    prompt: record.prompt,
    status: record.status as OrchestrationTask["status"],
    dependsOnTaskIds: record.dependsOnTaskIds,
    assignedAgentRunId: typeof record.assignedAgentRunId === "string" ? record.assignedAgentRunId : undefined,
    outputSummary: typeof record.outputSummary === "string" ? record.outputSummary : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeAgentRun(value: unknown): AgentRun | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<AgentRun>;
  if (
    typeof record.id !== "string"
    || typeof record.parentRunId !== "string"
    || typeof record.conversationId !== "string"
    || typeof record.taskId !== "string"
    || typeof record.backend !== "string"
    || typeof record.backendRunRef !== "string"
    || typeof record.status !== "string"
    || typeof record.goal !== "string"
    || typeof record.modelProfile !== "string"
    || typeof record.createdAt !== "string"
    || typeof record.updatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: record.id,
    parentRunId: record.parentRunId,
    conversationId: record.conversationId,
    taskId: record.taskId,
    backend: record.backend,
    backendRunRef: record.backendRunRef,
    status: record.status as AgentRun["status"],
    goal: record.goal,
    modelProfile: record.modelProfile,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
    completedAt: typeof record.completedAt === "string" ? record.completedAt : undefined,
    lastProgressAt: typeof record.lastProgressAt === "string" ? record.lastProgressAt : undefined,
    resultSummary: typeof record.resultSummary === "string" ? record.resultSummary : undefined,
    failureReason: typeof record.failureReason === "string" ? record.failureReason : undefined,
  };
}

function normalizeEvent(value: unknown): OrchestrationEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<OrchestrationEvent>;
  if (typeof record.type !== "string" || typeof record.at !== "string") {
    return undefined;
  }
  if (!("runId" in record) || typeof record.runId !== "string") {
    return undefined;
  }
  return record as OrchestrationEvent;
}

function sortTasks(tasks: OrchestrationTask[]) {
  return [...tasks].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt);
    return left.id.localeCompare(right.id);
  });
}

function sortAgentRuns(agentRuns: AgentRun[]) {
  return [...agentRuns].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt);
    return left.id.localeCompare(right.id);
  });
}

export function loadOrchestrationTasks(cwd: string) {
  return sortTasks(readJsonArray<unknown>(getOrchestrationTasksPath(cwd))
    .map((entry) => normalizeTask(entry))
    .filter((entry): entry is OrchestrationTask => Boolean(entry)));
}

export function saveOrchestrationTask(cwd: string, task: OrchestrationTask) {
  const tasks = loadOrchestrationTasks(cwd);
  const index = tasks.findIndex((entry) => entry.id === task.id);
  if (index >= 0) {
    tasks[index] = task;
  } else {
    tasks.push(task);
  }
  writeJsonArray(getOrchestrationTasksPath(cwd), sortTasks(tasks));
}

export function saveOrchestrationTasks(cwd: string, nextTasks: OrchestrationTask[]) {
  const tasks = loadOrchestrationTasks(cwd);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  for (const task of nextTasks) {
    taskById.set(task.id, task);
  }
  writeJsonArray(getOrchestrationTasksPath(cwd), sortTasks(Array.from(taskById.values())));
}

export function loadAgentRuns(cwd: string) {
  return sortAgentRuns(readJsonArray<unknown>(getAgentRunsPath(cwd))
    .map((entry) => normalizeAgentRun(entry))
    .filter((entry): entry is AgentRun => Boolean(entry)));
}

export function loadOrchestrationEvents(cwd: string) {
  const path = getOrchestrationEventsPath(cwd);
  if (!existsSync(path)) return [] as OrchestrationEvent[];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return normalizeEvent(JSON.parse(line) as unknown);
      } catch {
        return undefined;
      }
    })
    .filter((event): event is OrchestrationEvent => Boolean(event));
}

export function appendOrchestrationEvent(cwd: string, event: OrchestrationEvent) {
  const path = getOrchestrationEventsPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
}

export class FileBackedTaskRepository implements TaskRepository {
  constructor(private readonly cwd: string) {}

  async listReadyByRun(runId: string): Promise<OrchestrationTask[]> {
    return this.listByRun(runId, { status: "ready" });
  }

  async listByRun(runId: string, filter: { status?: OrchestrationTask["status"] } = {}): Promise<OrchestrationTask[]> {
    return loadOrchestrationTasks(this.cwd)
      .filter((task) => task.parentRunId === runId)
      .filter((task) => !filter.status || task.status === filter.status);
  }

  async get(taskId: string): Promise<OrchestrationTask | undefined> {
    return loadOrchestrationTasks(this.cwd).find((task) => task.id === taskId);
  }

  async save(task: OrchestrationTask): Promise<void> {
    saveOrchestrationTask(this.cwd, task);
  }
}

export class FileBackedAgentRunRepository implements AgentRunRepository {
  constructor(private readonly cwd: string) {}

  async listByParentRun(parentRunId: string): Promise<AgentRun[]> {
    return loadAgentRuns(this.cwd).filter((agentRun) => agentRun.parentRunId === parentRunId);
  }

  async get(agentRunId: string): Promise<AgentRun | undefined> {
    return loadAgentRuns(this.cwd).find((agentRun) => agentRun.id === agentRunId);
  }

  async findByBackendRunRef(backendRunRef: string): Promise<AgentRun | undefined> {
    return loadAgentRuns(this.cwd).find((agentRun) => agentRun.backendRunRef === backendRunRef);
  }

  async save(agentRun: AgentRun): Promise<void> {
    const agentRuns = loadAgentRuns(this.cwd);
    const index = agentRuns.findIndex((entry) => entry.id === agentRun.id);
    if (index >= 0) {
      agentRuns[index] = agentRun;
    } else {
      agentRuns.push(agentRun);
    }
    writeJsonArray(getAgentRunsPath(this.cwd), sortAgentRuns(agentRuns));
  }
}

export class FileBackedEventRecorder implements EventRecorder {
  constructor(private readonly cwd: string) {}

  async record(event: OrchestrationEvent): Promise<void> {
    appendOrchestrationEvent(this.cwd, event);
  }

  async listAll(): Promise<OrchestrationEvent[]> {
    return loadOrchestrationEvents(this.cwd);
  }

  async listByRun(runId: string): Promise<OrchestrationEvent[]> {
    return loadOrchestrationEvents(this.cwd).filter((event) => event.runId === runId);
  }
}

export function createFileBackedOrchestrationRepositories(cwd: string) {
  return {
    taskRepository: new FileBackedTaskRepository(cwd),
    agentRunRepository: new FileBackedAgentRunRepository(cwd),
    eventRecorder: new FileBackedEventRecorder(cwd),
  };
}

export async function buildOrchestrationMemorySnapshot(cwd: string, parentRunId: string): Promise<OrchestrationMemorySnapshot> {
  const taskRepository = new FileBackedTaskRepository(cwd);
  const agentRunRepository = new FileBackedAgentRunRepository(cwd);
  const eventRecorder = new FileBackedEventRecorder(cwd);
  const tasks = await taskRepository.listByRun(parentRunId);
  const agentRuns = await agentRunRepository.listByParentRun(parentRunId);
  const events = await eventRecorder.listByRun(parentRunId);
  const completedTaskSummaries = tasks
    .filter((task) => task.status === "done" && task.outputSummary?.trim())
    .map((task) => `${task.title}: ${task.outputSummary}`)
    .join("\n");

  return {
    parentRunId,
    tasks,
    agentRuns,
    events,
    completedTaskSummaries,
  };
}
