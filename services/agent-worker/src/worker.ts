import { appendMessage, claimNextQueuedRun, listAgentGuidances, listQuestions, listReplies, listRuns, markAgentGuidanceApplied, updateQuestionStatus, updateRunStatus } from "../../../apps/host/src/agent-state-store.js";
import { appendAuditEntry } from "../../../apps/host/src/audit-log.js";
import { shouldRunAsCliEntry } from "../../../apps/host/src/module-entry.js";
import { appendFinalThreadSynthesisIfReady, appendOrchestrationUpdate } from "../../../apps/host/src/orchestration-thread.js";
import { updateTaskStatusByRunId } from "../../../apps/host/src/task-queue.js";
import type { NotificationDelivery, Question, Run } from "../../../packages/shared/src/contracts.js";
import { createQuestionDeliveryDispatcher } from "../../../services/notifiers/dispatcher.js";
import { createPiRunExecutor } from "./pi-run-executor.js";
import { normalizeRunOutcome, type LegacyRunExecutionResult, type PiRunExecutionResult } from "./run-outcomes.js";
import { applyRunOutcome } from "./run-transition-manager.js";

type WorkerDependencies = {
  executeRun: (run: Run) => Promise<PiRunExecutionResult | LegacyRunExecutionResult>;
};

type ResumeDependencies = {
  resumeRun: (run: Run, reply: string) => Promise<PiRunExecutionResult | LegacyRunExecutionResult>;
};

type DeliveryDependencies = {
  dispatchQuestion: (cwd: string, question: Question) => Promise<NotificationDelivery>;
};

function mapRunStatusToTaskStatus(status: Run["status"]): "done" | "blocked" {
  return status === "completed" ? "done" : "blocked";
}

function summarizeTaskStatus(task: { title: string; status: "done" | "blocked" | "pending" | "running" }) {
  const statusText = task.status === "done"
    ? "done"
    : task.status === "running"
      ? "running"
      : task.status === "blocked"
        ? "blocked"
        : "queued";
  return `Background task update: ${task.title} is now ${statusText}.`;
}

function consumePendingGuidanceForRun(cwd: string, run: Run) {
  const pendingGuidance = listAgentGuidances(cwd, { runId: run.id, status: "pending" });
  if (pendingGuidance.length === 0) {
    return { guidanceText: undefined, guidanceRecords: [] as ReturnType<typeof listAgentGuidances> };
  }

  const guidanceText = pendingGuidance
    .map((guidance, index) => `${index + 1}. ${guidance.content}`)
    .join("\n");

  appendMessage(cwd, {
    conversationId: run.conversationId,
    role: "agent",
    content: `Scoped guidance acknowledged for this agent task:\n${guidanceText}`,
    runId: run.id,
  });

  for (const guidance of pendingGuidance) {
    markAgentGuidanceApplied(cwd, guidance.id);
  }

  return { guidanceText, guidanceRecords: pendingGuidance };
}

function applyGuidanceToRun(run: Run, guidanceText?: string) {
  if (!guidanceText) {
    return run;
  }
  return {
    ...run,
    goal: `${run.goal}\n\nAdditional scoped user guidance for this agent task:\n${guidanceText}`,
  };
}

function applyGuidanceToReply(reply: string, guidanceText?: string) {
  if (!guidanceText) {
    return reply;
  }
  return `${reply}\n\nAdditional scoped user guidance for this agent task:\n${guidanceText}`;
}

