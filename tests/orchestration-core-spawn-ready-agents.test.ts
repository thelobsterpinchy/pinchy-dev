import test from "node:test";
import assert from "node:assert/strict";
import { spawnReadyAgents } from "../apps/host/src/orchestration-core/application/spawn-ready-agents.js";
import type {
  AgentExecutor,
  ContextAssembler,
  ModelSelectionStrategy,
  TaskRepository,
  AgentRunRepository,
  Clock,
  EventRecorder,
} from "../apps/host/src/orchestration-core/ports/index.js";
import type { AgentRun, OrchestrationEvent, OrchestrationTask } from "../packages/shared/src/contracts.js";

class InMemoryTaskRepository implements TaskRepository {
  constructor(private readonly tasks: OrchestrationTask[]) {}

  async listReadyByRun(runId: string): Promise<OrchestrationTask[]> {
    return this.tasks.filter((task) => task.parentRunId === runId && task.status === "ready");
  }

  async listByRun(runId: string, filter: { status?: OrchestrationTask["status"] } = {}): Promise<OrchestrationTask[]> {
    return this.tasks
      .filter((task) => task.parentRunId === runId)
      .filter((task) => !filter.status || task.status === filter.status);
  }

  async get(taskId: string): Promise<OrchestrationTask | undefined> {
    return this.tasks.find((task) => task.id === taskId);
  }

  async save(task: OrchestrationTask): Promise<void> {
    const index = this.tasks.findIndex((entry) => entry.id === task.id);
    if (index >= 0) {
      this.tasks[index] = task;
      return;
    }
    this.tasks.push(task);
  }

  current() {
    return this.tasks;
  }
}

class InMemoryAgentRunRepository implements AgentRunRepository {
  private readonly agentRuns: AgentRun[] = [];

  async listByParentRun(parentRunId: string): Promise<AgentRun[]> {
    return this.agentRuns.filter((agentRun) => agentRun.parentRunId === parentRunId);
  }

  async get(agentRunId: string): Promise<AgentRun | undefined> {
    return this.agentRuns.find((agentRun) => agentRun.id === agentRunId);
  }

  async findByBackendRunRef(backendRunRef: string): Promise<AgentRun | undefined> {
    return this.agentRuns.find((agentRun) => agentRun.backendRunRef === backendRunRef);
  }

  async save(agentRun: AgentRun): Promise<void> {
    this.agentRuns.push(agentRun);
  }

  current() {
    return this.agentRuns;
  }
}

class StubContextAssembler implements ContextAssembler {
  calls: Array<{ parentRunId: string; taskId: string; conversationId: string }> = [];

  async buildForTask(input: { parentRunId: string; taskId: string; conversationId: string }) {
    this.calls.push(input);
    return {
      objective: `Deliver ${input.taskId}`,
      constraints: ["tests first"],
      repoFacts: ["pinchy-dev"],
      dependencyOutputs: [],
    };
  }
}

class StubModelSelectionStrategy implements ModelSelectionStrategy {
  calls: Array<{ taskTitle: string; taskPrompt: string; parentRunKind: string; backendCandidates: string[] }> = [];

  async chooseForTask(input: { taskTitle: string; taskPrompt: string; parentRunKind: string; backendCandidates: string[] }) {
    this.calls.push(input);
    return {
      backend: "pi",
      modelProfile: "coding-default",
    } as const;
  }
}

class StubAgentExecutor implements AgentExecutor {
  calls: Array<{ goal: string; modelProfile: string; contextObjective: string }> = [];

  backend() {
    return "pi" as const;
  }

  async start(request: Parameters<AgentExecutor["start"]>[0]) {
    this.calls.push({
      goal: request.goal,
      modelProfile: request.modelProfile,
      contextObjective: request.context.objective,
    });
    return {
      backend: "pi",
      backendRunRef: `pi-session:${request.taskId}`,
    } as const;
  }

  async poll(): Promise<{ state: "running" }> {
    throw new Error("not implemented");
  }

  async sendGuidance(): Promise<void> {
    throw new Error("not implemented");
  }

  async answerQuestion(): Promise<void> {
    throw new Error("not implemented");
  }

  async cancel(): Promise<void> {
    throw new Error("not implemented");
  }
}

class FixedClock implements Clock {
  nowIso() {
    return "2026-05-03T12:00:00.000Z";
  }
}

class InMemoryEventRecorder implements EventRecorder {
  readonly events: OrchestrationEvent[] = [];

  async record(event: OrchestrationEvent): Promise<void> {
    this.events.push(event);
  }

  async listByRun(runId: string): Promise<OrchestrationEvent[]> {
    return this.events.filter((event) => event.runId === runId);
  }
}

test("spawnReadyAgents starts a child agent for each ready task using assembled context and selected model", async () => {
  const taskRepository = new InMemoryTaskRepository([
    {
      id: "task-1",
      parentRunId: "run-1",
      title: "Patch orchestration core",
      prompt: "Implement spawn-ready-agents",
      status: "ready",
      dependsOnTaskIds: [],
      createdAt: "2026-05-03T11:59:00.000Z",
      updatedAt: "2026-05-03T11:59:00.000Z",
    },
  ]);
  const agentRunRepository = new InMemoryAgentRunRepository();
  const contextAssembler = new StubContextAssembler();
  const modelSelection = new StubModelSelectionStrategy();
  const executor = new StubAgentExecutor();
  const eventRecorder = new InMemoryEventRecorder();

  const started = await spawnReadyAgents({
    parentRunId: "run-1",
    conversationId: "conversation-1",
    parentRunKind: "user_prompt",
    taskRepository,
    agentRunRepository,
    contextAssembler,
    modelSelection,
    executor,
    clock: new FixedClock(),
    eventRecorder,
  });

  assert.equal(started, 1);
  assert.equal(contextAssembler.calls.length, 1);
  assert.deepEqual(contextAssembler.calls[0], {
    parentRunId: "run-1",
    taskId: "task-1",
    conversationId: "conversation-1",
  });
  assert.equal(modelSelection.calls.length, 1);
  assert.equal(modelSelection.calls[0]?.taskTitle, "Patch orchestration core");
  assert.equal(executor.calls.length, 1);
  assert.deepEqual(executor.calls[0], {
    goal: "Implement spawn-ready-agents",
    modelProfile: "coding-default",
    contextObjective: "Deliver task-1",
  });

  const savedTask = taskRepository.current()[0];
  assert.equal(savedTask?.status, "running");
  assert.equal(savedTask?.assignedAgentRunId, "agent-run-task-1");
  assert.equal(savedTask?.updatedAt, "2026-05-03T12:00:00.000Z");

  const savedAgentRun = agentRunRepository.current()[0];
  assert.deepEqual(savedAgentRun, {
    id: "agent-run-task-1",
    parentRunId: "run-1",
    conversationId: "conversation-1",
    taskId: "task-1",
    backend: "pi",
    backendRunRef: "pi-session:task-1",
    status: "running",
    goal: "Implement spawn-ready-agents",
    modelProfile: "coding-default",
    createdAt: "2026-05-03T12:00:00.000Z",
    updatedAt: "2026-05-03T12:00:00.000Z",
    startedAt: "2026-05-03T12:00:00.000Z",
  });

  assert.deepEqual(eventRecorder.events, [
    {
      type: "AgentStarted",
      runId: "run-1",
      taskId: "task-1",
      agentRunId: "agent-run-task-1",
      backendRunRef: "pi-session:task-1",
      at: "2026-05-03T12:00:00.000Z",
    },
  ]);
});
