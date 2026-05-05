import type { Question } from "../../packages/shared/src/contracts.js";
import type { DiscordGatewayConfig } from "./config.js";
import type { DiscordGatewayApiClient } from "./api-client.js";
import { findDiscordThreadMapping, listDiscordThreadMappings, upsertDiscordThreadMapping } from "./thread-store.js";

export type DiscordGatewayMessage = {
  id: string;
  guildId?: string;
  channelId: string;
  threadId?: string;
  authorId: string;
  authorUsername?: string;
  content: string;
  mentionedUserIds?: string[];
  isBot?: boolean;
};

export type DiscordGatewayRuntime = {
  cwd: string;
  config: DiscordGatewayConfig;
  apiClient: DiscordGatewayApiClient;
  createThread(input: { channelId: string; messageId: string; name: string }): Promise<{ threadId: string }>;
  sendMessage?: (input: { channelId: string; content: string }) => Promise<{ id: string }>;
};

export type DiscordGatewayRouteResult =
  | { action: "ignored"; reason: string }
  | { action: "created_conversation"; conversationId: string; runId: string; threadId: string }
  | { action: "queued_run"; conversationId: string; runId: string; threadId: string }
  | { action: "answered_question"; conversationId: string; questionId: string; threadId: string };

const PENDING_QUESTION_STATUSES = new Set<Question["status"]>(["pending_delivery", "waiting_for_human"]);

function isAllowedIdentity(config: DiscordGatewayConfig, message: DiscordGatewayMessage) {
  if (!message.guildId || !config.allowedGuildIds.includes(message.guildId)) {
    return false;
  }
  if (config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(message.authorId)) {
    return false;
  }
  return true;
}

function mentionsPinchy(config: DiscordGatewayConfig, message: DiscordGatewayMessage) {
  if (config.botUserId && message.mentionedUserIds?.includes(config.botUserId)) {
    return true;
  }
  return /<@!?[^>]+>/.test(message.content);
}

function cleanPrompt(content: string) {
  return content.replace(/<@!?[^>]+>/g, "").trim();
}

function buildConversationTitle(content: string) {
  const cleaned = cleanPrompt(content).replace(/\s+/g, " ");
  if (!cleaned) return "Discord conversation";
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned;
}

function buildThreadName(content: string) {
  return buildConversationTitle(content).replace(/[^\w .-]/g, "").trim() || "Pinchy";
}

function buildRawPayload(message: DiscordGatewayMessage) {
  return {
    source: "discord",
    messageId: message.id,
    authorUsername: message.authorUsername,
    authorUserId: message.authorId,
    guildId: message.guildId,
    channelId: message.channelId,
    threadId: message.threadId,
  };
}

function findLatestPendingQuestion(questions: Question[]) {
  return [...questions]
    .filter((question) => PENDING_QUESTION_STATUSES.has(question.status))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

async function acknowledge(runtime: DiscordGatewayRuntime, channelId: string, content: string) {
  try {
    await runtime.sendMessage?.({ channelId, content });
  } catch (error) {
    console.error("[pinchy-discord] acknowledgement failed", error);
  }
}

export async function routeDiscordGatewayMessage(message: DiscordGatewayMessage, runtime: DiscordGatewayRuntime): Promise<DiscordGatewayRouteResult> {
  if (message.isBot) {
    return { action: "ignored", reason: "bot message" };
  }

  if (!isAllowedIdentity(runtime.config, message)) {
    return { action: "ignored", reason: "message is outside configured Discord allowlists" };
  }

  const prompt = cleanPrompt(message.content);
  if (!prompt) {
    return { action: "ignored", reason: "empty prompt" };
  }

  if (message.threadId) {
    const mapping = findDiscordThreadMapping(runtime.cwd, {
      guildId: message.guildId ?? "",
      channelId: message.channelId,
      threadId: message.threadId,
    }) ?? listDiscordThreadMappings(runtime.cwd).find((entry) => entry.guildId === message.guildId && entry.threadId === message.threadId);
    if (!mapping) {
      return { action: "ignored", reason: "thread is not mapped to a Pinchy conversation" };
    }

    const conversationState = await runtime.apiClient.fetchConversationState(mapping.conversationId);
    const pendingQuestion = findLatestPendingQuestion(conversationState.questions);
    if (pendingQuestion) {
      await runtime.apiClient.replyToQuestion({
        questionId: pendingQuestion.id,
        conversationId: mapping.conversationId,
        content: prompt,
        rawPayload: buildRawPayload(message),
      });
      await acknowledge(runtime, message.threadId, `Answered Pinchy question ${pendingQuestion.id}.`);
      return {
        action: "answered_question",
        conversationId: mapping.conversationId,
        questionId: pendingQuestion.id,
        threadId: message.threadId,
      };
    }

    await runtime.apiClient.appendMessage({
      conversationId: mapping.conversationId,
      role: "user",
      content: prompt,
    });
    const run = await runtime.apiClient.createRun({
      conversationId: mapping.conversationId,
      goal: prompt,
      kind: "user_prompt",
    });
    await acknowledge(runtime, message.threadId, `Queued Pinchy run ${run.id}.`);
    return {
      action: "queued_run",
      conversationId: mapping.conversationId,
      runId: run.id,
      threadId: message.threadId,
    };
  }

  if (!mentionsPinchy(runtime.config, message)) {
    return { action: "ignored", reason: "top-level message did not mention Pinchy" };
  }

  if (!runtime.config.allowedChannelIds.includes(message.channelId)) {
    return { action: "ignored", reason: "top-level channel is not allowed" };
  }

  const thread = await runtime.createThread({
    channelId: message.channelId,
    messageId: message.id,
    name: buildThreadName(message.content),
  });
  const conversation = await runtime.apiClient.createConversation({
    title: buildConversationTitle(message.content),
  });
  upsertDiscordThreadMapping(runtime.cwd, {
    guildId: message.guildId ?? "",
    channelId: message.channelId,
    threadId: thread.threadId,
    conversationId: conversation.id,
  });
  await runtime.apiClient.appendMessage({
    conversationId: conversation.id,
    role: "user",
    content: prompt,
  });
  const run = await runtime.apiClient.createRun({
    conversationId: conversation.id,
    goal: prompt,
    kind: "user_prompt",
  });
  await acknowledge(runtime, thread.threadId, `Queued Pinchy run ${run.id}.`);

  return {
    action: "created_conversation",
    conversationId: conversation.id,
    runId: run.id,
    threadId: thread.threadId,
  };
}
