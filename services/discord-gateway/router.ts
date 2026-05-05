import type { Question } from "../../packages/shared/src/contracts.js";
import type { DiscordGatewayConfig } from "./config.js";
import type { DiscordGatewayApiClient } from "./api-client.js";
import { findDiscordThreadMapping, listDiscordThreadMappings, upsertDiscordThreadMapping } from "./thread-store.js";
import { assessUserRequestTasks } from "../../apps/host/src/orchestration-policy.js";

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
  triggerTyping?: (input: { channelId: string }) => Promise<void>;
};

export type DiscordGatewayRouteResult =
  | { action: "ignored"; reason: string }
  | { action: "created_conversation"; conversationId: string; runId: string; threadId: string }
  | { action: "queued_run"; conversationId: string; runId: string; threadId: string }
  | { action: "answered_question"; conversationId: string; questionId: string; threadId: string }
  | { action: "reported_status"; conversationId: string; threadId: string }
  | { action: "reported_help"; conversationId: string; threadId: string };

const PENDING_QUESTION_STATUSES = new Set<Question["status"]>(["pending_delivery", "waiting_for_human"]);

function isAllowedIdentity(config: DiscordGatewayConfig, message: DiscordGatewayMessage) {
  if (message.guildId && config.allowedGuildIds.length > 0 && !config.allowedGuildIds.includes(message.guildId)) {
    return false;
  }
  if (config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(message.authorId)) {
    return false;
  }
  return true;
}

function isAllowedTopLevelChannel(config: DiscordGatewayConfig, channelId: string) {
  return config.allowedChannelIds.length === 0 || config.allowedChannelIds.includes(channelId);
}

function mentionsPinchy(config: DiscordGatewayConfig, message: DiscordGatewayMessage) {
  return Boolean(config.botUserId && message.mentionedUserIds?.includes(config.botUserId));
}

