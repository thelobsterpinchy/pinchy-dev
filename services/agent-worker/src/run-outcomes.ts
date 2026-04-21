import type { NotificationChannel, QuestionPriority } from "../../../packages/shared/src/contracts.js";

export type CompletedRunOutcome = {
  kind: "completed";
  summary: string;
  message: string;
  piSessionPath?: string;
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
  piSessionPath?: string;
};

export type WaitingForApprovalRunOutcome = {
  kind: "waiting_for_approval";
  summary: string;
  message: string;
  blockedReason: string;
  piSessionPath?: string;
};

export type FailedRunOutcome = {
  kind: "failed";
  summary: string;
  message: string;
  error?: string;
  piSessionPath?: string;
};

export type RunOutcome = CompletedRunOutcome | WaitingForHumanRunOutcome | WaitingForApprovalRunOutcome | FailedRunOutcome;
export type PiRunExecutionResult = RunOutcome;

export type LegacyRunExecutionResult = {
  summary: string;
  message: string;
  piSessionPath?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCompletedMessage(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
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
      piSessionPath: fallback.piSessionPath,
    };
  }

  const kind = value.kind;
  const summary = readString(value.summary) ?? fallback.summary;
  const message = readString(value.message) ?? fallback.message;
  const piSessionPath = readString(value.piSessionPath) ?? fallback.piSessionPath;

  if (kind === "waiting_for_human") {
    const blockedReason = readString(value.blockedReason);
    const question = readQuestion(value.question);
    if (blockedReason && question) {
      return { kind, summary, message, blockedReason, question, piSessionPath };
    }
  }

  if (kind === "waiting_for_approval") {
    const blockedReason = readString(value.blockedReason);
    if (blockedReason) {
      return { kind, summary, message, blockedReason, piSessionPath };
    }
  }

  if (kind === "failed") {
    return {
      kind,
      summary,
      message,
      error: readString(value.error),
      piSessionPath,
    };
  }

  return {
    kind: "completed",
    summary,
    message,
    piSessionPath,
  };
}
