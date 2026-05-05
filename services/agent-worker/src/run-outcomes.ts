import type { NotificationChannel, QuestionPriority } from "../../../packages/shared/src/contracts.js";

export type CompletedRunOutcome = {
  kind: "completed";
  summary: string;
  message: string;
  sessionPath?: string;
};

export type WaitingForHumanRunOutcome = {
  kind: "waiting_for_human";
  summary: string;
  message: string;
  blockedReason: string;
  question: {
    prompt: string;
    priority?: QuestionPriority;
    channelHints?: NotificationChannel[];
  };
  sessionPath?: string;
};

export type WaitingForApprovalRunOutcome = {
  kind: "waiting_for_approval";
  summary: string;
  message: string;
  blockedReason: string;
  sessionPath?: string;
};

export type FailedRunOutcome = {
  kind: "failed";
  summary: string;
  message: string;
  error?: string;
  sessionPath?: string;
};

export type RunOutcome = CompletedRunOutcome | WaitingForHumanRunOutcome | WaitingForApprovalRunOutcome | FailedRunOutcome;
export type PiRunExecutionResult = RunOutcome;

export type LegacyRunExecutionResult = {
  summary: string;
  message: string;
  sessionPath?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collapseExactRepeatedText(value: string) {
  const text = value.trim();
  for (let size = 1; size <= Math.floor(text.length / 2); size += 1) {
    if (text.length % size !== 0) continue;
    const chunk = text.slice(0, size);
    if (chunk.repeat(text.length / size) === text) {
      return chunk;
    }
  }
  return text;
}

function collapseAdjacentDuplicateChunks(value: string) {
  let text = collapseExactRepeatedText(value);
  let changed = true;

  while (changed) {
    changed = false;
    outer: for (let size = Math.floor(text.length / 2); size >= 8; size -= 1) {
      for (let start = 0; start + (size * 2) <= text.length; start += 1) {
        const chunk = text.slice(start, start + size);
        if (!chunk.trim()) continue;
        if (chunk === text.slice(start + size, start + (size * 2))) {
          text = `${text.slice(0, start + size)}${text.slice(start + (size * 2))}`;
          changed = true;
          break outer;
        }
      }
    }
  }

  return text;
}

function normalizeAssistantMessageText(value: string | undefined, fallback?: string) {
  const candidate = typeof value === "string" && value.trim() ? value : fallback;
  if (!candidate) return candidate;
  return collapseAdjacentDuplicateChunks(candidate);
}

function readCompletedMessage(value: unknown, fallback: string) {
  return normalizeAssistantMessageText(typeof value === "string" ? value : undefined, fallback) ?? fallback;
}

function readString(value: unknown) {
  return typeof value === "string" ? normalizeAssistantMessageText(value) : undefined;
}

function readChannelHints(value: unknown): NotificationChannel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is NotificationChannel => entry === "discord" || entry === "imessage" || entry === "pinchy-app" || entry === "dashboard");
}

function readQuestion(value: unknown): WaitingForHumanRunOutcome["question"] | undefined {
  if (!isObject(value)) return undefined;
  const prompt = readString(value.prompt);
  if (!prompt) return undefined;
  const priority = value.priority === "low" || value.priority === "normal" || value.priority === "high" || value.priority === "urgent"
    ? value.priority
    : undefined;
  return {
    prompt,
    priority,
    channelHints: readChannelHints(value.channelHints),
  };
}

export function normalizeRunOutcome(value: unknown, fallback: LegacyRunExecutionResult): RunOutcome {
  if (!isObject(value)) {
    return {
      kind: "completed",
      summary: fallback.summary,
      message: readCompletedMessage(value, fallback.message),
      sessionPath: fallback.sessionPath,
    };
  }

  const kind = value.kind;
  const summary = readString(value.summary) ?? fallback.summary;
  const message = readString(value.message) ?? fallback.message;
  const sessionPath = readString(value.sessionPath) ?? fallback.sessionPath;

  if (kind === "waiting_for_human") {
    const blockedReason = readString(value.blockedReason);
    const question = readQuestion(value.question);
    if (blockedReason && question) {
      return { kind, summary, message, blockedReason, question, sessionPath };
    }
  }

  if (kind === "waiting_for_approval") {
    const blockedReason = readString(value.blockedReason);
    if (blockedReason) {
      return { kind, summary, message, blockedReason, sessionPath };
    }
  }

  if (kind === "failed") {
    return {
      kind,
      summary,
      message,
      error: readString(value.error),
      sessionPath,
    };
  }

  return {
    kind: "completed",
    summary,
    message,
    sessionPath,
  };
}
