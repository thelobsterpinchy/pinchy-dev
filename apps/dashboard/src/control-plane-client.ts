import type {
  Conversation,
  HumanReply,
  Message,
  NotificationDelivery,
  Question,
  Run,
  RunKind,
  SavedMemory,
  WorkspaceEntry,
} from "../../../packages/shared/src/contracts.js";

export type ConversationState = {
  conversation: Conversation;
  messages: Message[];
  runs: Run[];
  questions: Question[];
  replies: HumanReply[];
  deliveries: NotificationDelivery[];
};

const CONTROL_PLANE_PREFIX = "/api/control-plane";
const DASHBOARD_PREFIX = "/api";

export type LocalServerModelDiscovery = {
  models: string[];
  detectedModel?: string;
};

export type DashboardSettings = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: "off" | "low" | "medium" | "high";
  defaultBaseUrl?: string;
  workspaceDefaults?: {
    defaultProvider?: string;
    defaultModel?: string;
    defaultThinkingLevel?: "off" | "low" | "medium" | "high";
    defaultBaseUrl?: string;
  };
  sources?: {
    defaultProvider?: "env" | "workspace" | "pi-agent" | "unset";
    defaultModel?: "env" | "workspace" | "pi-agent" | "unset";
    defaultThinkingLevel?: "env" | "workspace" | "pi-agent" | "unset";
    defaultBaseUrl?: "env" | "workspace" | "pi-agent" | "unset";
  };
};

async function fetchJson<T>(path: string, init?: RequestInit, fetchImpl: typeof fetch = fetch): Promise<T> {
  const response = await fetchImpl(path, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function selectConversationId(conversations: Conversation[], currentConversationId?: string) {
  if (currentConversationId && conversations.some((conversation) => conversation.id === currentConversationId)) {
    return currentConversationId;
  }
  return conversations[0]?.id;
}

export function fetchConversations(fetchImpl?: typeof fetch) {
  return fetchJson<Conversation[]>(`${CONTROL_PLANE_PREFIX}/conversations`, undefined, fetchImpl);
}

export function createConversation(title: string, fetchImpl?: typeof fetch) {
  return fetchJson<Conversation>(`${CONTROL_PLANE_PREFIX}/conversations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  }, fetchImpl);
}

export function deleteConversation(conversationId: string, fetchImpl?: typeof fetch) {
  return fetchJson<{ ok: true }>(`${CONTROL_PLANE_PREFIX}/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  }, fetchImpl);
}

export function fetchConversationState(conversationId: string, fetchImpl?: typeof fetch) {
  return fetchJson<ConversationState>(`${CONTROL_PLANE_PREFIX}/conversations/${encodeURIComponent(conversationId)}/state`, undefined, fetchImpl);
}

export function appendConversationMessage(input: { conversationId: string; role: "user" | "agent" | "system"; content: string; runId?: string }, fetchImpl?: typeof fetch) {
  return fetchJson<Message>(`${CONTROL_PLANE_PREFIX}/conversations/${encodeURIComponent(input.conversationId)}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      role: input.role,
      content: input.content,
      runId: input.runId,
    }),
  }, fetchImpl);
}

export function createRun(input: { conversationId: string; goal: string; kind?: RunKind }, fetchImpl?: typeof fetch) {
  return fetchJson<Run>(`${CONTROL_PLANE_PREFIX}/conversations/${encodeURIComponent(input.conversationId)}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      goal: input.goal,
      kind: input.kind,
    }),
  }, fetchImpl);
}

export async function submitPromptToConversation(input: { conversationId: string; prompt: string; kind?: RunKind }, fetchImpl?: typeof fetch) {
  const message = await appendConversationMessage({
    conversationId: input.conversationId,
    role: "user",
    content: input.prompt,
  }, fetchImpl);
  const run = await createRun({
    conversationId: input.conversationId,
    goal: input.prompt,
    kind: input.kind ?? "user_prompt",
  }, fetchImpl);
  return { message, run };
}

export function replyToQuestion(input: { questionId: string; conversationId: string; content: string }, fetchImpl?: typeof fetch) {
  return fetchJson<HumanReply>(`${CONTROL_PLANE_PREFIX}/questions/${encodeURIComponent(input.questionId)}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: input.conversationId,
      channel: "dashboard",
      content: input.content,
    }),
  }, fetchImpl);
}

export function cancelRun(runId: string, fetchImpl?: typeof fetch) {
  return fetchJson<Run>(`${CONTROL_PLANE_PREFIX}/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  }, fetchImpl);
}

export function fetchSettings(fetchImpl?: typeof fetch) {
  return fetchJson<DashboardSettings>(`${DASHBOARD_PREFIX}/settings`, undefined, fetchImpl);
}

export function updateSettings(patch: DashboardSettings, fetchImpl?: typeof fetch) {
  return fetchJson<DashboardSettings>(`${DASHBOARD_PREFIX}/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  }, fetchImpl);
}

export function discoverLocalServerModel(baseUrl: string, fetchImpl?: typeof fetch) {
  return fetchJson<LocalServerModelDiscovery>(`${DASHBOARD_PREFIX}/settings/discover-model`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseUrl }),
  }, fetchImpl);
}

export function fetchWorkspaces(fetchImpl?: typeof fetch) {
  return fetchJson<WorkspaceEntry[]>(`${DASHBOARD_PREFIX}/workspaces`, undefined, fetchImpl);
}

export function registerWorkspace(input: { path: string; name?: string }, fetchImpl?: typeof fetch) {
  return fetchJson<WorkspaceEntry>(`${DASHBOARD_PREFIX}/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }, fetchImpl);
}

export function setActiveWorkspace(workspaceId: string, fetchImpl?: typeof fetch) {
  return fetchJson<{ ok: true; workspace: WorkspaceEntry }>(`${DASHBOARD_PREFIX}/workspaces/${encodeURIComponent(workspaceId)}/activate`, {
    method: "POST",
  }, fetchImpl);
}

export function deleteWorkspace(workspaceId: string, fetchImpl?: typeof fetch) {
  return fetchJson<{ ok: true; workspace: WorkspaceEntry; activeWorkspaceId?: string }>(`${DASHBOARD_PREFIX}/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "DELETE",
  }, fetchImpl);
}

export function fetchMemories(fetchImpl?: typeof fetch) {
  return fetchJson<SavedMemory[]>(`${DASHBOARD_PREFIX}/memory`, undefined, fetchImpl);
}

export function createMemory(input: { title: string; content: string; kind?: SavedMemory["kind"]; tags?: string[]; pinned?: boolean; sourceConversationId?: string; sourceRunId?: string }, fetchImpl?: typeof fetch) {
  return fetchJson<SavedMemory>(`${DASHBOARD_PREFIX}/memory`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }, fetchImpl);
}

export function updateMemory(id: string, patch: Partial<Pick<SavedMemory, "title" | "content" | "kind" | "tags" | "pinned" | "sourceConversationId" | "sourceRunId">>, fetchImpl?: typeof fetch) {
  return fetchJson<SavedMemory>(`${DASHBOARD_PREFIX}/memory/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  }, fetchImpl);
}

export function submitTaskDelegationPlan(input: {
  conversationId: string;
  runId?: string;
  tasks: Array<{ title: string; prompt: string }>;
}, fetchImpl?: typeof fetch) {
  return fetchJson<{ ok: true }>(`${DASHBOARD_PREFIX}/actions/delegate-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }, fetchImpl);
}

export function deleteMemory(id: string, fetchImpl?: typeof fetch) {
  return fetchJson<{ ok: true }>(`${DASHBOARD_PREFIX}/memory/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }, fetchImpl);
}
