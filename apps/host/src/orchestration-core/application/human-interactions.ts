import type { AgentGuidance, HumanReply, Question } from "../../../../../packages/shared/src/contracts.js";
import type { AgentRunRepository, Clock, EventRecorder, TaskRepository } from "../ports/index.js";

type Repositories = {
  taskRepository: TaskRepository;
  agentRunRepository: AgentRunRepository;
  eventRecorder: EventRecorder;
  clock: Clock;
};

export type RecordAgentBlockedQuestionInput = Repositories & {
  backendRunRef: string;
  question: Question;
};

export type RecordHumanReplyInput = Repositories & {
  question: Question;
  reply: HumanReply;
};

export type RecordGuidanceQueuedInput = Repositories & {
  guidance: AgentGuidance;
};

export async function recordAgentBlockedQuestion(input: RecordAgentBlockedQuestionInput) {
  const agentRun = input.question.agentRunId
    ? await input.agentRunRepository.get(input.question.agentRunId)
    : await input.agentRunRepository.findByBackendRunRef(input.backendRunRef);
  if (!agentRun) return undefined;

  const now = input.clock.nowIso();
  await input.agentRunRepository.save({
    ...agentRun,
    status: "blocked",
    updatedAt: now,
    lastProgressAt: now,
  });

  const task = await input.taskRepository.get(agentRun.taskId);
  if (task) {
    await input.taskRepository.save({
      ...task,
      status: "blocked",
      assignedAgentRunId: agentRun.id,
      updatedAt: now,
    });
  }

  await input.eventRecorder.record({
    type: "AgentBlockedWithQuestion",
    runId: agentRun.parentRunId,
    taskId: agentRun.taskId,
    agentRunId: agentRun.id,
    questionId: input.question.id,
    at: now,
  });

  return { agentRun, task };
}

export async function recordHumanReplyReceived(input: RecordHumanReplyInput) {
  const agentRun = input.question.agentRunId
    ? await input.agentRunRepository.get(input.question.agentRunId)
    : await input.agentRunRepository.findByBackendRunRef(input.question.runId);
  if (!agentRun) return undefined;

  const now = input.clock.nowIso();
  await input.eventRecorder.record({
    type: "HumanReplyReceived",
    runId: agentRun.parentRunId,
    questionId: input.question.id,
    replyId: input.reply.id,
    at: now,
  });

  const task = await input.taskRepository.get(agentRun.taskId);
  if (task?.status === "blocked") {
    await input.taskRepository.save({
      ...task,
      status: "running",
      assignedAgentRunId: agentRun.id,
      updatedAt: now,
    });
  }
  if (agentRun.status === "blocked") {
    await input.agentRunRepository.save({
      ...agentRun,
      status: "running",
      updatedAt: now,
      lastProgressAt: now,
    });
  }

  return { agentRun, task };
}

export async function recordGuidanceQueued(input: RecordGuidanceQueuedInput) {
  const agentRun = input.guidance.agentRunId
    ? await input.agentRunRepository.get(input.guidance.agentRunId)
    : input.guidance.runId
      ? await input.agentRunRepository.findByBackendRunRef(input.guidance.runId)
      : undefined;
  if (!agentRun) return undefined;

  await input.eventRecorder.record({
    type: "GuidanceQueued",
    runId: agentRun.parentRunId,
    agentRunId: agentRun.id,
    guidanceId: input.guidance.id,
    at: input.clock.nowIso(),
  });

  return { agentRun };
}
