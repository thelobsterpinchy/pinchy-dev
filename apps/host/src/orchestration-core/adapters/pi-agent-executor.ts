import {
  createAgentGuidance,
  createHumanReply,
  createRun,
  getRunById,
  listQuestions,
  markQuestionAnswered,
  requestRunCancellation,
} from "../../agent-state-store.js";
import type { Run } from "../../../../../packages/shared/src/contracts.js";
import { recordGuidanceQueued, recordHumanReplyReceived } from "../application/human-interactions.js";
import type {
  AgentExecutionRequest,
  AgentExecutionStatus,
  AgentExecutor,
} from "../ports/index.js";
import { FileBackedAgentRunRepository, FileBackedEventRecorder, FileBackedTaskRepository } from "./file-repositories.js";

export type PiAgentExecutorOptions = {
  cwd: string;
};

const systemClock = {
  nowIso() {
    return new Date().toISOString();
  },
};

function formatList(title: string, entries: string[]) {
  const normalized = entries.map((entry) => entry.trim()).filter(Boolean);
  if (normalized.length === 0) return undefined;
  return `${title}:\n${normalized.map((entry) => `- ${entry}`).join("\n")}`;
}

function buildPiExecutionGoal(request: AgentExecutionRequest) {
  return [
    `Queued orchestration-core task for parent run ${request.parentRunId}.`,
    `Task: ${request.goal}`,
    `Task id: ${request.taskId}`,
    `Model profile requested by orchestration-core: ${request.modelProfile}`,
    `Objective:\n${request.context.objective}`,
    formatList("Context constraints", request.context.constraints),
    formatList("Repository facts", request.context.repoFacts),
    formatList("Dependency outputs", request.context.dependencyOutputs),
    request.memorySnapshot
      ? `Memory snapshot:\n${JSON.stringify(request.memorySnapshot, null, 2)}`
      : undefined,
    "Execute only this bounded task. Report completion, blockage, or failure through the normal Pinchy worker outcome path.",
  ].filter(Boolean).join("\n\n");
}

function summarizeRun(run: Run) {
  return run.summary?.trim() || run.goal;
}

function runBlockedQuestion(cwd: string, run: Run): AgentExecutionStatus {
  const question = listQuestions(cwd)
    .filter((entry) => entry.runId === run.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  return {
    state: "blocked",
    question: {
      prompt: question?.prompt ?? run.blockedReason ?? "The Pi-backed agent is blocked and needs input.",
      priority: question?.priority,
    },
  };
}

function mapRunToStatus(cwd: string, run: Run): AgentExecutionStatus {
  switch (run.status) {
    case "queued":
    case "planning":
      return { state: "starting" };
    case "running":
    case "waiting_for_approval":
    case "cancelling":
      return { state: "running" };
    case "waiting_for_human":
      return runBlockedQuestion(cwd, run);
    case "completed":
      return {
        state: "completed",
        result: { summary: summarizeRun(run) },
      };
    case "failed":
      return {
        state: "failed",
        error: run.blockedReason ?? run.summary ?? "Pi execution failed.",
      };
    case "cancelled":
      return { state: "cancelled" };
  }
}

export class PiAgentExecutor implements AgentExecutor {
  constructor(private readonly options: PiAgentExecutorOptions) {}

  backend() {
    return "pi" as const;
  }

  async start(request: AgentExecutionRequest) {
    const run = createRun(this.options.cwd, {
      conversationId: request.conversationId,
      goal: buildPiExecutionGoal(request),
      kind: "queued_task",
    });

    return {
      backend: this.backend(),
      backendRunRef: run.id,
    };
  }

  async poll(backendRunRef: string): Promise<AgentExecutionStatus> {
    const run = getRunById(this.options.cwd, backendRunRef);
    if (!run) {
      return {
        state: "failed",
        error: `Pi execution run not found: ${backendRunRef}`,
      };
    }
    return mapRunToStatus(this.options.cwd, run);
  }

  async sendGuidance(backendRunRef: string, message: string): Promise<void> {
    const run = getRunById(this.options.cwd, backendRunRef);
    if (!run) {
      throw new Error(`Cannot send guidance to missing Pi execution run: ${backendRunRef}`);
    }
    const agentRunRepository = new FileBackedAgentRunRepository(this.options.cwd);
    const agentRun = await agentRunRepository.findByBackendRunRef(backendRunRef);
    const guidance = createAgentGuidance(this.options.cwd, {
      conversationId: run.conversationId,
      taskId: agentRun?.taskId ?? backendRunRef,
      runId: backendRunRef,
      agentRunId: agentRun?.id,
      content: message,
    });
    await recordGuidanceQueued({
      taskRepository: new FileBackedTaskRepository(this.options.cwd),
      agentRunRepository,
      eventRecorder: new FileBackedEventRecorder(this.options.cwd),
      clock: systemClock,
      guidance,
    });
  }

  async answerQuestion(backendRunRef: string, answer: string): Promise<void> {
    const run = getRunById(this.options.cwd, backendRunRef);
    if (!run) {
      throw new Error(`Cannot answer question for missing Pi execution run: ${backendRunRef}`);
    }
    const question = listQuestions(this.options.cwd)
      .filter((entry) => entry.runId === backendRunRef)
      .filter((entry) => entry.status === "waiting_for_human" || entry.status === "pending_delivery")
      .sort((left, right) => (right.resolvedAt ?? right.createdAt).localeCompare(left.resolvedAt ?? left.createdAt))[0];
    if (!question) {
      throw new Error(`Cannot answer question for Pi execution run without a question: ${backendRunRef}`);
    }
    const reply = createHumanReply(this.options.cwd, {
      questionId: question.id,
      conversationId: run.conversationId,
      channel: "dashboard",
      content: answer,
    });
    markQuestionAnswered(this.options.cwd, question.id);
    await recordHumanReplyReceived({
      taskRepository: new FileBackedTaskRepository(this.options.cwd),
      agentRunRepository: new FileBackedAgentRunRepository(this.options.cwd),
      eventRecorder: new FileBackedEventRecorder(this.options.cwd),
      clock: systemClock,
      question,
      reply,
    });
  }

  async cancel(backendRunRef: string): Promise<void> {
    requestRunCancellation(this.options.cwd, backendRunRef, "Cancellation requested by orchestration-core Pi executor.");
  }
}
