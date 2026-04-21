import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listNotificationDeliveries } from "../apps/host/src/agent-state-store.js";
import { createDiscordNotifier } from "../services/notifiers/discord.js";

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

    assert.equal(delivery.status, "failed");
    assert.match(delivery.error ?? "", /network down/);
    assert.equal(listNotificationDeliveries(cwd).length, 1);
    assert.equal(listNotificationDeliveries(cwd)[0]?.status, "failed");
  });
});