async function executeClaimedRun(cwd: string, runningRun: Run, dependencies: WorkerDependencies) {
  const startedAt = Date.now();
  appendAuditEntry(cwd, {
    type: "worker_run_started",
    runId: runningRun.id,
    conversationId: runningRun.conversationId,
    details: { executionMode: "queued", runKind: runningRun.kind },
  });

  try {
    const { guidanceText } = consumePendingGuidanceForRun(cwd, runningRun);
    const result = await dependencies.executeRun(applyGuidanceToRun(runningRun, guidanceText));
    const outcome = normalizeRunOutcome(result, result);
    const persistedRun = applyRunOutcome({
      cwd,
      run: runningRun,
      outcome,
    });
    if (persistedRun?.id) {
      const updatedTask = updateTaskStatusByRunId(cwd, persistedRun.id, mapRunStatusToTaskStatus(persistedRun.status));
      if (updatedTask?.conversationId) {
        appendOrchestrationUpdate(cwd, {
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId,
          intro: summarizeTaskStatus(updatedTask),
        });
        appendFinalThreadSynthesisIfReady(cwd, {
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId,
        });
      }
    }
    appendAuditEntry(cwd, {
      type: "worker_run_finished",
      runId: runningRun.id,
      conversationId: runningRun.conversationId,
      summary: outcome.summary,
      error: outcome.kind === "failed" ? outcome.error : outcome.kind === "waiting_for_human" || outcome.kind === "waiting_for_approval" ? outcome.blockedReason : undefined,
      details: {
        executionMode: "queued",
        runKind: runningRun.kind,
        outcomeKind: outcome.kind,
        runStatus: persistedRun?.status ?? outcome.kind,
        durationMs: Date.now() - startedAt,
      },
    });
    return persistedRun;
  } catch (error) {
    appendAuditEntry(cwd, {
      type: "worker_run_finished",
      runId: runningRun.id,
      conversationId: runningRun.conversationId,
      summary: `Run execution failed before outcome persistence: ${runningRun.goal}`,
      error: error instanceof Error ? error.message : String(error),
      details: {
        executionMode: "queued",
        runKind: runningRun.kind,
        outcomeKind: "execution_error",
        runStatus: "running",
        durationMs: Date.now() - startedAt,
      },
    });
    const updatedTask = updateTaskStatusByRunId(cwd, runningRun.id, "blocked");
    if (updatedTask?.conversationId) {
      appendOrchestrationUpdate(cwd, {
        conversationId: updatedTask.conversationId,
        runId: updatedTask.runId,
        intro: summarizeTaskStatus(updatedTask),
      });
    }
    throw error;
  }
}

export async function processNextQueuedRun(cwd: string, dependencies: WorkerDependencies) {
  const run = claimNextQueuedRun(cwd);
  if (!run) return undefined;
  return executeClaimedRun(cwd, run, dependencies);
}

export async function processAvailableQueuedRuns(cwd: string, dependencies: WorkerDependencies, options: { concurrency?: number } = {}) {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
  const processed: Run[] = [];

  while (true) {
    const claimedRuns: Run[] = [];
    for (let index = 0; index < concurrency; index += 1) {
      const claimedRun = claimNextQueuedRun(cwd);
      if (!claimedRun) break;
      claimedRuns.push(claimedRun);
    }

    if (claimedRuns.length === 0) {
      return processed;
    }

    const results = await Promise.all(claimedRuns.map((run) => executeClaimedRun(cwd, run, dependencies)));
    processed.push(...results.filter((run): run is Run => Boolean(run)));

    if (claimedRuns.length < concurrency) {
      return processed;
    }
  }
}

function getNextResumableRun(cwd: string) {
  const waitingRuns = listRuns(cwd).filter((run) => run.status === "waiting_for_human" && !!run.piSessionPath);
  if (waitingRuns.length === 0) return undefined;

  const questions = listQuestions(cwd);
  const replies = listReplies(cwd);

  for (const run of waitingRuns.reverse()) {
    const answeredQuestions = questions
      .filter((question) => question.runId === run.id && question.status === "answered")
      .sort((a, b) => (b.resolvedAt ?? b.createdAt).localeCompare(a.resolvedAt ?? a.createdAt));

    for (const question of answeredQuestions) {
      const latestReply = replies
        .filter((reply) => reply.questionId === question.id)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
      if (latestReply) {
        return { run, reply: latestReply.content };
      }
    }
  }

  return undefined;
}

function getNextPendingQuestion(cwd: string) {
  return listQuestions(cwd)
    .filter((question) => question.status === "pending_delivery")
    .reverse()[0];
}

export async function processNextPendingQuestionDelivery(cwd: string, dependencies: DeliveryDependencies) {
  const question = getNextPendingQuestion(cwd);
  if (!question) return undefined;

  const delivery = await dependencies.dispatchQuestion(cwd, question);
  updateQuestionStatus(cwd, question.id, "waiting_for_human");
  appendAuditEntry(cwd, {
    type: "worker_question_delivery_finished",
    runId: question.runId,
    questionId: question.id,
    conversationId: question.conversationId,
    summary: `Question delivery ${delivery.status}`,
    error: delivery.error,
    details: {
      channel: delivery.channel,
      deliveryStatus: delivery.status,
    },
  });
  return { question, delivery };
}

