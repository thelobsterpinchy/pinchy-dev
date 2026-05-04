import type { AgentRun, OrchestrationEvent, OrchestrationTask } from "../../../../../packages/shared/src/contracts.js";

export interface TaskRepository {
  listReadyByRun(runId: string): Promise<OrchestrationTask[]>;
  save(task: OrchestrationTask): Promise<void>;
}

export interface AgentRunRepository {
  save(agentRun: AgentRun): Promise<void>;
}

export interface EventRecorder {
  record(event: OrchestrationEvent): Promise<void>;
}
