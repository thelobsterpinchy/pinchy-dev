import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Conversation, ConversationState, HumanReply, Message, Run } from "../packages/shared/src/contracts.js";
import { loadDiscordGatewayConfig } from "../services/discord-gateway/config.js";
import { createDiscordRestClient } from "../services/discord-gateway/discord-rest.js";
import { resolveDiscordReconnectDelay } from "../services/discord-gateway/reconnect.js";
import { listDiscordThreadMappings, upsertDiscordThreadMapping } from "../services/discord-gateway/thread-store.js";
import { routeDiscordGatewayMessage } from "../services/discord-gateway/router.js";
import type { DiscordGatewayApiClient } from "../services/discord-gateway/api-client.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-discord-gateway-"));
  return Promise.resolve(run(cwd)).finally(() => {
    rmSync(cwd, { recursive: true, force: true });
  });
}

function createMockApiClient(state: Partial<ConversationState> = {}) {
  const calls: string[] = [];
  const apiClient: DiscordGatewayApiClient = {
    async createConversation(input) {
      calls.push(`createConversation:${input.title}`);
      return { id: "conversation-1", title: input.title, status: "active", createdAt: "", updatedAt: "" } satisfies Conversation;
    },
    async appendMessage(input) {
      calls.push(`appendMessage:${input.conversationId}:${input.content}`);
      return { id: "message-1", conversationId: input.conversationId, role: input.role, content: input.content, createdAt: "" } satisfies Message;
    },
    async createRun(input) {
      calls.push(`createRun:${input.conversationId}:${input.goal}:${input.kind}`);
      return { id: "run-1", conversationId: input.conversationId, goal: input.goal, kind: input.kind ?? "user_prompt", status: "queued", createdAt: "", updatedAt: "" } satisfies Run;
    },
    async fetchConversationState(conversationId) {
      calls.push(`fetchConversationState:${conversationId}`);
      return {
        conversation: { id: conversationId, title: "Discord thread", status: "active", createdAt: "", updatedAt: "" },
        messages: [],
        runs: [],
        questions: [],
        replies: [],
        deliveries: [],
        runActivities: [],
        ...state,
      } satisfies ConversationState;
    },
    async replyToQuestion(input) {
      calls.push(`replyToQuestion:${input.questionId}:${input.content}`);
      return { id: "reply-1", questionId: input.questionId, conversationId: input.conversationId, channel: "discord", content: input.content, receivedAt: "", rawPayload: input.rawPayload } satisfies HumanReply;
    },
  };
  return { apiClient, calls };
}

const config = {
  enabled: true,
  botToken: "bot-token",
  apiBaseUrl: "http://127.0.0.1:4320",
  apiToken: "api-token",
  botUserId: "bot-1",
  allowedGuildIds: ["guild-1"],
  allowedChannelIds: ["channel-1"],
  allowedUserIds: ["user-1"],
};

test("loadDiscordGatewayConfig parses allowlists and enables only when a bot token is present", () => {
  assert.deepEqual(loadDiscordGatewayConfig({}).enabled, false);
  assert.deepEqual(loadDiscordGatewayConfig({
    PINCHY_DISCORD_BOT_TOKEN: " token ",
    PINCHY_API_TOKEN: " api ",
    PINCHY_DISCORD_ALLOWED_GUILD_IDS: "guild-1,guild-2",
    PINCHY_DISCORD_ALLOWED_CHANNEL_IDS: "channel-1",
    PINCHY_DISCORD_ALLOWED_USER_IDS: "user-1,user-2",
  }), {
    enabled: true,
    botToken: "token",
    apiBaseUrl: "http://127.0.0.1:4320",
    apiToken: "api",
    allowedGuildIds: ["guild-1", "guild-2"],
    allowedChannelIds: ["channel-1"],
    allowedUserIds: ["user-1", "user-2"],
    botUserId: undefined,
  });
});

