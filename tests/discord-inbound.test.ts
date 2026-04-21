import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDiscordInboundReply, DiscordInboundNormalizationError } from "../services/notifiers/discord-inbound.js";

test("normalizeDiscordInboundReply maps a Discord webhook payload into a shared inbound reply", () => {
  const normalized = normalizeDiscordInboundReply({
    questionId: "question-1",
    conversationId: "conversation-1",
    content: "Use JSON first.",
    messageId: "discord-message-1",
    authorUsername: "brandon",
    channelId: "discord-channel-1",
  });

  assert.equal(normalized.questionId, "question-1");
  assert.equal(normalized.conversationId, "conversation-1");
  assert.equal(normalized.channel, "discord");
  assert.equal(normalized.content, "Use JSON first.");
  assert.deepEqual(normalized.rawPayload, {
    source: "discord",
    messageId: "discord-message-1",
    authorUsername: "brandon",
    channelId: "discord-channel-1",
  });
});

test("normalizeDiscordInboundReply rejects missing identifiers or content", () => {
  assert.throws(() => {
    normalizeDiscordInboundReply({
      questionId: "question-1",
      conversationId: "",
      content: "reply",
    });
  }, DiscordInboundNormalizationError);

  assert.throws(() => {
    normalizeDiscordInboundReply({
      questionId: "",
      conversationId: "conversation-1",
      content: "reply",
    });
  }, DiscordInboundNormalizationError);

  assert.throws(() => {
    normalizeDiscordInboundReply({
      questionId: "question-1",
      conversationId: "conversation-1",
      content: "   ",
    });
  }, DiscordInboundNormalizationError);
});
