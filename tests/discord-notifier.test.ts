import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listNotificationDeliveries } from "../apps/host/src/agent-state-store.js";
import { createDiscordNotifier } from "../services/notifiers/discord.js";
import { upsertDiscordThreadMapping } from "../services/discord-gateway/thread-store.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-discord-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("Discord notifier stores a sent delivery for a question", async () => {
  await withTempDir(async (cwd) => {
    const payloads: Array<{ url: string; body: { content: string } }> = [];
    const notifier = createDiscordNotifier({
      webhookUrl: "https://discord.example/webhook",
      postJson: async (url, body) => {
        payloads.push({ url, body: body as { content: string } });
      },
    });

    const delivery = await notifier.sendQuestion(cwd, {
      questionId: "question-1",
      runId: "run-1",
      prompt: "Need clarification on provider selection.",
      conversationTitle: "Pinchy planning",
    });

    assert.equal(payloads.length, 1);
    assert.equal(payloads[0]?.url, "https://discord.example/webhook");
    assert.match(payloads[0]?.body.content ?? "", /Need clarification/);
    assert.match(payloads[0]?.body.content ?? "", /question id:\s*question-1/i);
    assert.match(payloads[0]?.body.content ?? "", /run id:\s*run-1/i);
    assert.equal(delivery.status, "sent");
    assert.equal(listNotificationDeliveries(cwd).length, 1);
    assert.equal(listNotificationDeliveries(cwd)[0]?.channel, "discord");
  });
});

test("Discord notifier stores a failed delivery when webhook post fails", async () => {
  await withTempDir(async (cwd) => {
    const notifier = createDiscordNotifier({
      webhookUrl: "https://discord.example/webhook",
      postJson: async () => {
        throw new Error("network down");
      },
    });

    const delivery = await notifier.sendRunSummary(cwd, {
      runId: "run-2",
      summary: "Completed autonomous QA pass.",
    });

    assert.equal(delivery?.status, "failed");
    assert.match(delivery?.error ?? "", /network down/);
    assert.equal(listNotificationDeliveries(cwd).length, 1);
    assert.equal(listNotificationDeliveries(cwd)[0]?.status, "failed");
  });
});

test("Discord notifier times out hung webhook posts and records a failed delivery", async () => {
  await withTempDir(async (cwd) => {
    const notifier = createDiscordNotifier({
      webhookUrl: "https://discord.example/webhook",
      webhookTimeoutMs: 5,
      fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
    });

    const delivery = await notifier.sendRunSummary(cwd, {
      runId: "run-2",
      summary: "Completed autonomous QA pass.",
    });

    assert.equal(delivery?.status, "failed");
    assert.match(delivery?.error ?? "", /timed out/i);
  });
});

test("Discord notifier sends questions to a mapped bot thread before webhook fallback", async () => {
  await withTempDir(async (cwd) => {
    upsertDiscordThreadMapping(cwd, {
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
      conversationId: "conversation-1",
    });
    const botMessages: Array<{ channelId: string; content: string }> = [];
    const notifier = createDiscordNotifier({
      botToken: "bot-token",
      webhookUrl: "https://discord.example/webhook",
      sendBotMessage: async (input) => {
        botMessages.push(input);
        return { id: "discord-message-1" };
      },
      postJson: async () => {
        throw new Error("webhook should not be used");
      },
    });

    const delivery = await notifier.sendQuestion(cwd, {
      questionId: "question-1",
      runId: "run-1",
      conversationId: "conversation-1",
      prompt: "Need clarification on provider selection.",
      conversationTitle: "Pinchy planning",
    });

    assert.equal(botMessages.length, 1);
    assert.equal(botMessages[0]?.channelId, "thread-1");
    assert.match(botMessages[0]?.content ?? "", /Need clarification/);
    assert.equal(delivery.status, "sent");
    assert.equal(delivery.externalId, "discord-message-1");
  });
});

test("Discord notifier skips mapped-only run summaries when no Discord thread is mapped", async () => {
  await withTempDir(async (cwd) => {
    const notifier = createDiscordNotifier({
      botToken: "bot-token",
      webhookUrl: "https://discord.example/webhook",
      sendBotMessage: async () => {
        throw new Error("bot should not be used");
      },
      postJson: async () => {
        throw new Error("webhook should not be used");
      },
    });

    const delivery = await notifier.sendRunSummary(cwd, {
      conversationId: "conversation-without-discord",
      runId: "run-1",
      summary: "Completed.",
      mappedOnly: true,
    });

    assert.equal(delivery, undefined);
    assert.equal(listNotificationDeliveries(cwd).length, 0);
  });
});

test("Discord notifier sends mapped-only run summaries to mapped Discord threads", async () => {
  await withTempDir(async (cwd) => {
    upsertDiscordThreadMapping(cwd, {
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
      conversationId: "conversation-1",
    });
    const botMessages: Array<{ channelId: string; content: string }> = [];
    const notifier = createDiscordNotifier({
      botToken: "bot-token",
      sendBotMessage: async (input) => {
        botMessages.push(input);
        return { id: "discord-message-1" };
      },
    });

    const delivery = await notifier.sendRunSummary(cwd, {
      conversationId: "conversation-1",
      runId: "run-1",
      summary: "Completed.",
      mappedOnly: true,
    });

    assert.equal(botMessages[0]?.channelId, "thread-1");
    assert.equal(botMessages[0]?.content, "Completed.");
    assert.equal(delivery?.status, "sent");
    assert.equal(delivery?.externalId, "discord-message-1");
  });
});