export async function processNextResumableRun(cwd: string, dependencies: ResumeDependencies) {
  const resumable = getNextResumableRun(cwd);
  if (!resumable) return undefined;

  const startedAt = Date.now();
  const runningRun = updateRunStatus(cwd, resumable.run.id, "running") ?? { ...resumable.run, status: "running" as const };
  appendAuditEntry(cwd, {
    type: "worker_run_started",
    runId: runningRun.id,
    conversationId: runningRun.conversationId,
    details: { executionMode: "resumed", runKind: runningRun.kind },
  });

  try {
    const { guidanceText } = consumePendingGuidanceForRun(cwd, runningRun);
    const result = await dependencies.resumeRun(runningRun, applyGuidanceToReply(resumable.reply, guidanceText));
    const outcome = normalizeRunOutcome(result, result);
    const persistedRun = applyRunOutcome({
      cwd,
      run: runningRun,
      outcome,
    });
    if (persistedRun?.id) {
      const updatedTask = updateTaskStatusByRunId(cwd, persistedRun.id, mapRunStatusToTaskStatus(persistedRun.status));
      if (updatedTask?.conversationId) {
        appendOrchestrationUpdate(cwd, {
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId,
          intro: summarizeTaskStatus(updatedTask),
        });
        appendFinalThreadSynthesisIfReady(cwd, {
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId,
        });
      }
    }
    appendAuditEntry(cwd, {
      type: "worker_run_finished",
      runId: runningRun.id,
      conversationId: runningRun.conversationId,
      summary: outcome.summary,
      error: outcome.kind === "failed" ? outcome.error : outcome.kind === "waiting_for_human" || outcome.kind === "waiting_for_approval" ? outcome.blockedReason : undefined,
      details: {
        executionMode: "resumed",
        runKind: runningRun.kind,
        outcomeKind: outcome.kind,
        runStatus: persistedRun?.status ?? outcome.kind,
        durationMs: Date.now() - startedAt,
      },
    });
    return persistedRun;
  } catch (error) {
    appendAuditEntry(cwd, {
      type: "worker_run_finished",
      runId: runningRun.id,
      conversationId: runningRun.conversationId,
      summary: `Run resume failed before outcome persistence: ${runningRun.goal}`,
      error: error instanceof Error ? error.message : String(error),
      details: {
        executionMode: "resumed",
        runKind: runningRun.kind,
        outcomeKind: "execution_error",
        runStatus: "running",
        durationMs: Date.now() - startedAt,
      },
    });
    const updatedTask = updateTaskStatusByRunId(cwd, runningRun.id, "blocked");
    if (updatedTask?.conversationId) {
      appendOrchestrationUpdate(cwd, {
        conversationId: updatedTask.conversationId,
        runId: updatedTask.runId,
        intro: summarizeTaskStatus(updatedTask),
      });
    }
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const defaultPiRunExecutor = createPiRunExecutor();
const defaultQuestionDeliveryDispatcher = createQuestionDeliveryDispatcher();

async function defaultExecuteRun(run: Run): Promise<PiRunExecutionResult> {
  return defaultPiRunExecutor.executeRun({ cwd: process.env.PINCHY_CWD ?? process.cwd(), run });
}

async function defaultResumeRun(run: Run, reply: string): Promise<PiRunExecutionResult> {
  return defaultPiRunExecutor.resumeRun({ cwd: process.env.PINCHY_CWD ?? process.cwd(), run, reply });
}

async function defaultDispatchQuestion(cwd: string, question: Question): Promise<NotificationDelivery> {
  return defaultQuestionDeliveryDispatcher.dispatchQuestion(cwd, question);
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  const once = process.env.PINCHY_WORKER_ONCE === "true";
  const intervalMs = Number(process.env.PINCHY_WORKER_INTERVAL_MS ?? 5000);
  const concurrency = Math.max(1, Number(process.env.PINCHY_WORKER_CONCURRENCY ?? 2));

  do {
    const resumed = await processNextResumableRun(cwd, { resumeRun: defaultResumeRun });
    const delivered = resumed ? undefined : await processNextPendingQuestionDelivery(cwd, { dispatchQuestion: defaultDispatchQuestion });
    const processedRuns = resumed || delivered ? [] : await processAvailableQueuedRuns(cwd, { executeRun: defaultExecuteRun }, { concurrency });
    const processed = resumed ?? delivered ?? processedRuns[0];
    if (once) return;
    if (!processed) await sleep(intervalMs);
  } while (true);
}

if (shouldRunAsCliEntry(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
