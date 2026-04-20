import { appendMessage, listQuestions, listReplies, listRuns, updateRunStatus } from "../../../apps/host/src/agent-state-store.js";
import type { Run } from "../../../packages/shared/src/contracts.js";
import { createPiRunExecutor } from "./pi-run-executor.js";

type RunExecutionResult = {
  summary: string;
  message: string;
  piSessionPath?: string;
};

type WorkerDependencies = {
  executeRun: (run: Run) => Promise<RunExecutionResult>;
};

type ResumeDependencies = {
  resumeRun: (run: Run, reply: string) => Promise<RunExecutionResult>;
};

function getNextQueuedRun(cwd: string) {
  return listRuns(cwd)
    .filter((run) => run.status === "queued")
    .reverse()[0];
}

export async function processNextQueuedRun(cwd: string, dependencies: WorkerDependencies) {
  const run = getNextQueuedRun(cwd);
  if (!run) return undefined;

  updateRunStatus(cwd, run.id, "running");
  const result = await dependencies.executeRun({ ...run, status: "running" });
  const completed = updateRunStatus(cwd, run.id, "completed", { summary: result.summary, piSessionPath: result.piSessionPath });

  appendMessage(cwd, {
    conversationId: run.conversationId,
    role: "agent",
    content: result.message,
    runId: run.id,
  });

  return completed;
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

export async function processNextResumableRun(cwd: string, dependencies: ResumeDependencies) {
  const resumable = getNextResumableRun(cwd);
  if (!resumable) return undefined;

  updateRunStatus(cwd, resumable.run.id, "running");
  const result = await dependencies.resumeRun({ ...resumable.run, status: "running" }, resumable.reply);
  const completed = updateRunStatus(cwd, resumable.run.id, "completed", { summary: result.summary, piSessionPath: result.piSessionPath });

  appendMessage(cwd, {
    conversationId: resumable.run.conversationId,
    role: "agent",
    content: result.message,
    runId: resumable.run.id,
  });

  return completed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const defaultPiRunExecutor = createPiRunExecutor();

async function defaultExecuteRun(run: Run): Promise<RunExecutionResult> {
  return defaultPiRunExecutor.executeRun({ cwd: process.env.PINCHY_CWD ?? process.cwd(), run });
}

async function defaultResumeRun(run: Run, reply: string): Promise<RunExecutionResult> {
  return defaultPiRunExecutor.resumeRun({ cwd: process.env.PINCHY_CWD ?? process.cwd(), run, reply });
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  const once = process.env.PINCHY_WORKER_ONCE === "true";
  const intervalMs = Number(process.env.PINCHY_WORKER_INTERVAL_MS ?? 5000);

  do {
    const resumed = await processNextResumableRun(cwd, { resumeRun: defaultResumeRun });
    const processed = resumed ?? await processNextQueuedRun(cwd, { executeRun: defaultExecuteRun });
    if (once) return;
    if (!processed) await sleep(intervalMs);
  } while (true);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
