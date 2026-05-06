export type DiscordRestClient = {
  createThreadFromMessage(input: { channelId: string; messageId: string; name: string }): Promise<{ id: string }>;
  sendMessage(input: { channelId: string; content: string }): Promise<{ id: string }>;
  triggerTyping(input: { channelId: string }): Promise<void>;
};

async function discordFetch<T>(input: {
  token: string;
  method: string;
  path: string;
  body?: unknown;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1, Math.floor(input.timeoutMs ?? 10_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(`https://discord.com/api/v10${input.path}`, {
      method: input.method,
      headers: {
        authorization: `Bot ${input.token}`,
        "content-type": "application/json",
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Discord REST request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord REST request failed: ${response.status} ${response.statusText}${text ? ` ${text}` : ""}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function createDiscordRestClient(input: { token: string; fetchImpl?: typeof fetch; timeoutMs?: number }): DiscordRestClient {
  return {
    createThreadFromMessage(args) {
      return discordFetch<{ id: string }>({
        token: input.token,
        fetchImpl: input.fetchImpl,
        timeoutMs: input.timeoutMs,
        method: "POST",
        path: `/channels/${encodeURIComponent(args.channelId)}/messages/${encodeURIComponent(args.messageId)}/threads`,
        body: {
          name: args.name,
          auto_archive_duration: 1440,
        },
      });
    },
    sendMessage(args) {
      return discordFetch<{ id: string }>({
        token: input.token,
        fetchImpl: input.fetchImpl,
        timeoutMs: input.timeoutMs,
        method: "POST",
        path: `/channels/${encodeURIComponent(args.channelId)}/messages`,
        body: { content: args.content },
      });
    },
    triggerTyping(args) {
      return discordFetch<void>({
        token: input.token,
        fetchImpl: input.fetchImpl,
        timeoutMs: input.timeoutMs,
        method: "POST",
        path: `/channels/${encodeURIComponent(args.channelId)}/typing`,
      });
    },
  };
}
