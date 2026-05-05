import type { Conversation, ConversationState, HumanReply, Message, Run, RunKind } from "../../packages/shared/src/contracts.js";

export type DiscordGatewayApiClient = {
  createConversation(input: { title: string }): Promise<Conversation>;
  appendMessage(input: { conversationId: string; role: "user" | "agent" | "system"; content: string; runId?: string }): Promise<Message>;
  createRun(input: { conversationId: string; goal: string; kind?: RunKind }): Promise<Run>;
  fetchConversationState(conversationId: string): Promise<ConversationState>;
  replyToQuestion(input: { questionId: string; conversationId: string; content: string; rawPayload?: unknown }): Promise<HumanReply>;
};

async function fetchJson<T>(url: string, init: RequestInit, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pinchy API request failed: ${response.status} ${response.statusText}${body ? ` ${body}` : ""}`);
  }
  return response.json() as Promise<T>;
}

export function createDiscordGatewayApiClient(input: {
  apiBaseUrl: string;
  apiToken?: string;
  fetchImpl?: typeof fetch;
}): DiscordGatewayApiClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const apiBaseUrl = input.apiBaseUrl.replace(/\/+$/, "");
  const baseHeaders: Record<string, string> = {
    "content-type": "application/json",
  };
  if (input.apiToken) {
    baseHeaders.authorization = `Bearer ${input.apiToken}`;
  }

  function post<T>(path: string, body: unknown) {
    return fetchJson<T>(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(body),
    }, fetchImpl);
  }

  function get<T>(path: string) {
    return fetchJson<T>(`${apiBaseUrl}${path}`, {
      method: "GET",
      headers: input.apiToken ? { authorization: `Bearer ${input.apiToken}` } : undefined,
    }, fetchImpl);
  }

  return {
    createConversation(input) {
      return post<Conversation>("/conversations", input);
    },
    appendMessage(input) {
      return post<Message>(`/conversations/${encodeURIComponent(input.conversationId)}/messages`, input);
    },
    createRun(input) {
      return post<Run>(`/conversations/${encodeURIComponent(input.conversationId)}/runs`, {
        goal: input.goal,
        kind: input.kind,
      });
    },
    fetchConversationState(conversationId) {
      return get<ConversationState>(`/conversations/${encodeURIComponent(conversationId)}/state`);
    },
    replyToQuestion(input) {
      return post<HumanReply>(`/questions/${encodeURIComponent(input.questionId)}/reply`, {
        conversationId: input.conversationId,
        channel: "discord",
        content: input.content,
        rawPayload: input.rawPayload,
      });
    },
  };
}
