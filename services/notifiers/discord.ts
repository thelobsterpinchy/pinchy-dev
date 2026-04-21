import { createNotificationDelivery } from "../../apps/host/src/agent-state-store.js";

type PostJson = (url: string, body: unknown) => Promise<void>;

type DiscordNotifierDependencies = {
  webhookUrl?: string;
  postJson?: PostJson;
};

function defaultPostJson(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }
  });
}

export function createDiscordNotifier(dependencies: DiscordNotifierDependencies = {}) {
  const webhookUrl = dependencies.webhookUrl ?? process.env.PINCHY_DISCORD_WEBHOOK_URL;
  const postJson = dependencies.postJson ?? defaultPostJson;

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
    async sendQuestion(cwd: string, input: { questionId: string; runId: string; prompt: string; conversationTitle?: string }) {
      const header = input.conversationTitle ? `Pinchy question for ${input.conversationTitle}` : "Pinchy question";
      return send(cwd, {
        questionId: input.questionId,
        runId: input.runId,
        content: [
          header,
          input.prompt,
          `Question ID: ${input.questionId}`,
          `Run ID: ${input.runId}`,
        ].join("\n\n"),
      });
    },
    async sendRunSummary(cwd: string, input: { runId: string; summary: string }) {
      return send(cwd, {
        runId: input.runId,
        content: `Pinchy run summary\n\n${input.summary}`,
      });
    },
  };
}
