import { createNotificationDelivery } from "../../apps/host/src/agent-state-store.js";
import { loadDiscordGatewayConfig } from "../discord-gateway/config.js";
import { createDiscordRestClient } from "../discord-gateway/discord-rest.js";
import { listDiscordThreadMappings } from "../discord-gateway/thread-store.js";

type PostJson = (url: string, body: unknown) => Promise<void>;

type DiscordNotifierDependencies = {
  webhookUrl?: string;
  botToken?: string;
  sendBotMessage?: (input: { channelId: string; content: string }) => Promise<{ id: string }>;
  postJson?: PostJson;
  fetchImpl?: typeof fetch;
  webhookTimeoutMs?: number;
};

async function defaultPostJson(url: string, body: unknown, input: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1, Math.floor(input.timeoutMs ?? 10_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Discord webhook timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
  }
}

export function createDiscordNotifier(dependencies: DiscordNotifierDependencies = {}) {
  const webhookUrl = dependencies.webhookUrl ?? process.env.PINCHY_DISCORD_WEBHOOK_URL;
  const gatewayConfig = loadDiscordGatewayConfig();
  const botToken = dependencies.botToken ?? gatewayConfig.botToken;
  const postJson = dependencies.postJson ?? ((url, body) => defaultPostJson(url, body, {
    fetchImpl: dependencies.fetchImpl,
    timeoutMs: dependencies.webhookTimeoutMs,
  }));
  const restClient = botToken ? createDiscordRestClient({ token: botToken }) : undefined;
  const sendBotMessage = dependencies.sendBotMessage ?? restClient?.sendMessage;

  async function send(cwd: string, input: { questionId?: string; runId?: string; content: string }) {
    if (!webhookUrl) {
      return createNotificationDelivery(cwd, {
        channel: "discord",
        status: "failed",
        questionId: input.questionId,
        runId: input.runId,
        error: "PINCHY_DISCORD_WEBHOOK_URL is not configured",
      });
    }

    try {
      await postJson(webhookUrl, { content: input.content });
      return createNotificationDelivery(cwd, {
        channel: "discord",
        status: "sent",
        questionId: input.questionId,
        runId: input.runId,
      });
    } catch (error) {
      return createNotificationDelivery(cwd, {
        channel: "discord",
        status: "failed",
        questionId: input.questionId,
        runId: input.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    async sendQuestion(cwd: string, input: { questionId: string; runId: string; conversationId?: string; prompt: string; conversationTitle?: string }) {
      const header = input.conversationTitle ? `Pinchy question for ${input.conversationTitle}` : "Pinchy question";
      const content = [
        header,
        input.prompt,
        `Question ID: ${input.questionId}`,
        `Run ID: ${input.runId}`,
      ].join("\n\n");
      const mappedThread = input.conversationId
        ? listDiscordThreadMappings(cwd).find((mapping) => mapping.conversationId === input.conversationId)
        : undefined;

      if (sendBotMessage && mappedThread) {
        try {
          const message = await sendBotMessage({ channelId: mappedThread.threadId, content });
          return createNotificationDelivery(cwd, {
            channel: "discord",
            status: "sent",
            questionId: input.questionId,
            runId: input.runId,
            externalId: message.id,
          });
        } catch (error) {
          return createNotificationDelivery(cwd, {
            channel: "discord",
            status: "failed",
            questionId: input.questionId,
            runId: input.runId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return send(cwd, {
        questionId: input.questionId,
        runId: input.runId,
        content,
      });
    },
    async sendRunSummary(cwd: string, input: { runId: string; summary: string; conversationId?: string; mappedOnly?: boolean }) {
      const mappedThread = input.conversationId
        ? listDiscordThreadMappings(cwd).find((mapping) => mapping.conversationId === input.conversationId)
        : undefined;
      const content = input.summary;

      if (sendBotMessage && mappedThread) {
        try {
          const message = await sendBotMessage({ channelId: mappedThread.threadId, content });
          return createNotificationDelivery(cwd, {
            channel: "discord",
            status: "sent",
            runId: input.runId,
            externalId: message.id,
          });
        } catch (error) {
          return createNotificationDelivery(cwd, {
            channel: "discord",
            status: "failed",
            runId: input.runId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (input.mappedOnly) {
        return undefined;
      }

      return send(cwd, {
        runId: input.runId,
        content,
      });
    },
  };
}
