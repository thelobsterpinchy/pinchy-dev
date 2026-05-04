import type { PinchyTask, TaskStatus } from "../../../packages/shared/src/contracts.js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ApprovalRecord } from "../../../packages/shared/src/contracts.js";
import { setApprovalScope } from "./approval-policy.js";
import { appendFinalThreadSynthesisIfReady, appendOrchestrationUpdate, appendPlainAgentRelay } from "./orchestration-thread.js";
import { queueReloadRequest } from "./reload-requests.js";
import { clearCompletedTasks, deleteTask, enqueueDelegationPlan, enqueueTask, reprioritizeTask, updateTaskStatus } from "./task-queue.js";
import { createAgentGuidance, appendMessage, requestRunCancellation } from "./agent-state-store.js";

type DashboardServerOptions = {
  agentSessionController?: {
    steerRun?: (input: { cwd: string; conversationId: string; runId?: string; content: string }) => Promise<void>;
    queueFollowUp?: (input: { cwd: string; conversationId: string; runId?: string; content: string }) => Promise<void>;
  };
};

function loadApprovals(cwd: string) {
  const path = resolve(cwd, ".pinchy-approvals.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ApprovalRecord[];
  } catch {
    return [] as ApprovalRecord[];
  }
}

function saveApprovals(cwd: string, approvals: ApprovalRecord[]) {
  const path = resolve(cwd, ".pinchy-approvals.json");
  writeFileSync(path, JSON.stringify(approvals, null, 2), "utf8");
}

function summarizeTaskStatus(task: Pick<PinchyTask, "title" | "status">) {
  const statusText = task.status === "done"
    ? "done"
    : task.status === "running"
      ? "running"
      : task.status === "blocked"
        ? "blocked"
        : "queued";
  return `Background task update: ${task.title} is now ${statusText}.`;
}

function isDelegationTask(value: unknown): value is { id?: string; title: string; prompt: string; dependsOn?: string[] } {
  return Boolean(
    value
    && typeof value === "object"
    && (typeof (value as { id?: unknown }).id === "undefined" || typeof (value as { id?: unknown }).id === "string")
    && typeof (value as { title?: unknown }).title === "string"
    && typeof (value as { prompt?: unknown }).prompt === "string"
    && (typeof (value as { dependsOn?: unknown }).dependsOn === "undefined"
      || (Array.isArray((value as { dependsOn?: unknown }).dependsOn)
        && (value as { dependsOn: unknown[] }).dependsOn.every((entry) => typeof entry === "string")))
    && (value as { title: string }).title.trim()
    && (value as { prompt: string }).prompt.trim(),
  );
}

