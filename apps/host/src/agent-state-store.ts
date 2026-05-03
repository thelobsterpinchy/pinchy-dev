import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadPinchyRuntimeConfig } from "./runtime-config.js";
import { buildRuntimeConfigSignature } from "./runtime-config-signature.js";
import { assessUserRequestTasks } from "./orchestration-policy.js";
import type {
  Conversation,
  ConversationStatus,
  HumanReply,
  Message,
  MessageKind,
  MessageRole,
  NotificationChannel,
  AgentGuidance,
  NotificationDelivery,
  NotificationDeliveryStatus,
  ConversationSessionBinding,
  Question,
  RunActivity,
  RunActivityKind,
  RunActivityStatus,
  QuestionPriority,
  QuestionStatus,
  Run,
  RunKind,
  RunStatus,
} from "../../../packages/shared/src/contracts.js";

type RunCancellationRequest = {
  runId: string;
  reason?: string;
  requestedAt: string;
};

const STATE_DIR = ".pinchy/state";
const CONVERSATIONS_FILE = "conversations.json";
const MESSAGES_FILE = "messages.json";
const RUNS_FILE = "runs.json";
const QUESTIONS_FILE = "questions.json";
const REPLIES_FILE = "replies.json";
const DELIVERIES_FILE = "deliveries.json";
const AGENT_GUIDANCES_FILE = "agent-guidances.json";
const CONVERSATION_SESSIONS_FILE = "conversation-sessions.json";
const RUN_ACTIVITIES_FILE = "run-activities.json";
const RUN_CANCELLATIONS_FILE = "run-cancellations.json";
const LOCK_RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 1000;

function getStateFilePath(cwd: string, fileName: string) {
  return resolve(cwd, STATE_DIR, fileName);
}

function loadCollection<T>(cwd: string, fileName: string): T[] {
  const path = getStateFilePath(cwd, fileName);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T[];
  } catch {
    return [];
  }
}

