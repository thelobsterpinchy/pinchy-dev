import type { AgentRun, OrchestrationEvent, OrchestrationTask } from "../../../../../packages/shared/src/contracts.js";
import type { AgentRunRepository, Clock, EventRecorder, TaskRepository } from "../ports/index.js";

type Repositories = {
  taskRepository: TaskRepository;
  agentRunRepository: AgentRunRepository;
  eventRecorder: EventRecorder;
  clock: Clock;
};

export type AgentFinishOutcome =
  | { kind: "completed"; summary: string }
  | { kind: "failed"; error: string }
  | { kind: "cancelled"; reason?: string };

export type OrchestrationProgressSnapshot = {
  parentRunId: string;
  totalTasks: number;
  taskCounts: Record<OrchestrationTask["status"], number>;
  activeAgentRuns: AgentRun[];
  completedAgentRuns: AgentRun[];
  failedAgentRuns: AgentRun[];
  readyForSynthesis: boolean;
  latestEvent?: OrchestrationEvent;
};

function emptyTaskCounts(): Record<OrchestrationTask["status"], number> {
  return {
    pending: 0,
    ready: 0,
    running: 0,
    blocked: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  };
}

function isActiveAgentRun(agentRun: AgentRun) {
  return agentRun.status === "queued" || agentRun.status === "starting" || agentRun.status === "running" || agentRun.status === "blocked" || agentRun.status === "cancelling";
}

async function recordOnce(input: {
  eventRecorder: EventRecorder;
  runId: string;
  type: OrchestrationEvent["type"];
  event: OrchestrationEvent;
}) {
  const existingEvents = await input.eventRecorder.listByRun(input.runId);
  if (existingEvents.some((event) => event.type === input.type)) {
    return false;
  }
  await input.eventRecorder.record(input.event);
  return true;
}

async function recordIfMissing(input: {
  eventRecorder: EventRecorder;
  runId: string;
  event: OrchestrationEvent;
  matches: (event: OrchestrationEvent) => boolean;
}) {
  const existingEvents = await input.eventRecorder.listByRun(input.runId);
  if (existingEvents.some(input.matches)) {
    return false;
  }
  await input.eventRecorder.record(input.event);
  return true;
}

export async function recordAgentFinished(input: Repositories & {
  backendRunRef: string;
  outcome: AgentFinishOutcome;
}) {
  const agentRun = await input.agentRunRepository.findByBackendRunRef(input.backendRunRef);
  if (!agentRun) return undefined;

  const now = input.clock.nowIso();
  const nextAgentRun: AgentRun = {
    ...agentRun,
    status: input.outcome.kind === "completed"
      ? "completed"
      : input.outcome.kind === "failed"
        ? "failed"
        : "cancelled",
    updatedAt: now,
    completedAt: now,
    resultSummary: input.outcome.kind === "completed" ? input.outcome.summary : agentRun.resultSummary,
    failureReason: input.outcome.kind === "failed" ? input.outcome.error : input.outcome.kind === "cancelled" ? input.outcome.reason : agentRun.failureReason,
  };
  await input.agentRunRepository.save(nextAgentRun);

  const task = await input.taskRepository.get(agentRun.taskId);
  if (task) {
    await input.taskRepository.save({
      ...task,
      status: input.outcome.kind === "completed"
        ? "done"
        : input.outcome.kind === "failed"
          ? "failed"
          : "cancelled",
      outputSummary: input.outcome.kind === "completed" ? input.outcome.summary : task.outputSummary,
      assignedAgentRunId: agentRun.id,
      updatedAt: now,
    });
  }

  if (input.outcome.kind === "completed") {
    await recordIfMissing({
      eventRecorder: input.eventRecorder,
      runId: agentRun.parentRunId,
      event: {
        type: "AgentCompleted",
        runId: agentRun.parentRunId,
        taskId: agentRun.taskId,
        agentRunId: agentRun.id,
        at: now,
      },
      matches: (event) => event.type === "AgentCompleted" && event.agentRunId === agentRun.id,
    });
    await recordIfMissing({
      eventRecorder: input.eventRecorder,
      runId: agentRun.parentRunId,
      event: {
        type: "TaskCompleted",
        runId: agentRun.parentRunId,
        taskId: agentRun.taskId,
        at: now,
      },
      matches: (event) => event.type === "TaskCompleted" && event.taskId === agentRun.taskId,
    });
  } else if (input.outcome.kind === "failed") {
    await recordIfMissing({
      eventRecorder: input.eventRecorder,
      runId: agentRun.parentRunId,
      event: {
        type: "AgentFailed",
        runId: agentRun.parentRunId,
        taskId: agentRun.taskId,
        agentRunId: agentRun.id,
        reason: input.outcome.error,
        at: now,
      },
      matches: (event) => event.type === "AgentFailed" && event.agentRunId === agentRun.id,
    });
  }

  return {
    agentRun: nextAgentRun,
    task: task ? await input.taskRepository.get(task.id) : undefined,
  };
}

export async function buildOrchestrationProgressSnapshot(input: Omit<Repositories, "clock"> & {
  parentRunId: string;
}): Promise<OrchestrationProgressSnapshot> {
  const tasks = await input.taskRepository.listByRun(input.parentRunId);
  const agentRuns = await input.agentRunRepository.listByParentRun(input.parentRunId);
  const events = await input.eventRecorder.listByRun(input.parentRunId);
  const taskCounts = emptyTaskCounts();
  for (const task of tasks) {
    taskCounts[task.status] += 1;
  }

  return {
    parentRunId: input.parentRunId,
    totalTasks: tasks.length,
    taskCounts,
    activeAgentRuns: agentRuns.filter(isActiveAgentRun),
    completedAgentRuns: agentRuns.filter((agentRun) => agentRun.status === "completed"),
    failedAgentRuns: agentRuns.filter((agentRun) => agentRun.status === "failed"),
    readyForSynthesis: tasks.length > 0 && tasks.every((task) => task.status === "done"),
    latestEvent: events.at(-1),
  };
}

export async function markRunReadyForSynthesis(input: Repositories & {
  parentRunId: string;
}) {
  const progress = await buildOrchestrationProgressSnapshot(input);
  if (!progress.readyForSynthesis) return false;
  return recordOnce({
    eventRecorder: input.eventRecorder,
    runId: input.parentRunId,
    type: "RunReadyForSynthesis",
    event: {
      type: "RunReadyForSynthesis",
      runId: input.parentRunId,
      at: input.clock.nowIso(),
    },
  });
}

export async function recordRunSummarized(input: Repositories & {
  parentRunId: string;
}) {
  return recordOnce({
    eventRecorder: input.eventRecorder,
    runId: input.parentRunId,
    type: "RunSummarized",
    event: {
      type: "RunSummarized",
      runId: input.parentRunId,
      at: input.clock.nowIso(),
    },
  });
}