test("discord thread mapping store creates and reuses workspace-local mappings", async () => {
  await withTempDir((cwd) => {
    const first = upsertDiscordThreadMapping(cwd, {
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
      conversationId: "conversation-1",
    });
    const second = upsertDiscordThreadMapping(cwd, {
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
      conversationId: "conversation-2",
    });

    assert.equal(first.id, second.id);
    assert.equal(listDiscordThreadMappings(cwd).length, 1);
    assert.equal(listDiscordThreadMappings(cwd)[0]?.conversationId, "conversation-2");
  });
});

test("Discord REST client aborts hung requests after its timeout", async () => {
  const client = createDiscordRestClient({
    token: "bot-token",
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    }),
  });

  await assert.rejects(
    () => client.sendMessage({ channelId: "channel-1", content: "Hello" }),
    /timed out|aborted/i,
  );
});

test("discord router creates a thread, conversation, message, and run from an allowed mention", async () => {
  await withTempDir(async (cwd) => {
    const { apiClient, calls } = createMockApiClient();
    const acknowledgements: Array<{ channelId: string; content: string }> = [];
    const result = await routeDiscordGatewayMessage({
      id: "message-1",
      guildId: "guild-1",
      channelId: "channel-1",
      authorId: "user-1",
      authorUsername: "operator",
      content: "<@bot-1> Fix the failing dashboard test",
      mentionedUserIds: ["bot-1"],
    }, {
      cwd,
      config,
      apiClient,
      createThread: async () => ({ threadId: "thread-1" }),
      sendMessage: async (input) => {
        acknowledgements.push(input);
        return { id: "ack-1" };
      },
    });

    assert.equal(result.action, "created_conversation");
    assert.equal(listDiscordThreadMappings(cwd)[0]?.threadId, "thread-1");
    assert.deepEqual(calls, [
      "createConversation:Fix the failing dashboard test",
      "appendMessage:conversation-1:Fix the failing dashboard test",
      "createRun:conversation-1:Fix the failing dashboard test:user_prompt",
    ]);
    assert.equal(acknowledgements[0]?.channelId, "thread-1");
    assert.match(acknowledgements[0]?.content ?? "", /Pinchy is on it/);
    assert.match(acknowledgements[0]?.content ?? "", /Reply with `status`/);
  });
});

test("discord router answers the latest pending question in a mapped thread", async () => {
  await withTempDir(async (cwd) => {
    upsertDiscordThreadMapping(cwd, {
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
      conversationId: "conversation-1",
    });
    const { apiClient, calls } = createMockApiClient({
      questions: [
        { id: "question-1", conversationId: "conversation-1", runId: "run-1", prompt: "Which path?", status: "waiting_for_human", priority: "normal", createdAt: "2026-05-05T00:00:00.000Z" },
      ],
    });
    const acknowledgements: Array<{ channelId: string; content: string }> = [];

    const result = await routeDiscordGatewayMessage({
      id: "message-2",
      guildId: "guild-1",
      channelId: "thread-1",
      threadId: "thread-1",
      authorId: "user-1",
      content: "Use the smallest fix.",
    }, {
      cwd,
      config,
      apiClient,
      createThread: async () => ({ threadId: "unused" }),
      sendMessage: async (input) => {
        acknowledgements.push(input);
        return { id: "ack-1" };
      },
    });

    assert.equal(result.action, "answered_question");
    assert.deepEqual(calls, [
      "fetchConversationState:conversation-1",
      "replyToQuestion:question-1:Use the smallest fix.",
    ]);
    assert.match(acknowledgements[0]?.content ?? "", /Answer received/);
  });
});

test("discord router queues a new run in a mapped thread when no question is pending", async () => {
  await withTempDir(async (cwd) => {
    upsertDiscordThreadMapping(cwd, {
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
      conversationId: "conversation-1",
    });
    const { apiClient, calls } = createMockApiClient();

    const result = await routeDiscordGatewayMessage({
      id: "message-2",
      guildId: "guild-1",
      channelId: "thread-1",
      threadId: "thread-1",
      authorId: "user-1",
      content: "Continue with tests.",
    }, {
      cwd,
      config,
      apiClient,
      createThread: async () => ({ threadId: "unused" }),
    });

    assert.equal(result.action, "queued_run");
    assert.deepEqual(calls, [
      "fetchConversationState:conversation-1",
      "appendMessage:conversation-1:Continue with tests.",
      "createRun:conversation-1:Continue with tests.:user_prompt",
    ]);
  });
});

