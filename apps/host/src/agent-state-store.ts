import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  Conversation,
  ConversationStatus,
  HumanReply,
  Message,
  MessageRole,
  NotificationChannel,
  NotificationDelivery,
  NotificationDeliveryStatus,
  Question,
  QuestionPriority,
  QuestionStatus,
  Run,
  RunKind,
  RunStatus,
} from "../../../packages/shared/src/contracts.js";

const STATE_DIR = ".pinchy/state";
const CONVERSATIONS_FILE = "conversations.json";
const MESSAGES_FILE = "messages.json";
const RUNS_FILE = "runs.json";
const QUESTIONS_FILE = "questions.json";
const REPLIES_FILE = "replies.json";
const DELIVERIES_FILE = "deliveries.json";

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

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function listConversations(cwd: string) {
  return loadCollection<Conversation>(cwd, CONVERSATIONS_FILE).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  const removedRunIds = new Set(runs.filter((run) => run.conversationId === conversationId).map((run) => run.id));
  const questions = loadCollection<Question>(cwd, QUESTIONS_FILE);
  const removedQuestionIds = new Set(questions.filter((question) => question.conversationId === conversationId).map((question) => question.id));

  saveCollection(cwd, CONVERSATIONS_FILE, remainingConversations);
  saveCollection(cwd, MESSAGES_FILE, loadCollection<Message>(cwd, MESSAGES_FILE).filter((message) => message.conversationId !== conversationId));
  saveCollection(cwd, RUNS_FILE, runs.filter((run) => run.conversationId !== conversationId));
  saveCollection(cwd, QUESTIONS_FILE, questions.filter((question) => question.conversationId !== conversationId));
  saveCollection(cwd, REPLIES_FILE, loadCollection<HumanReply>(cwd, REPLIES_FILE).filter((reply) => !removedQuestionIds.has(reply.questionId) && reply.conversationId !== conversationId));
  saveCollection(cwd, DELIVERIES_FILE, loadCollection<NotificationDelivery>(cwd, DELIVERIES_FILE).filter((delivery) => !removedQuestionIds.has(delivery.questionId ?? "") && !removedRunIds.has(delivery.runId ?? "")));
  return true;
}

export function appendMessage(cwd: string, input: { conversationId: string; role: MessageRole; content: string; runId?: string }) {
  const messages = loadCollection<Message>(cwd, MESSAGES_FILE);
  const message: Message = {
    id: createId("message"),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    createdAt: nowIso(),
    runId: input.runId,
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

export function createRun(cwd: string, input: { conversationId: string; goal: string; kind?: RunKind; status?: RunStatus }) {
  const runs = loadCollection<Run>(cwd, RUNS_FILE);
  const now = nowIso();
  const run: Run = {
    id: createId("run"),
    conversationId: input.conversationId,
    goal: input.goal,
    kind: input.kind ?? "user_prompt",
    status: input.status ?? "queued",
    createdAt: now,
    updatedAt: now,
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

export function updateRunStatus(cwd: string, runId: string, status: RunStatus, patch: Partial<Pick<Run, "blockedReason" | "summary" | "startedAt" | "completedAt" | "piSessionPath">> = {}) {
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
  saveCollection(cwd, RUNS_FILE, runs);
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