function isDirectMessage(message: DiscordGatewayMessage) {
  return !message.guildId;
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

function mappingGuildId(message: DiscordGatewayMessage) {
  return message.guildId ?? "";
}

function isDirectMessageMapping(mapping: { guildId: string }) {
  return mapping.guildId === "";
}

function shouldAcknowledgeQueuedWork(prompt: string) {
  return assessUserRequestTasks(prompt).requiresDelegation;
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

function isStatusCommand(prompt: string) {
  return /^(status|what'?s happening|where are we)\??$/i.test(prompt.trim());
}

function isHelpCommand(prompt: string) {
  return /^(help|\?|commands)\??$/i.test(prompt.trim());
}

function buildDiscordHelpMessage() {
  return [
    "Pinchy remote control",
    "",
    "- Reply with `status` to see what Pinchy is doing.",
    "- If Pinchy asks a question, your next normal reply will answer that question.",
    "- Otherwise, any normal reply queues a new objective in this same Discord conversation.",
    "- Open the dashboard for the full transcript, delegated agents, and cancel controls.",
  ].join("\n");
}

function buildDiscordStatusMessage(conversationState: Awaited<ReturnType<DiscordGatewayApiClient["fetchConversationState"]>>) {
  const pendingQuestion = findLatestPendingQuestion(conversationState.questions);
  const activeRun = [...conversationState.runs]
    .filter((run) => run.status === "queued" || run.status === "planning" || run.status === "running" || run.status === "waiting_for_human" || run.status === "waiting_for_approval")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  const latestCompletedRun = [...conversationState.runs]
    .filter((run) => run.status === "completed" || run.status === "failed" || run.status === "cancelled")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  if (pendingQuestion) {
    return [
      "Pinchy status",
      "",
      `Pinchy is waiting for your answer: ${pendingQuestion.prompt}`,
      activeRun ? `Run: ${activeRun.goal}` : undefined,
    ].filter(Boolean).join("\n");
  }

  if (activeRun) {
    return [
      "Pinchy status",
      "",
      `Pinchy is ${activeRun.status.replaceAll("_", " ")}: ${activeRun.goal}`,
      "Reply with a new instruction to steer or queue follow-up work.",
    ].join("\n");
  }

  if (latestCompletedRun) {
    return [
      "Pinchy status",
      "",
      `Latest run is ${latestCompletedRun.status}: ${latestCompletedRun.summary ?? latestCompletedRun.goal}`,
      "Reply with the next objective when you are ready.",
    ].join("\n");
  }

  return [
    "Pinchy status",
    "",
    "Pinchy is ready for the next objective in this thread.",
  ].join("\n");
}

async function acknowledge(runtime: DiscordGatewayRuntime, channelId: string, content: string) {
  try {
    await runtime.sendMessage?.({ channelId, content });
  } catch (error) {
    console.error("[pinchy-discord] acknowledgement failed", error);
  }
}

async function triggerTyping(runtime: DiscordGatewayRuntime, channelId: string) {
  try {
    await runtime.triggerTyping?.({ channelId });
  } catch (error) {
    console.error("[pinchy-discord] typing indicator failed", error);
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

  const guildId = mappingGuildId(message);
  const mappedThreadId = message.threadId
    ?? listDiscordThreadMappings(runtime.cwd).find((entry) => entry.guildId === guildId && entry.threadId === message.channelId)?.threadId;

  if (mappedThreadId) {
    const mapping = findDiscordThreadMapping(runtime.cwd, {
      guildId,
      channelId: message.channelId,
      threadId: mappedThreadId,
    }) ?? listDiscordThreadMappings(runtime.cwd).find((entry) => entry.guildId === guildId && entry.threadId === mappedThreadId);
    if (!mapping) {
      return { action: "ignored", reason: "thread is not mapped to a Pinchy conversation" };
    }

    if (isHelpCommand(prompt)) {
      await acknowledge(runtime, mappedThreadId, buildDiscordHelpMessage());
      return {
        action: "reported_help",
        conversationId: mapping.conversationId,
        threadId: mappedThreadId,
      };
    }

    const conversationState = await runtime.apiClient.fetchConversationState(mapping.conversationId);
    if (isStatusCommand(prompt)) {
      await acknowledge(runtime, mappedThreadId, buildDiscordStatusMessage(conversationState));
      return {
        action: "reported_status",
        conversationId: mapping.conversationId,
        threadId: mappedThreadId,
      };
    }

    const pendingQuestion = findLatestPendingQuestion(conversationState.questions);
    if (pendingQuestion) {
      await runtime.apiClient.replyToQuestion({
        questionId: pendingQuestion.id,
        conversationId: mapping.conversationId,
        content: prompt,
        rawPayload: buildRawPayload(message),
      });
      await acknowledge(runtime, mappedThreadId, `Answer received. Pinchy can continue run ${pendingQuestion.runId}.`);
      return {
        action: "answered_question",
        conversationId: mapping.conversationId,
        questionId: pendingQuestion.id,
        threadId: mappedThreadId,
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
    await triggerTyping(runtime, mappedThreadId);
    if (!isDirectMessageMapping(mapping) && shouldAcknowledgeQueuedWork(prompt)) {
      await acknowledge(runtime, mappedThreadId, `Queued the next Pinchy objective.\n\nRun: ${run.id}\nGoal: ${run.goal}`);
    }
    return {
      action: "queued_run",
      conversationId: mapping.conversationId,
      runId: run.id,
      threadId: mappedThreadId,
    };
  }

  if (isDirectMessage(message)) {
    const conversation = await runtime.apiClient.createConversation({
      title: buildConversationTitle(message.content),
    });
    upsertDiscordThreadMapping(runtime.cwd, {
      guildId,
      channelId: message.channelId,
      threadId: message.channelId,
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
    await triggerTyping(runtime, message.channelId);

    return {
      action: "created_conversation",
      conversationId: conversation.id,
      runId: run.id,
      threadId: message.channelId,
    };
  }

  if (!mentionsPinchy(runtime.config, message)) {
    return { action: "ignored", reason: "top-level message did not mention Pinchy" };
  }

  if (!isAllowedTopLevelChannel(runtime.config, message.channelId)) {
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
    guildId,
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
  await triggerTyping(runtime, thread.threadId);
  if (shouldAcknowledgeQueuedWork(prompt)) {
    await acknowledge(runtime, thread.threadId, [
      "Pinchy is on it.",
      "",
      `Run: ${run.id}`,
      `Goal: ${run.goal}`,
      "",
      "Reply in this thread to steer the work, answer questions, or queue the next objective. Reply with `status` any time.",
    ].join("\n"));
  }

  return {
    action: "created_conversation",
    conversationId: conversation.id,
    runId: run.id,
    threadId: thread.threadId,
  };
}
