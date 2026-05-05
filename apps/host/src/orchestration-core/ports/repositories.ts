import type { AgentRun, OrchestrationEvent, OrchestrationTask } from "../../../../../packages/shared/src/contracts.js";

export interface TaskRepository {
  listReadyByRun(runId: string): Promise<OrchestrationTask[]>;
  listByRun(runId: string, filter?: { status?: OrchestrationTask["status"] }): Promise<OrchestrationTask[]>;
  get(taskId: string): Promise<OrchestrationTask | undefined>;
  save(task: OrchestrationTask): Promise<void>;
}

export interface AgentRunRepository {
  listByParentRun(parentRunId: string): Promise<AgentRun[]>;
  get(agentRunId: string): Promise<AgentRun | undefined>;
  findByBackendRunRef(backendRunRef: string): Promise<AgentRun | undefined>;
  save(agentRun: AgentRun): Promise<void>;
}

export interface EventRecorder {
  record(event: OrchestrationEvent): Promise<void>;
  listByRun(runId: string): Promise<OrchestrationEvent[]>;
}
