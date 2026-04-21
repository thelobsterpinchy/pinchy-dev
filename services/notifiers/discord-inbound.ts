import type { NotificationChannel } from "../../packages/shared/src/contracts.js";

export class DiscordInboundNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordInboundNormalizationError";
  }
}

type DiscordInboundReplyPayload = {
  questionId?: unknown;
  conversationId?: unknown;
  content?: unknown;
  messageId?: unknown;
  authorUsername?: unknown;
  channelId?: unknown;
};

export type NormalizedDiscordInboundReply = {
  questionId: string;
  conversationId: string;
  channel: NotificationChannel;
  content: string;
  rawPayload: {
    source: "discord";
    messageId?: string;
    authorUsername?: string;
    channelId?: string;
  };
};

function requireTrimmedString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new DiscordInboundNormalizationError(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeDiscordInboundReply(payload: DiscordInboundReplyPayload): NormalizedDiscordInboundReply {
  return {
    questionId: requireTrimmedString(payload.questionId, "questionId"),
    conversationId: requireTrimmedString(payload.conversationId, "conversationId"),
    channel: "discord",
    content: requireTrimmedString(payload.content, "content"),
    rawPayload: {
      source: "discord",
      messageId: optionalTrimmedString(payload.messageId),
      authorUsername: optionalTrimmedString(payload.authorUsername),
      channelId: optionalTrimmedString(payload.channelId),
    },
  };
}
