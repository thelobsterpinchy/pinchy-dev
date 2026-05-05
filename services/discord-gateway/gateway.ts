import { createDiscordGatewayApiClient } from "./api-client.js";
import { assertDiscordGatewayConfigReady, loadDiscordGatewayConfig, type DiscordGatewayConfig } from "./config.js";
import { createDiscordRestClient, type DiscordRestClient } from "./discord-rest.js";
import { resolveDiscordReconnectDelay, type DiscordReconnectPolicy } from "./reconnect.js";
import { routeDiscordGatewayMessage, type DiscordGatewayMessage } from "./router.js";
import { shouldRunAsCliEntry } from "../../apps/host/src/module-entry.js";

type DiscordGatewayHello = {
  op: 10;
  d: { heartbeat_interval: number };
};

type DiscordGatewayDispatch = {
  op: 0;
  t?: string;
  s?: number;
  d: unknown;
};

type DiscordGatewayPayload = DiscordGatewayHello | DiscordGatewayDispatch | { op: number; t?: string; s?: number; d?: unknown };

type DiscordMessageCreatePayload = {
  id: string;
  guild_id?: string;
  channel_id: string;
  content: string;
  mentions?: Array<{ id: string }>;
  author?: {
    id: string;
    username?: string;
    bot?: boolean;
  };
};

function normalizeDiscordMessage(payload: DiscordMessageCreatePayload, config: DiscordGatewayConfig): DiscordGatewayMessage | undefined {
  if (!payload.author?.id || !payload.channel_id) {
    return undefined;
  }
  return {
    id: payload.id,
    guildId: payload.guild_id,
    channelId: payload.channel_id,
    threadId: config.allowedChannelIds.includes(payload.channel_id) ? undefined : payload.channel_id,
    authorId: payload.author.id,
    authorUsername: payload.author.username,
    content: payload.content,
    mentionedUserIds: payload.mentions?.map((entry) => entry.id),
    isBot: payload.author.bot,
  };
}

function parsePayload(data: unknown): DiscordGatewayPayload | undefined {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data) as DiscordGatewayPayload;
  } catch {
    return undefined;
  }
}

function createIdentifyPayload(config: DiscordGatewayConfig) {
  return {
    op: 2,
    d: {
      token: config.botToken,
      intents: 1 | 512 | 32768,
      properties: {
        os: process.platform,
        browser: "pinchy",
        device: "pinchy",
      },
    },
  };
}

export async function startDiscordGateway(input: {
  cwd: string;
  config?: DiscordGatewayConfig;
  restClient?: DiscordRestClient;
  websocketFactory?: (url: string) => WebSocket;
  reconnectPolicy?: DiscordReconnectPolicy;
  setTimeoutFn?: typeof setTimeout;
}) {
  const config = input.config ?? loadDiscordGatewayConfig();
  assertDiscordGatewayConfigReady(config);
  const restClient = input.restClient ?? createDiscordRestClient({ token: config.botToken ?? "" });
  const apiClient = createDiscordGatewayApiClient({
    apiBaseUrl: config.apiBaseUrl,
    apiToken: config.apiToken,
  });
  const websocketFactory = input.websocketFactory ?? ((url: string) => new WebSocket(url));
  const setTimeoutFn = input.setTimeoutFn ?? setTimeout;
  let socket: WebSocket | undefined;
  let sequence: number | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let reconnectAttempt = 0;
  let stopped = false;

  function send(payload: unknown) {
    socket?.send(JSON.stringify(payload));
  }

  function clearHeartbeat() {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  }

  function scheduleReconnect(reason: string) {
    if (stopped) return;
    clearHeartbeat();
    reconnectAttempt += 1;
    const delayMs = resolveDiscordReconnectDelay(reconnectAttempt, input.reconnectPolicy);
    console.error(`[pinchy-discord] gateway ${reason}; reconnecting in ${delayMs}ms`);
    setTimeoutFn(connect, delayMs);
  }

  function handleMessage(event: MessageEvent) {
    const payload = parsePayload(event.data);
    if (!payload) return;
    if ("s" in payload && typeof payload.s === "number") {
      sequence = payload.s;
    }

    if (payload.op === 10) {
      const hello = payload as DiscordGatewayHello;
      clearHeartbeat();
      heartbeat = setInterval(() => {
        send({ op: 1, d: sequence ?? null });
      }, hello.d.heartbeat_interval);
      send(createIdentifyPayload(config));
      return;
    }

    if (payload.op === 0 && payload.t === "READY") {
      reconnectAttempt = 0;
      const ready = payload.d as { user?: { id?: string } };
      if (ready.user?.id && !config.botUserId) {
        config.botUserId = ready.user.id;
      }
      console.log(`[pinchy-discord] connected as bot user ${config.botUserId ?? "unknown"}`);
      return;
    }

    if (payload.op === 0 && payload.t === "MESSAGE_CREATE") {
      const message = normalizeDiscordMessage(payload.d as DiscordMessageCreatePayload, config);
      if (!message) return;
      void routeDiscordGatewayMessage(message, {
        cwd: input.cwd,
        config,
        apiClient,
        createThread: async (request) => {
          const thread = await restClient.createThreadFromMessage(request);
          return { threadId: thread.id };
        },
        sendMessage: (request) => restClient.sendMessage(request),
      })
        .then((result) => {
          if (result.action !== "ignored") {
            console.log(`[pinchy-discord] ${result.action} conversation=${result.conversationId} thread=${result.threadId}`);
          }
        })
        .catch((error) => {
          console.error("[pinchy-discord] message handling failed", error);
        });
    }
  }

  function connect() {
    socket = websocketFactory("wss://gateway.discord.gg/?v=10&encoding=json");
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", () => {
      scheduleReconnect("closed");
    });
    socket.addEventListener("error", () => {
      scheduleReconnect("errored");
    });
  }

  connect();

  return {
    close() {
      stopped = true;
      clearHeartbeat();
      socket?.close();
    },
  };
}

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  await startDiscordGateway({ cwd });
  console.log("[pinchy-discord] gateway started");
}

if (shouldRunAsCliEntry(import.meta.url)) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
