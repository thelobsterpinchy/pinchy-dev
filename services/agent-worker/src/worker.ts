import { appendMessage, claimNextQueuedRun, listAgentGuidances, listQuestions, listReplies, listRuns, markAgentGuidanceApplied, updateQuestionStatus, updateRunStatus, type WorkerLane } from "../../../apps/host/src/agent-state-store.js";
import { appendAuditEntry } from "../../../apps/host/src/audit-log.js";
import { shouldRunAsCliEntry } from "../../../apps/host/src/module-entry.js";
import { clearRunContext, setRunContext } from "../../../apps/host/src/run-context.js";
import { appendDelegatedOutcomeRelay, appendFinalThreadSynthesisIfReady, appendOrchestrationUpdate } from "../../../apps/host/src/orchestration-thread.js";
import { FileBackedAgentRunRepository, FileBackedEventRecorder, FileBackedTaskRepository } from "../../../apps/host/src/orchestration-core/adapters/file-repositories.js";
import { recordAgentFinished, type AgentFinishOutcome } from "../../../apps/host/src/orchestration-core/application/completion-synthesis.js";
import { updateTaskStatusByExecutionRunId } from "../../../apps/host/src/task-queue.js";
import type { NotificationDelivery, Question, Run } from "../../../packages/shared/src/contracts.js";
import { createQuestionDeliveryDispatcher } from "../../../services/notifiers/dispatcher.js";
import { createDiscordNotifier } from "../../../services/notifiers/discord.js";
import { createPiRunExecutor } from "./pi-run-executor.js";
import { normalizeRunOutcome, type LegacyRunExecutionResult, type PiRunExecutionResult } from "./run-outcomes.js";
import { applyRunOutcome } from "./run-transition-manager.js";

type WorkerDependencies = {
  executeRun: (run: Run) => Promise<PiRunExecutionResult | LegacyRunExecutionResult>;
  sendRunSummary?: (cwd: string, input: { conversationId: string; runId: string; summary: string; mappedOnly: boolean }) => Promise<NotificationDelivery | undefined>;
};

