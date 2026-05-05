import type { AgentRun } from "../../../../../packages/shared/src/contracts.js";
import type {
  AgentExecutor,
  AgentRunRepository,
  Clock,
  ContextAssembler,
  EventRecorder,
  ModelSelectionStrategy,
  TaskRepository,
} from "../ports/index.js";

export type SpawnReadyAgentsInput = {
  parentRunId: string;
  conversationId: string;
  parentRunKind: string;
  taskRepository: TaskRepository;
  agentRunRepository: AgentRunRepository;
  contextAssembler: ContextAssembler;
  modelSelection: ModelSelectionStrategy;
  executor: AgentExecutor;
  clock: Clock;
  eventRecorder: EventRecorder;
};

function buildAgentRunId(taskId: string) {
  return `agent-run-${taskId}`;
}

export async function spawnReadyAgents(input: SpawnReadyAgentsInput) {
  const readyTasks = await input.taskRepository.listReadyByRun(input.parentRunId);
  let started = 0;

  for (const task of readyTasks) {
    const context = await input.contextAssembler.buildForTask({
      parentRunId: input.parentRunId,
      taskId: task.id,
      conversationId: input.conversationId,
    });
    const selection = await input.modelSelection.chooseForTask({
      taskTitle: task.title,
      taskPrompt: task.prompt,
      parentRunKind: input.parentRunKind,
      backendCandidates: [input.executor.backend()],
    });
    const handle = await input.executor.start({
      parentRunId: input.parentRunId,
      taskId: task.id,
      conversationId: input.conversationId,
      goal: task.prompt,
      context,
      modelProfile: selection.modelProfile,
    });
    const now = input.clock.nowIso();
    const agentRunId = buildAgentRunId(task.id);
    const agentRun: AgentRun = {
      id: agentRunId,
      parentRunId: input.parentRunId,
      conversationId: input.conversationId,
      taskId: task.id,
      backend: handle.backend,
      backendRunRef: handle.backendRunRef,
      status: "running",
      goal: task.prompt,
      modelProfile: selection.modelProfile,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
    };

    await input.agentRunRepository.save(agentRun);
    await input.taskRepository.save({
      ...task,
      status: "running",
      assignedAgentRunId: agentRunId,
      updatedAt: now,
    });
    await input.eventRecorder.record({
      type: "AgentStarted",
      runId: input.parentRunId,
      taskId: task.id,
      agentRunId,
      backendRunRef: handle.backendRunRef,
      at: now,
    });
    started += 1;
  }

  return started;
}