export async function handleAction(
  cwd: string,
  action: string,
  payload: Record<string, unknown>,
  options: DashboardServerOptions = {},
) {
  if (action === "task" && typeof payload.id === "string" && typeof payload.status === "string") {
    const updated = updateTaskStatus(cwd, payload.id, payload.status as TaskStatus);
    if (updated?.conversationId) {
      appendOrchestrationUpdate(cwd, {
        conversationId: updated.conversationId,
        runId: updated.runId,
        intro: summarizeTaskStatus(updated),
      });
      appendFinalThreadSynthesisIfReady(cwd, {
        conversationId: updated.conversationId,
        runId: updated.runId,
      });
    }
    return;
  }
  if (action === "queue-task" && typeof payload.title === "string" && typeof payload.prompt === "string") {
    const task = enqueueTask(cwd, payload.title, payload.prompt, {
      source: typeof payload.source === "string" && ["user", "agent", "daemon", "qa", "watcher", "routine"].includes(payload.source)
        ? (payload.source as "user" | "agent" | "daemon" | "qa" | "watcher" | "routine")
        : undefined,
      conversationId: typeof payload.conversationId === "string" ? payload.conversationId : undefined,
      runId: typeof payload.runId === "string" ? payload.runId : undefined,
      dependsOnTaskIds: Array.isArray(payload.dependsOnTaskIds) ? payload.dependsOnTaskIds.filter((entry): entry is string => typeof entry === "string") : undefined,
    });
    if (task.conversationId) {
      appendPlainAgentRelay(cwd, {
        conversationId: task.conversationId,
        content: `I queued a bounded background task for this thread: ${task.title}. I'll keep you posted here as it progresses.`,
      });
      appendOrchestrationUpdate(cwd, {
        conversationId: task.conversationId,
        runId: task.runId,
        intro: `I spawned a bounded background task for this thread: ${task.title}. I will keep orchestrating and summarize progress here.`,
        tasks: [task],
      });
    }
    return;
  }
  if (action === "task-reprioritize" && typeof payload.taskId === "string" && (payload.direction === "up" || payload.direction === "down" || payload.direction === "top" || payload.direction === "bottom")) {
    reprioritizeTask(cwd, payload.taskId, payload.direction as "up" | "down" | "top" | "bottom");
    return;
  }
  if (action === "task-clear-completed") {
    clearCompletedTasks(cwd);
    return;
  }
  if (action === "task-delete" && typeof payload.taskId === "string") {
    const deleted = deleteTask(cwd, payload.taskId);
    if (deleted?.runId && deleted.status !== "done") {
      requestRunCancellation(cwd, deleted.runId, "Task deleted by operator");
    }
    return deleted;
  }
  if (action === "agent-guidance" && typeof payload.conversationId === "string" && typeof payload.taskId === "string" && typeof payload.content === "string") {
    const guidance = createAgentGuidance(cwd, {
      conversationId: payload.conversationId,
      taskId: payload.taskId,
      runId: typeof payload.runRunId === "string" ? (payload.runId as string | undefined) : undefined,
      content: payload.content.trim(),
    });
    return guidance;
  }
  if (action === "agent-steer" && typeof payload.conversationId === "string" && typeof payload.content === "string") {
    const runId = typeof payload.runId === "string" ? payload.runId : undefined;
    const content = payload.content.trim();
    await options.agentSessionController?.steerRun?.({
      cwd,
      conversationId: payload.conversationId,
      runId,
      content,
    });
    appendMessage(cwd, {
      conversationId: payload.conversationId,
      role: "agent",
      runId,
      content: `I interrupted the delegated agent and steered it with this updated direction:\n\n${content}`,
    });
    return;
  }
  if (action === "agent-follow-up" && typeof payload.conversationId === "string" && typeof payload.content === "string") {
    const runId = typeof payload.runId === "string" ? payload.runId : undefined;
    const content = payload.content.trim();
    await options.agentSessionController?.queueFollowUp?.({
      cwd,
      conversationId: payload.conversationId,
      runId,
      content,
    });
    appendMessage(cwd, {
      conversationId: payload.conversationId,
      role: "agent",
      runId,
      content: `I queued a follow-up for the delegated agent:\n\n${content}`,
    });
    return;
  }
  if (action === "delegate-plan" && typeof payload.conversationId === "string" && Array.isArray(payload.tasks)) {
    const conversationId = payload.conversationId;
    const runId = typeof payload.runId === "string" ? payload.runId : undefined;
    const tasks = enqueueDelegationPlan(cwd, payload.tasks.filter(isDelegationTask).map((task) => ({
      id: task.id,
      title: task.title.trim(),
      prompt: task.prompt.trim(),
      dependsOn: task.dependsOn?.map((entry: string) => entry.trim()).filter(Boolean),
    })), {
      source: "user",
      conversationId,
      runId,
    });
    if (tasks.length > 0) {
      const taskList = tasks.map((task) => task.title).join(", ");
      appendPlainAgentRelay(cwd, {
        conversationId,
        content: `I delegated ${tasks.length} bounded background task${tasks.length === 1 ? "" : "s"} for this thread: ${taskList}. I'll keep you posted here as each one progresses.`,
      });
      appendOrchestrationUpdate(cwd, {
        conversationId,
        runId,
        intro: `I delegated ${tasks.length} bounded background tasks for this thread: ${taskList}. I will keep orchestrating and summarize progress here.`,
        tasks,
      });
    }
    return;
  }
  if (action === "routine-run" && typeof payload.name === "string") {
    enqueueTask(cwd, `Run routine: ${payload.name}`, `Use /run-routine ${payload.name} or equivalent routine execution flow to run the saved routine named ${payload.name}.`);
    return;
  }
  if (action === "approval" && typeof payload.id === "string" && typeof payload.status === "string") {
    const approvals = loadApprovals(cwd);
    const match = approvals.find((entry: ApprovalRecord) => entry.id === payload.id);
    if (match && (payload.status === "approved" || payload.status === "denied")) {
      match.status = payload.status;
      saveApprovals(cwd, approvals);
    }
    return;
  }
  if (action === "scope" && typeof payload.scope === "string" && typeof payload.enabled === "boolean") {
    setApprovalScope(cwd, payload.scope, payload.enabled);
    return;
  }
  if (action === "generated-tool-reload" && typeof payload.name === "string") {
    queueReloadRequest(cwd, payload.name);
    return;
  }
  if (action === "reload-runtime") {
    const name = typeof payload.name === "string" ? payload.name : undefined;
    queueReloadRequest(cwd, name);
  }
}