test("discord router reports mapped thread status without queueing a new run", async () => {
  await withTempDir(async (cwd) => {
    upsertDiscordThreadMapping(cwd, {
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
      conversationId: "conversation-1",
    });
    const { apiClient, calls } = createMockApiClient({
      runs: [
        { id: "run-1", conversationId: "conversation-1", goal: "Fix login", kind: "user_prompt", status: "running", createdAt: "", updatedAt: "" },
      ],
      questions: [
        { id: "question-1", conversationId: "conversation-1", runId: "run-1", prompt: "Which auth provider?", status: "waiting_for_human", priority: "high", createdAt: "2026-05-05T00:00:00.000Z" },
      ],
    });
    const acknowledgements: Array<{ channelId: string; content: string }> = [];

    const result = await routeDiscordGatewayMessage({
      id: "message-2",
      guildId: "guild-1",
      channelId: "thread-1",
      threadId: "thread-1",
      authorId: "user-1",
      content: "status",
    }, {
      cwd,
      config,
      apiClient,
      createThread: async () => ({ threadId: "unused" }),
      sendMessage: async (input) => {
        acknowledgements.push(input);
        return { id: "ack-1" };
      },
    });

    assert.equal(result.action, "reported_status");
    assert.deepEqual(calls, ["fetchConversationState:conversation-1"]);
    assert.match(acknowledgements[0]?.content ?? "", /Pinchy status/);
    assert.match(acknowledgements[0]?.content ?? "", /waiting for your answer/i);
    assert.match(acknowledgements[0]?.content ?? "", /Fix login/);
  });
});

test("discord router shows help in mapped threads without queueing a new run", async () => {
  await withTempDir(async (cwd) => {
    upsertDiscordThreadMapping(cwd, {
      guildId: "guild-1",
      channelId: "channel-1",
      threadId: "thread-1",
      conversationId: "conversation-1",
    });
    const { apiClient, calls } = createMockApiClient();
    const acknowledgements: Array<{ channelId: string; content: string }> = [];

    const result = await routeDiscordGatewayMessage({
      id: "message-2",
      guildId: "guild-1",
      channelId: "thread-1",
      threadId: "thread-1",
      authorId: "user-1",
      content: "help",
    }, {
      cwd,
      config,
      apiClient,
      createThread: async () => ({ threadId: "unused" }),
      sendMessage: async (input) => {
        acknowledgements.push(input);
        return { id: "ack-1" };
      },
    });

    assert.equal(result.action, "reported_help");
    assert.deepEqual(calls, []);
    assert.match(acknowledgements[0]?.content ?? "", /Reply with `status`/);
    assert.match(acknowledgements[0]?.content ?? "", /answer that question/);
  });
});

test("discord router ignores disallowed users without mutating Pinchy state", async () => {
  await withTempDir(async (cwd) => {
    const { apiClient, calls } = createMockApiClient();
    const result = await routeDiscordGatewayMessage({
      id: "message-1",
      guildId: "guild-1",
      channelId: "channel-1",
      authorId: "user-2",
      content: "<@bot-1> Do work",
      mentionedUserIds: ["bot-1"],
    }, {
      cwd,
      config,
      apiClient,
      createThread: async () => ({ threadId: "thread-1" }),
    });

    assert.equal(result.action, "ignored");
    assert.deepEqual(calls, []);
    assert.deepEqual(listDiscordThreadMappings(cwd), []);
  });
});

test("resolveDiscordReconnectDelay backs off and caps reconnect attempts", () => {
  assert.equal(resolveDiscordReconnectDelay(1, { initialDelayMs: 100, maxDelayMs: 1000, multiplier: 2 }), 100);
  assert.equal(resolveDiscordReconnectDelay(2, { initialDelayMs: 100, maxDelayMs: 1000, multiplier: 2 }), 200);
  assert.equal(resolveDiscordReconnectDelay(5, { initialDelayMs: 100, maxDelayMs: 1000, multiplier: 2 }), 1000);
});