function saveCollection<T>(cwd: string, fileName: string, items: T[]) {
  const path = getStateFilePath(cwd, fileName);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(items, null, 2), "utf8");
}

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withStateFileLock<T>(cwd: string, fileName: string, fn: () => T): T {
  const lockPath = `${getStateFilePath(cwd, fileName)}.lock`;
  mkdirSync(dirname(lockPath), { recursive: true });
  const startedAt = Date.now();

  while (true) {
    try {
      mkdirSync(lockPath, { recursive: false });
      break;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }
      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for state lock: ${fileName}`);
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function listConversations(cwd: string) {
  const runs = loadCollection<Run>(cwd, RUNS_FILE);
  const questions = loadCollection<Question>(cwd, QUESTIONS_FILE);

  return loadCollection<Conversation>(cwd, CONVERSATIONS_FILE)
    .map((conversation) => {
      const conversationRuns = runs.filter((run) => run.conversationId === conversation.id);
      const pendingQuestionCount = questions.filter((question) => question.conversationId === conversation.id && (question.status === "pending_delivery" || question.status === "waiting_for_human")).length;
      const hasWaitingForHuman = pendingQuestionCount > 0 || conversationRuns.some((run) => run.status === "waiting_for_human");
      const hasWaitingForApproval = conversationRuns.some((run) => run.status === "waiting_for_approval");
      const hasActiveRun = conversationRuns.some((run) => run.status === "queued" || run.status === "running" || run.status === "waiting_for_human" || run.status === "waiting_for_approval");
      const attentionStatus = hasWaitingForHuman
        ? "needs_reply"
        : hasWaitingForApproval
          ? "needs_approval"
          : hasActiveRun
            ? "working"
            : "idle";
      return {
        ...conversation,
        pendingQuestionCount,
        hasActiveRun,
        attentionStatus,
      } satisfies Conversation;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createConversation(cwd: string, input: { title: string; status?: ConversationStatus }) {
  const conversations = loadCollection<Conversation>(cwd, CONVERSATIONS_FILE);
  const now = nowIso();
  const conversation: Conversation = {
    id: createId("conversation"),
    title: input.title,
    createdAt: now,
    updatedAt: now,
    status: input.status ?? "active",
  };
  saveCollection(cwd, CONVERSATIONS_FILE, [conversation, ...conversations]);
  return conversation;
}

export function deleteConversation(cwd: string, conversationId: string) {
  const conversations = loadCollection<Conversation>(cwd, CONVERSATIONS_FILE);
  const remainingConversations = conversations.filter((conversation) => conversation.id !== conversationId);
  if (remainingConversations.length === conversations.length) {
    return false;
  }

  const runs = loadCollection<Run>(cwd, RUNS_FILE);
  const removedRuns = runs.filter((run) => run.conversationId === conversationId);
  const removedRunIds = new Set(removedRuns.map((run) => run.id));
  const activeRemovedRunIds = new Set<string>();
  const questions = loadCollection<Question>(cwd, QUESTIONS_FILE);
  const removedQuestionIds = new Set(questions.filter((question) => question.conversationId === conversationId).map((question) => question.id));
  const runCancellationRequests = loadCollection<RunCancellationRequest>(cwd, RUN_CANCELLATIONS_FILE)
    .filter((request) => !removedRunIds.has(request.runId));

  for (const run of removedRuns) {
    if (["completed", "failed", "cancelled"].includes(run.status)) {
      continue;
    }
    activeRemovedRunIds.add(run.id);
    runCancellationRequests.push({
      runId: run.id,
      reason: "Conversation deleted",
      requestedAt: nowIso(),
    });
  }

  saveCollection(cwd, CONVERSATIONS_FILE, remainingConversations);
  saveCollection(cwd, MESSAGES_FILE, loadCollection<Message>(cwd, MESSAGES_FILE).filter((message) => message.conversationId !== conversationId));
  saveCollection(cwd, RUNS_FILE, runs.filter((run) => run.conversationId !== conversationId));
  saveCollection(cwd, QUESTIONS_FILE, questions.filter((question) => question.conversationId !== conversationId));
  saveCollection(cwd, REPLIES_FILE, loadCollection<HumanReply>(cwd, REPLIES_FILE).filter((reply) => !removedQuestionIds.has(reply.questionId) && reply.conversationId !== conversationId));
  saveCollection(cwd, DELIVERIES_FILE, loadCollection<NotificationDelivery>(cwd, DELIVERIES_FILE).filter((delivery) => !removedQuestionIds.has(delivery.questionId ?? "") && !removedRunIds.has(delivery.runId ?? "")));
  saveCollection(cwd, AGENT_GUIDANCES_FILE, loadCollection<AgentGuidance>(cwd, AGENT_GUIDANCES_FILE).filter((guidance) => guidance.conversationId !== conversationId));
  saveCollection(cwd, CONVERSATION_SESSIONS_FILE, loadCollection<ConversationSessionBinding>(cwd, CONVERSATION_SESSIONS_FILE).filter((entry) => entry.conversationId !== conversationId));
  saveCollection(cwd, RUN_ACTIVITIES_FILE, loadCollection<RunActivity>(cwd, RUN_ACTIVITIES_FILE).filter((activity) => activity.conversationId !== conversationId));
  saveCollection(cwd, RUN_CANCELLATIONS_FILE, runCancellationRequests);
  return true;
}

export function appendMessage(cwd: string, input: { conversationId: string; role: MessageRole; content: string; runId?: string; kind?: MessageKind }) {
  if (!hasConversation(cwd, input.conversationId)) {
    return undefined;
  }
  const run = input.runId ? getRunById(cwd, input.runId) : undefined;
  if (input.runId && (!run || run.conversationId !== input.conversationId)) {
    return undefined;
  }
  const messages = loadCollection<Message>(cwd, MESSAGES_FILE);
  const message: Message = {
    id: createId("message"),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    createdAt: nowIso(),
    runId: input.runId,
    kind: input.kind,
  };
  saveCollection(cwd, MESSAGES_FILE, [...messages, message]);
  touchConversation(cwd, input.conversationId);
  return message;
}

export function listMessages(cwd: string, conversationId: string) {
  return loadCollection<Message>(cwd, MESSAGES_FILE)
    .filter((message) => message.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createRun(cwd: string, input: { conversationId: string; goal: string; kind?: RunKind; status?: RunStatus; runtimeConfigSignature?: string }) {
  const runs = loadCollection<Run>(cwd, RUNS_FILE);
  const now = nowIso();
  const runtimeConfigSignature = input.runtimeConfigSignature ?? buildRuntimeConfigSignature(loadPinchyRuntimeConfig(cwd));
  const sessionBinding = getConversationSessionBinding(cwd, input.conversationId);
  const kind = input.kind ?? "user_prompt";
  const canSeedConversationSession = kind !== "user_prompt"
    || assessUserRequestTasks(input.goal).requiresDelegation;
  const run: Run = {
    id: createId("run"),
    conversationId: input.conversationId,
    goal: input.goal,
    kind,
    status: input.status ?? "queued",
    createdAt: now,
    updatedAt: now,
    piSessionPath: canSeedConversationSession && sessionBinding?.runtimeConfigSignature === runtimeConfigSignature
      ? sessionBinding.piSessionPath
      : undefined,
    runtimeConfigSignature,
  };
  saveCollection(cwd, RUNS_FILE, [run, ...runs]);
  touchConversation(cwd, input.conversationId, { latestRunId: run.id });
  return run;
}

export function listRuns(cwd: string, conversationId?: string) {
  return loadCollection<Run>(cwd, RUNS_FILE)
    .filter((run) => !conversationId || run.conversationId === conversationId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getRunById(cwd: string, runId: string) {
  return loadCollection<Run>(cwd, RUNS_FILE).find((run) => run.id === runId);
}

export type WorkerLane = "interactive" | "background";

function isInteractiveRunKind(kind: RunKind) {
  return kind === "user_prompt" || kind === "resume_reply";
}

function matchesWorkerLane(run: Run, lane?: WorkerLane) {
  if (!lane) return true;
  return lane === "interactive" ? isInteractiveRunKind(run.kind) : !isInteractiveRunKind(run.kind);
}

export function claimNextQueuedRun(cwd: string, options: { lane?: WorkerLane } = {}) {
  return withStateFileLock(cwd, RUNS_FILE, () => {
    const runs = loadCollection<Run>(cwd, RUNS_FILE);
    const nextQueuedRun = [...runs].reverse().find((run) => run.status === "queued" && matchesWorkerLane(run, options.lane));

    if (!nextQueuedRun) {
      return undefined;
    }

    const now = nowIso();
    nextQueuedRun.status = "running";
    nextQueuedRun.updatedAt = now;
    nextQueuedRun.startedAt = nextQueuedRun.startedAt ?? now;
    saveCollection(cwd, RUNS_FILE, runs);
    touchConversation(cwd, nextQueuedRun.conversationId, { latestRunId: nextQueuedRun.id });
    return { ...nextQueuedRun };
  });
}

export function updateRunStatus(cwd: string, runId: string, status: RunStatus, patch: Partial<Pick<Run, "blockedReason" | "summary" | "startedAt" | "completedAt" | "piSessionPath" | "runtimeConfigSignature">> = {}) {
  const runs = loadCollection<Run>(cwd, RUNS_FILE);
  const match = runs.find((run) => run.id === runId);
  if (!match) return undefined;
  const now = nowIso();
  match.status = status;
  match.updatedAt = now;
  if (status === "running" && !match.startedAt) {
    match.startedAt = patch.startedAt ?? now;
  }
  if (["completed", "failed", "cancelled"].includes(status)) {
    match.completedAt = patch.completedAt ?? now;
  }
  match.blockedReason = patch.blockedReason ?? match.blockedReason;
  match.summary = patch.summary ?? match.summary;
  match.piSessionPath = patch.piSessionPath ?? match.piSessionPath;
  match.runtimeConfigSignature = patch.runtimeConfigSignature ?? match.runtimeConfigSignature;
  saveCollection(cwd, RUNS_FILE, runs);
  if (match.piSessionPath) {
    setConversationSessionBinding(cwd, {
      conversationId: match.conversationId,
      piSessionPath: match.piSessionPath,
      sourceRunId: match.id,
      runtimeConfigSignature: match.runtimeConfigSignature,
    });
  }
  touchConversation(cwd, match.conversationId, { latestRunId: match.id });
  return match;
}

export function createQuestion(cwd: string, input: {
  conversationId: string;
  runId: string;
  prompt: string;
  priority: QuestionPriority;
  channelHints?: NotificationChannel[];
}) {
  const questions = loadCollection<Question>(cwd, QUESTIONS_FILE);
  const question: Question = {
    id: createId("question"),
    conversationId: input.conversationId,
    runId: input.runId,
    prompt: input.prompt,
    priority: input.priority,
    channelHints: input.channelHints,
    createdAt: nowIso(),
    status: "pending_delivery",
  };
  saveCollection(cwd, QUESTIONS_FILE, [question, ...questions]);
  touchConversation(cwd, input.conversationId, { latestRunId: input.runId });
  return question;
}

export function listQuestions(cwd: string, conversationId?: string) {
  return loadCollection<Question>(cwd, QUESTIONS_FILE)
    .filter((question) => !conversationId || question.conversationId === conversationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getQuestionById(cwd: string, questionId: string) {
  return loadCollection<Question>(cwd, QUESTIONS_FILE).find((question) => question.id === questionId);
}

export function updateQuestionStatus(cwd: string, questionId: string, status: QuestionStatus) {
  const questions = loadCollection<Question>(cwd, QUESTIONS_FILE);
  const match = questions.find((question) => question.id === questionId);
  if (!match) return undefined;
  match.status = status;
  if (status === "answered") {
    match.resolvedAt = nowIso();
  }
  saveCollection(cwd, QUESTIONS_FILE, questions);
  touchConversation(cwd, match.conversationId, { latestRunId: match.runId });
  return match;
}

export function markQuestionAnswered(cwd: string, questionId: string) {
  return updateQuestionStatus(cwd, questionId, "answered");
}

export function createHumanReply(cwd: string, input: {
  questionId: string;
  conversationId: string;
  channel: NotificationChannel;
  content: string;
  rawPayload?: unknown;
}) {
  const replies = loadCollection<HumanReply>(cwd, REPLIES_FILE);
  const reply: HumanReply = {
    id: createId("reply"),
    questionId: input.questionId,
    conversationId: input.conversationId,
    channel: input.channel,
    content: input.content,
    receivedAt: nowIso(),
    rawPayload: input.rawPayload,
  };
  saveCollection(cwd, REPLIES_FILE, [reply, ...replies]);
  touchConversation(cwd, input.conversationId);
  return reply;
}

export function listReplies(cwd: string, questionId?: string) {
  return loadCollection<HumanReply>(cwd, REPLIES_FILE)
    .filter((reply) => !questionId || reply.questionId === questionId)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

export function appendRunActivity(cwd: string, input: {
  conversationId: string;
  runId: string;
  kind: RunActivityKind;
  status: RunActivityStatus;
  label: string;
  toolName?: string;
  details?: string[];
}) {
  const activities = loadCollection<RunActivity>(cwd, RUN_ACTIVITIES_FILE);
  const activity: RunActivity = {
    id: createId("activity"),
    conversationId: input.conversationId,
    runId: input.runId,
    kind: input.kind,
    status: input.status,
    label: input.label,
    toolName: input.toolName,
    details: input.details ?? [],
    createdAt: nowIso(),
  };
  saveCollection(cwd, RUN_ACTIVITIES_FILE, [activity, ...activities]);
  touchConversation(cwd, input.conversationId, { latestRunId: input.runId });
  return activity;
}

export function listRunActivities(cwd: string, filter: { conversationId?: string; runId?: string } = {}) {
  return loadCollection<RunActivity>(cwd, RUN_ACTIVITIES_FILE)
    .filter((activity) => !filter.conversationId || activity.conversationId === filter.conversationId)
    .filter((activity) => !filter.runId || activity.runId === filter.runId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function listConversationSessions(cwd: string) {
  return loadCollection<ConversationSessionBinding>(cwd, CONVERSATION_SESSIONS_FILE)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getConversationSessionBinding(cwd: string, conversationId: string) {
  return listConversationSessions(cwd).find((entry) => entry.conversationId === conversationId);
}

export function setConversationSessionBinding(cwd: string, input: { conversationId: string; piSessionPath: string; sourceRunId?: string; runtimeConfigSignature?: string }) {
  const sessions = loadCollection<ConversationSessionBinding>(cwd, CONVERSATION_SESSIONS_FILE);
  const now = nowIso();
  const existing = sessions.find((entry) => entry.conversationId === input.conversationId);
  if (existing) {
    existing.piSessionPath = input.piSessionPath;
    existing.sourceRunId = input.sourceRunId;
    existing.runtimeConfigSignature = input.runtimeConfigSignature;
    existing.updatedAt = now;
  } else {
    sessions.push({
      conversationId: input.conversationId,
      piSessionPath: input.piSessionPath,
      sourceRunId: input.sourceRunId,
      runtimeConfigSignature: input.runtimeConfigSignature,
      updatedAt: now,
    });
  }
  saveCollection(cwd, CONVERSATION_SESSIONS_FILE, sessions);
  return getConversationSessionBinding(cwd, input.conversationId);
}

export function createAgentGuidance(cwd: string, input: { conversationId: string; taskId: string; runId?: string; content: string }) {
  const guidances = loadCollection<AgentGuidance>(cwd, AGENT_GUIDANCES_FILE);
  const guidance: AgentGuidance = {
    id: createId("guidance"),
    conversationId: input.conversationId,
    taskId: input.taskId,
    runId: input.runId,
    content: input.content,
    status: "pending",
    createdAt: nowIso(),
  };
  saveCollection(cwd, AGENT_GUIDANCES_FILE, [guidance, ...guidances]);
  touchConversation(cwd, input.conversationId, { latestRunId: input.runId });
  return guidance;
}

export function listAgentGuidances(cwd: string, filter: { conversationId?: string; taskId?: string; runId?: string; status?: AgentGuidance["status"] } = {}) {
  return loadCollection<AgentGuidance>(cwd, AGENT_GUIDANCES_FILE)
    .filter((guidance) => !filter.conversationId || guidance.conversationId === filter.conversationId)
    .filter((guidance) => !filter.taskId || guidance.taskId === filter.taskId)
    .filter((guidance) => !filter.runId || guidance.runId === filter.runId)
    .filter((guidance) => !filter.status || guidance.status === filter.status)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function markAgentGuidanceApplied(cwd: string, guidanceId: string) {
  const guidances = loadCollection<AgentGuidance>(cwd, AGENT_GUIDANCES_FILE);
  const match = guidances.find((guidance) => guidance.id === guidanceId);
  if (!match) return undefined;
  match.status = "applied";
  match.appliedAt = nowIso();
  saveCollection(cwd, AGENT_GUIDANCES_FILE, guidances);
  touchConversation(cwd, match.conversationId, { latestRunId: match.runId });
  return match;
}

export function createNotificationDelivery(cwd: string, input: {
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  questionId?: string;
  runId?: string;
  externalId?: string;
  error?: string;
}) {
  const deliveries = loadCollection<NotificationDelivery>(cwd, DELIVERIES_FILE);
  const now = nowIso();
  const delivery: NotificationDelivery = {
    id: createId("delivery"),
    channel: input.channel,
    status: input.status,
    questionId: input.questionId,
    runId: input.runId,
    externalId: input.externalId,
    error: input.error,
    sentAt: input.status === "sent" ? now : undefined,
    deliveredAt: input.status === "delivered" ? now : undefined,
    failedAt: input.status === "failed" ? now : undefined,
  };
  saveCollection(cwd, DELIVERIES_FILE, [delivery, ...deliveries]);
  return delivery;
}

export function listNotificationDeliveries(cwd: string, filter: { questionId?: string; runId?: string; channel?: NotificationChannel } = {}) {
  return loadCollection<NotificationDelivery>(cwd, DELIVERIES_FILE)
    .filter((delivery) => !filter.questionId || delivery.questionId === filter.questionId)
    .filter((delivery) => !filter.runId || delivery.runId === filter.runId)
    .filter((delivery) => !filter.channel || delivery.channel === filter.channel)
    .sort((a, b) => {
      const left = b.sentAt ?? b.deliveredAt ?? b.failedAt ?? "";
      const right = a.sentAt ?? a.deliveredAt ?? a.failedAt ?? "";
      return left.localeCompare(right);
    });
}

export function requestRunCancellation(cwd: string, runId: string, reason?: string) {
  const requests = loadCollection<RunCancellationRequest>(cwd, RUN_CANCELLATIONS_FILE);
  const existing = requests.find((request) => request.runId === runId);
  if (existing) {
    existing.reason = reason ?? existing.reason;
    existing.requestedAt = nowIso();
  } else {
    requests.push({ runId, reason, requestedAt: nowIso() });
  }
  saveCollection(cwd, RUN_CANCELLATIONS_FILE, requests);
  return requests.find((request) => request.runId === runId);
}

export function listRunCancellationRequests(cwd: string) {
  return loadCollection<RunCancellationRequest>(cwd, RUN_CANCELLATIONS_FILE)
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
}

export function hasRunCancellationRequest(cwd: string, runId: string) {
  return listRunCancellationRequests(cwd).some((request) => request.runId === runId);
}

export function clearRunCancellationRequest(cwd: string, runId: string) {
  const requests = loadCollection<RunCancellationRequest>(cwd, RUN_CANCELLATIONS_FILE);
  const remainingRequests = requests.filter((request) => request.runId !== runId);
  if (remainingRequests.length === requests.length) {
    return false;
  }
  saveCollection(cwd, RUN_CANCELLATIONS_FILE, remainingRequests);
  return true;
}

export function hasConversation(cwd: string, conversationId: string) {
  return loadCollection<Conversation>(cwd, CONVERSATIONS_FILE).some((conversation) => conversation.id === conversationId);
}

function touchConversation(cwd: string, conversationId: string, patch: Partial<Pick<Conversation, "latestRunId">> = {}) {
  const conversations = loadCollection<Conversation>(cwd, CONVERSATIONS_FILE);
  const match = conversations.find((conversation) => conversation.id === conversationId);
  if (!match) return;
  match.updatedAt = nowIso();
  if (patch.latestRunId) match.latestRunId = patch.latestRunId;
  saveCollection(cwd, CONVERSATIONS_FILE, conversations);
}

export function getAgentStateDirectory(cwd: string) {
  return join(cwd, STATE_DIR);
}
