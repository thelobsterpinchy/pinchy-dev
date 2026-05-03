import { appendMessage, listMessages } from "./agent-state-store.js";
import { buildOrchestrationSummary } from "./orchestration-policy.js";
import { loadTasks } from "./task-queue.js";
import type { Message, PinchyTask } from "../../../packages/shared/src/contracts.js";

function listThreadTasks(cwd: string, input: Pick<PinchyTask, "conversationId" | "runId">) {
  if (!input.conversationId) {
    return [] as PinchyTask[];
  }

  return loadTasks(cwd).filter((entry) => entry.conversationId === input.conversationId && (!input.runId || entry.runId === input.runId));
}

function buildThreadOrchestrationContent(cwd: string, input: {
  conversationId?: string;
  runId?: string;
  intro: string;
  tasks?: Array<Pick<PinchyTask, "id" | "title" | "status" | "dependsOnTaskIds">>;
}) {
  const threadTasks = input.tasks ?? listThreadTasks(cwd, input);
  const taskTitleById = new Map(threadTasks.map((task) => [task.id, task.title]));
  return buildOrchestrationSummary({
    intro: input.intro,
    tasks: threadTasks.map((task) => ({
      title: task.title,
      status: task.status,
      dependsOnTitles: task.dependsOnTaskIds?.map((dependencyId) => taskTitleById.get(dependencyId) ?? dependencyId),
    })),
  });
}

function hasFinalSynthesisMessage(messages: Message[], runId?: string) {
  return messages.some((message) => message.kind === "orchestration_final" && (!runId || message.runId === runId));
}

function hasEquivalentPlainAgentMessage(messages: Message[], input: { runId?: string; content: string; requireSameRunId?: boolean }) {
  return messages.some((message) => message.role === "agent"
    && !message.kind
    && message.content === input.content
    && (!input.requireSameRunId || !input.runId || message.runId === input.runId));
}

export function appendPlainAgentRelay(cwd: string, input: {
  conversationId?: string;
  runId?: string;
  content: string;
  requireSameRunId?: boolean;
}) {
  if (!input.conversationId) return undefined;
  const messages = listMessages(cwd, input.conversationId);
  if (hasEquivalentPlainAgentMessage(messages, {
    runId: input.runId,
    content: input.content,
    requireSameRunId: input.requireSameRunId,
  })) {
    return undefined;
  }

  return appendMessage(cwd, {
    conversationId: input.conversationId,
    role: "agent",
    content: input.content,
    runId: input.runId,
  });
}

export function appendDelegatedOutcomeRelay(cwd: string, input: {
  conversationId?: string;
  runId?: string;
  content: string;
}) {
  return appendPlainAgentRelay(cwd, {
    ...input,
    requireSameRunId: true,
  });
}

export function appendOrchestrationUpdate(cwd: string, input: {
  conversationId?: string;
  runId?: string;
  intro: string;
  tasks?: Array<Pick<PinchyTask, "id" | "title" | "status" | "dependsOnTaskIds">>;
}) {
  if (!input.conversationId) return undefined;
  return appendMessage(cwd, {
    conversationId: input.conversationId,
    role: "agent",
    content: buildThreadOrchestrationContent(cwd, input),
    runId: input.runId,
    kind: "orchestration_update",
  });
}

export function appendFinalThreadSynthesisIfReady(cwd: string, input: {
  conversationId?: string;
  runId?: string;
}) {
  if (!input.conversationId) return undefined;

  const threadTasks = listThreadTasks(cwd, input);
  if (threadTasks.length === 0) return undefined;
  if (threadTasks.some((task) => task.status === "pending" || task.status === "running" || task.status === "blocked")) {
    return undefined;
  }

  const messages = listMessages(cwd, input.conversationId);
  if (hasFinalSynthesisMessage(messages, input.runId)) {
    return undefined;
  }

  return appendMessage(cwd, {
    conversationId: input.conversationId,
    role: "agent",
    content: buildThreadOrchestrationContent(cwd, {
      conversationId: input.conversationId,
      runId: input.runId,
      intro: "Final synthesis summary: delegated work for this thread is complete.",
      tasks: threadTasks,
    }),
    runId: input.runId,
    kind: "orchestration_final",
  });
}
