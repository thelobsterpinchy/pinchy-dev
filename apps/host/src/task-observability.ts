import type { PinchyTask, Run, ConversationSessionBinding } from "../../../packages/shared/src/contracts.js";
import { inspectManagedServices } from "./dev-stack.js";
import { getConversationSessionBinding, listRuns } from "./agent-state-store.js";
import { loadTasks } from "./task-queue.js";

function buildTaskDependencyMap(tasks: PinchyTask[]) {
  return new Map(tasks.map((task) => [task.id, task]));
}

function buildRunMap(runs: Run[]) {
  return new Map(runs.map((run) => [run.id, run]));
}

function getBlockedDependencies(task: PinchyTask, taskById: Map<string, PinchyTask>) {
  const blockedTasks = (task.dependsOnTaskIds ?? [])
    .map((dependencyId) => taskById.get(dependencyId))
    .filter((dependency): dependency is PinchyTask => Boolean(dependency))
    .filter((dependency) => dependency.status !== "done");

  return {
    blockedByTaskIds: blockedTasks.map((dependency) => dependency.id),
    blockedByTaskTitles: blockedTasks.map((dependency) => dependency.title),
  };
}

function buildTaskExecution(task: PinchyTask, runsById: Map<string, Run>, taskById: Map<string, PinchyTask>, worker: ReturnType<typeof inspectManagedServices>[number] | undefined, conversationSession?: ConversationSessionBinding) {
  const blocked = getBlockedDependencies(task, taskById);
  if (task.status === "pending") {
    return {
      queueState: blocked.blockedByTaskIds.length > 0 ? "waiting_for_dependencies" as const : "ready" as const,
      blockedByTaskIds: blocked.blockedByTaskIds,
      blockedByTaskTitles: blocked.blockedByTaskTitles,
      conversationSessionPath: conversationSession?.piSessionPath,
      workerPid: worker?.pid,
      workerStatus: worker?.status ?? "stopped",
    };
  }

  const linkedRunId = task.executionRunId ?? task.runId;
  const run = linkedRunId ? runsById.get(linkedRunId) : undefined;
  if (run) {
    return {
      queueState: "linked_run" as const,
      blockedByTaskIds: blocked.blockedByTaskIds,
      blockedByTaskTitles: blocked.blockedByTaskTitles,
      linkedRunStatus: run.status,
      piSessionPath: run.piSessionPath,
      conversationSessionPath: conversationSession?.piSessionPath,
      workerPid: worker?.pid,
      workerStatus: worker?.status ?? "stopped",
    };
  }

  return {
    queueState: blocked.blockedByTaskIds.length > 0 ? "waiting_for_dependencies" as const : "ready" as const,
    blockedByTaskIds: blocked.blockedByTaskIds,
    blockedByTaskTitles: blocked.blockedByTaskTitles,
    conversationSessionPath: conversationSession?.piSessionPath,
    workerPid: worker?.pid,
    workerStatus: worker?.status ?? "stopped",
  };
}

export function buildObservableTasks(cwd: string, tasks = loadTasks(cwd)) {
  const taskById = buildTaskDependencyMap(tasks);
  const runsById = buildRunMap(listRuns(cwd));
  const worker = inspectManagedServices(cwd).find((service) => service.name === "worker");

  return tasks.map((task) => ({
    ...task,
    execution: buildTaskExecution(
      task,
      runsById,
      taskById,
      worker,
      task.conversationId ? getConversationSessionBinding(cwd, task.conversationId) : undefined,
    ),
  } satisfies PinchyTask));
}