type ResumeDependencies = {
  resumeRun: (run: Run, reply: string) => Promise<PiRunExecutionResult | LegacyRunExecutionResult>;
  sendRunSummary?: (cwd: string, input: { conversationId: string; runId: string; summary: string; mappedOnly: boolean }) => Promise<NotificationDelivery | undefined>;
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

function buildMainThreadRelayContent(input: {
  task: { title: string; status: "done" | "blocked" | "pending" | "running" };
  outcome: ReturnType<typeof normalizeRunOutcome>;
}) {
  if (input.outcome.kind === "waiting_for_human") {
    return `I need your input to continue delegated task "${input.task.title}": ${input.outcome.question.prompt} Reason: ${input.outcome.blockedReason}.`;
  }

  if (input.outcome.kind === "completed") {
    return `I finished delegated task "${input.task.title}". Summary: ${input.outcome.summary}`;
  }

  if (input.outcome.kind === "failed") {
    return `I hit a failure while working on delegated task "${input.task.title}". Error: ${input.outcome.error}`;
  }

  if (input.outcome.kind === "waiting_for_approval") {
    return `I need approval before delegated task "${input.task.title}" can continue. Reason: ${input.outcome.blockedReason}.`;
  }

  return undefined;
}

function buildOrchestrationRelayIntro(input: {
  task: { title: string; status: "done" | "blocked" | "pending" | "running" };
  outcome: ReturnType<typeof normalizeRunOutcome>;
}) {
  if (input.outcome.kind === "waiting_for_human") {
    return `The delegated agent is blocked and needs your input on \"${input.task.title}\": ${input.outcome.question.prompt} Reason: ${input.outcome.blockedReason}.`;
  }

  if (input.outcome.kind === "completed") {
    return `The delegated agent finished \"${input.task.title}\". Summary: ${input.outcome.summary}`;
  }

  if (input.outcome.kind === "failed") {
    return `The delegated agent hit a failure while working on \"${input.task.title}\". Error: ${input.outcome.error}`;
  }

  if (input.outcome.kind === "waiting_for_approval") {
    return `The delegated agent is waiting for approval before continuing \"${input.task.title}\". Reason: ${input.outcome.blockedReason}.`;
  }

  return summarizeTaskStatus(input.task);
}

const systemClock = {
  nowIso() {
    return new Date().toISOString();
  },
};

function toAgentFinishOutcome(outcome: ReturnType<typeof normalizeRunOutcome>): AgentFinishOutcome | undefined {
  if (outcome.kind === "completed") {
    return { kind: "completed", summary: outcome.summary };
  }
  if (outcome.kind === "failed") {
    return { kind: "failed", error: outcome.error ?? outcome.summary ?? "Agent execution failed." };
  }
  return undefined;
}

async function recordCoreCompletion(cwd: string, runId: string, outcome: ReturnType<typeof normalizeRunOutcome>) {
  const finishOutcome = toAgentFinishOutcome(outcome);
  if (!finishOutcome) return undefined;
  return recordAgentFinished({
    taskRepository: new FileBackedTaskRepository(cwd),
    agentRunRepository: new FileBackedAgentRunRepository(cwd),
    eventRecorder: new FileBackedEventRecorder(cwd),
    clock: systemClock,
    backendRunRef: runId,
    outcome: finishOutcome,
  });
}

async function notifyMappedRunSummary(input: {
  cwd: string;
  conversationId: string;
  runId: string;
  summary?: string;
  sendRunSummary?: WorkerDependencies["sendRunSummary"];
}) {
  const summary = input.summary?.trim();
  if (!summary) return undefined;
  return input.sendRunSummary?.(input.cwd, {
    conversationId: input.conversationId,
    runId: input.runId,
    summary,
    mappedOnly: true,
  });
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
  setRunContext(cwd, {
    currentRunId: runningRun.id,
    currentRunLabel: runningRun.goal,
    currentConversationId: runningRun.conversationId,
    updatedAt: new Date().toISOString(),
  });
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
    const persistedRun = await applyRunOutcome({
      cwd,
      run: runningRun,
      outcome,
    });
    if (persistedRun?.id) {
      const updatedTask = updateTaskStatusByExecutionRunId(cwd, persistedRun.id, mapRunStatusToTaskStatus(persistedRun.status));
      const coreCompletion = await recordCoreCompletion(cwd, persistedRun.id, outcome);
      if (updatedTask?.conversationId) {
        const relayContent = buildMainThreadRelayContent({ task: updatedTask, outcome });
        if (relayContent) {
          appendDelegatedOutcomeRelay(cwd, {
            conversationId: updatedTask.conversationId,
            runId: updatedTask.runId,
            content: relayContent,
          });
        }
        appendOrchestrationUpdate(cwd, {
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId,
          intro: buildOrchestrationRelayIntro({ task: updatedTask, outcome }),
        });
        const finalSynthesis = await appendFinalThreadSynthesisIfReady(cwd, {
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId,
        });
        await notifyMappedRunSummary({
          cwd,
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId ?? persistedRun.id,
          summary: finalSynthesis?.content,
          sendRunSummary: dependencies.sendRunSummary,
        });
      } else if (coreCompletion?.agentRun.conversationId) {
        appendOrchestrationUpdate(cwd, {
          conversationId: coreCompletion.agentRun.conversationId,
          runId: coreCompletion.agentRun.parentRunId,
          intro: buildOrchestrationRelayIntro({
            task: {
              title: coreCompletion.task?.title ?? coreCompletion.agentRun.goal,
              status: coreCompletion.task?.status === "done" ? "done" : coreCompletion.task?.status === "failed" ? "blocked" : "running",
            },
            outcome,
          }),
        });
        const finalSynthesis = await appendFinalThreadSynthesisIfReady(cwd, {
          conversationId: coreCompletion.agentRun.conversationId,
          runId: coreCompletion.agentRun.parentRunId,
        });
        await notifyMappedRunSummary({
          cwd,
          conversationId: coreCompletion.agentRun.conversationId,
          runId: coreCompletion.agentRun.parentRunId,
          summary: finalSynthesis?.content,
          sendRunSummary: dependencies.sendRunSummary,
        });
      } else if (persistedRun.status === "completed" || persistedRun.status === "failed") {
        await notifyMappedRunSummary({
          cwd,
          conversationId: persistedRun.conversationId,
          runId: persistedRun.id,
          summary: outcome.summary,
          sendRunSummary: dependencies.sendRunSummary,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    await applyRunOutcome({
      cwd,
      run: runningRun,
      outcome: {
        kind: "failed",
        summary: `Run execution failed before outcome persistence: ${runningRun.goal}`,
        message: `Pinchy could not finish this run because execution failed: ${errorMessage}`,
        error: errorMessage,
        sessionPath: runningRun.sessionPath,
      },
    });
    appendAuditEntry(cwd, {
      type: "worker_run_finished",
      runId: runningRun.id,
      conversationId: runningRun.conversationId,
      summary: `Run execution failed before outcome persistence: ${runningRun.goal}`,
      error: errorMessage,
      details: {
        executionMode: "queued",
        runKind: runningRun.kind,
        outcomeKind: "execution_error",
        runStatus: "failed",
        durationMs: Date.now() - startedAt,
      },
    });
    const updatedTask = updateTaskStatusByExecutionRunId(cwd, runningRun.id, "blocked");
    if (updatedTask?.conversationId) {
      appendOrchestrationUpdate(cwd, {
        conversationId: updatedTask.conversationId,
        runId: updatedTask.runId,
        intro: summarizeTaskStatus(updatedTask),
      });
    }
    throw error;
  } finally {
    clearRunContext(cwd);
  }
}

export async function processNextQueuedRun(cwd: string, dependencies: WorkerDependencies, options: { lane?: WorkerLane } = {}) {
  const run = claimNextQueuedRun(cwd, { lane: options.lane });
  if (!run) return undefined;
  return executeClaimedRun(cwd, run, dependencies);
}

export async function processAvailableQueuedRuns(cwd: string, dependencies: WorkerDependencies, options: { concurrency?: number; lane?: WorkerLane } = {}) {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
  const processed: Run[] = [];

  while (true) {
    const claimedRuns: Run[] = [];
    for (let index = 0; index < concurrency; index += 1) {
      const claimedRun = claimNextQueuedRun(cwd, { lane: options.lane });
      if (!claimedRun) break;
      claimedRuns.push(claimedRun);
    }

    if (claimedRuns.length === 0) {
      return processed;
    }

    const results = await Promise.allSettled(claimedRuns.map((run) => executeClaimedRun(cwd, run, dependencies)));
    processed.push(...results
      .filter((result): result is PromiseFulfilledResult<Run | undefined> => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((run): run is Run => Boolean(run)));

    if (claimedRuns.length < concurrency) {
      return processed;
    }
  }
}

function getNextResumableRun(cwd: string) {
  const waitingRuns = listRuns(cwd).filter((run) => run.status === "waiting_for_human");
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
  if (delivery.status !== "failed") {
    updateQuestionStatus(cwd, question.id, "waiting_for_human");
  }
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

  if (!resumable.run.sessionPath) {
    const errorMessage = `Cannot resume waiting run without sessionPath: ${resumable.run.id}`;
    const failedRun = await applyRunOutcome({
      cwd,
      run: resumable.run,
      outcome: {
        kind: "failed",
        summary: `Run resume failed before outcome persistence: ${resumable.run.goal}`,
        message: `Pinchy could not continue this run because its Pi session path is missing: ${resumable.run.id}`,
        error: errorMessage,
      },
    });
    appendAuditEntry(cwd, {
      type: "worker_run_finished",
      runId: resumable.run.id,
      conversationId: resumable.run.conversationId,
      summary: `Run resume failed before outcome persistence: ${resumable.run.goal}`,
      error: errorMessage,
      details: {
        executionMode: "resumed",
        runKind: resumable.run.kind,
        outcomeKind: "missing_session_path",
        runStatus: "failed",
        durationMs: 0,
      },
    });
    return failedRun;
  }

  const startedAt = Date.now();
  const runningRun = updateRunStatus(cwd, resumable.run.id, "running") ?? { ...resumable.run, status: "running" as const };
  setRunContext(cwd, {
    currentRunId: runningRun.id,
    currentRunLabel: runningRun.goal,
    currentConversationId: runningRun.conversationId,
    updatedAt: new Date().toISOString(),
  });
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
    const persistedRun = await applyRunOutcome({
      cwd,
      run: runningRun,
      outcome,
    });
    if (persistedRun?.id) {
      const updatedTask = updateTaskStatusByExecutionRunId(cwd, persistedRun.id, mapRunStatusToTaskStatus(persistedRun.status));
      const coreCompletion = await recordCoreCompletion(cwd, persistedRun.id, outcome);
      if (updatedTask?.conversationId) {
        const relayContent = buildMainThreadRelayContent({ task: updatedTask, outcome });
        if (relayContent) {
          appendDelegatedOutcomeRelay(cwd, {
            conversationId: updatedTask.conversationId,
            runId: updatedTask.runId,
            content: relayContent,
          });
        }
        appendOrchestrationUpdate(cwd, {
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId,
          intro: buildOrchestrationRelayIntro({ task: updatedTask, outcome }),
        });
        const finalSynthesis = await appendFinalThreadSynthesisIfReady(cwd, {
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId,
        });
        await notifyMappedRunSummary({
          cwd,
          conversationId: updatedTask.conversationId,
          runId: updatedTask.runId ?? persistedRun.id,
          summary: finalSynthesis?.content,
          sendRunSummary: dependencies.sendRunSummary,
        });
      } else if (coreCompletion?.agentRun.conversationId) {
        appendOrchestrationUpdate(cwd, {
          conversationId: coreCompletion.agentRun.conversationId,
          runId: coreCompletion.agentRun.parentRunId,
          intro: buildOrchestrationRelayIntro({
            task: {
              title: coreCompletion.task?.title ?? coreCompletion.agentRun.goal,
              status: coreCompletion.task?.status === "done" ? "done" : coreCompletion.task?.status === "failed" ? "blocked" : "running",
            },
            outcome,
          }),
        });
        const finalSynthesis = await appendFinalThreadSynthesisIfReady(cwd, {
          conversationId: coreCompletion.agentRun.conversationId,
          runId: coreCompletion.agentRun.parentRunId,
        });
        await notifyMappedRunSummary({
          cwd,
          conversationId: coreCompletion.agentRun.conversationId,
          runId: coreCompletion.agentRun.parentRunId,
          summary: finalSynthesis?.content,
          sendRunSummary: dependencies.sendRunSummary,
        });
      } else if (persistedRun.status === "completed" || persistedRun.status === "failed") {
        await notifyMappedRunSummary({
          cwd,
          conversationId: persistedRun.conversationId,
          runId: persistedRun.id,
          summary: outcome.summary,
          sendRunSummary: dependencies.sendRunSummary,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    await applyRunOutcome({
      cwd,
      run: runningRun,
      outcome: {
        kind: "failed",
        summary: `Run resume failed before outcome persistence: ${runningRun.goal}`,
        message: `Pinchy could not finish this run because execution failed: ${errorMessage}`,
        error: errorMessage,
        sessionPath: runningRun.sessionPath,
      },
    });
    appendAuditEntry(cwd, {
      type: "worker_run_finished",
      runId: runningRun.id,
      conversationId: runningRun.conversationId,
      summary: `Run resume failed before outcome persistence: ${runningRun.goal}`,
      error: errorMessage,
      details: {
        executionMode: "resumed",
        runKind: runningRun.kind,
        outcomeKind: "execution_error",
        runStatus: "failed",
        durationMs: Date.now() - startedAt,
      },
    });
    const updatedTask = updateTaskStatusByExecutionRunId(cwd, runningRun.id, "blocked");
    if (updatedTask?.conversationId) {
      appendOrchestrationUpdate(cwd, {
        conversationId: updatedTask.conversationId,
        runId: updatedTask.runId,
        intro: summarizeTaskStatus(updatedTask),
      });
    }
    throw error;
  } finally {
    clearRunContext(cwd);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function parseWorkerLoopConfig(env: NodeJS.ProcessEnv, cwd = process.cwd()) {
  return {
    cwd: env.PINCHY_CWD ?? cwd,
    once: env.PINCHY_WORKER_ONCE === "true",
    intervalMs: parsePositiveInteger(env.PINCHY_WORKER_INTERVAL_MS, 5000),
    concurrency: parsePositiveInteger(env.PINCHY_WORKER_CONCURRENCY, 2),
  };
}

const defaultPiRunExecutor = createPiRunExecutor();
const defaultQuestionDeliveryDispatcher = createQuestionDeliveryDispatcher();
const defaultDiscordNotifier = createDiscordNotifier();

async function defaultExecuteRun(run: Run): Promise<PiRunExecutionResult> {
  return defaultPiRunExecutor.executeRun({ cwd: process.env.PINCHY_CWD ?? process.cwd(), run });
}

async function defaultResumeRun(run: Run, reply: string): Promise<PiRunExecutionResult> {
  return defaultPiRunExecutor.resumeRun({ cwd: process.env.PINCHY_CWD ?? process.cwd(), run, reply });
}

async function defaultDispatchQuestion(cwd: string, question: Question): Promise<NotificationDelivery> {
  return defaultQuestionDeliveryDispatcher.dispatchQuestion(cwd, question);
}

async function defaultSendRunSummary(cwd: string, input: { conversationId: string; runId: string; summary: string; mappedOnly: boolean }) {
  return defaultDiscordNotifier.sendRunSummary(cwd, input);
}

async function runInteractiveLane(cwd: string, intervalMs: number, concurrency: number, once: boolean) {
  do {
    const resumed = await processNextResumableRun(cwd, { resumeRun: defaultResumeRun, sendRunSummary: defaultSendRunSummary });
    const delivered = resumed ? undefined : await processNextPendingQuestionDelivery(cwd, { dispatchQuestion: defaultDispatchQuestion });
    const processedRuns = resumed || delivered ? [] : await processAvailableQueuedRuns(cwd, { executeRun: defaultExecuteRun, sendRunSummary: defaultSendRunSummary }, { concurrency, lane: "interactive" });
    const processed = resumed ?? (delivered?.delivery.status === "failed" ? undefined : delivered) ?? processedRuns[0];
    if (once) return;
    if (!processed) await sleep(intervalMs);
  } while (true);
}

async function runBackgroundLane(cwd: string, intervalMs: number, concurrency: number, once: boolean) {
  do {
    const processedRuns = await processAvailableQueuedRuns(cwd, { executeRun: defaultExecuteRun, sendRunSummary: defaultSendRunSummary }, { concurrency, lane: "background" });
    const processed = processedRuns[0];
    if (once) return;
    if (!processed) await sleep(intervalMs);
  } while (true);
}

async function main() {
  const { cwd, once, intervalMs, concurrency } = parseWorkerLoopConfig(process.env);
  const interactiveConcurrency = Math.max(1, concurrency - 1);
  const backgroundConcurrency = Math.max(1, concurrency - interactiveConcurrency);

  if (once) {
    await runInteractiveLane(cwd, intervalMs, interactiveConcurrency, true);
    await runBackgroundLane(cwd, intervalMs, backgroundConcurrency, true);
    return;
  }

  await Promise.all([
    runInteractiveLane(cwd, intervalMs, interactiveConcurrency, false),
    runBackgroundLane(cwd, intervalMs, backgroundConcurrency, false),
  ]);
}

if (shouldRunAsCliEntry(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
