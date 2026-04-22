import test from "node:test";
import assert from "node:assert/strict";
import {
  appendConversationMessage,
  cancelRun,
  createConversation,
  createMemory,
  createRun,
  deleteConversation,
  deleteMemory,
  deleteWorkspace,
  fetchConversationState,
  fetchConversations,
  fetchMemories,
  fetchSettings,
  fetchWorkspaces,
  discoverLocalServerModel,
  registerWorkspace,
  replyToQuestion,
  selectConversationId,
  setActiveWorkspace,
  submitAgentGuidance,
  submitPromptToConversation,
  updateSettings,
  submitTaskDelegationPlan,
  updateMemory,
} from "../apps/dashboard/src/control-plane-client.js";

test("control plane client fetches conversations from the dashboard proxy path", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify([{ id: "conversation-1", title: "Operator flow" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const conversations = await fetchConversations(fetchMock);

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.id, "conversation-1");
  assert.equal(String(calls[0]?.input), "/api/control-plane/conversations");
});

test("control plane client fetches aggregate conversation state", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      conversation: { id: "conversation-1", title: "Operator flow", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:00.000Z", status: "active" },
      messages: [],
      runs: [],
      questions: [],
      replies: [],
      deliveries: [],
      sessionBinding: {
        conversationId: "conversation-1",
        piSessionPath: "/tmp/pi-thread-session.json",
        sourceRunId: "run-1",
        updatedAt: "2026-04-20T00:00:05.000Z",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const state = await fetchConversationState("conversation-1", fetchMock);

  assert.equal(state.conversation.id, "conversation-1");
  assert.equal(state.sessionBinding?.piSessionPath, "/tmp/pi-thread-session.json");
  assert.equal(String(calls[0]?.input), "/api/control-plane/conversations/conversation-1/state");
});

test("control plane client posts dashboard replies for questions", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "reply-1", content: "Use JSON files first." }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  const reply = await replyToQuestion({
    questionId: "question-1",
    conversationId: "conversation-1",
    content: "Use JSON files first.",
  }, fetchMock);

  assert.equal(reply.id, "reply-1");
  assert.equal(String(calls[0]?.input), "/api/control-plane/questions/question-1/reply");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    conversationId: "conversation-1",
    channel: "dashboard",
    content: "Use JSON files first.",
  });
});

test("control plane client cancels runs through the dashboard proxy", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "run-1", status: "cancelled" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const run = await cancelRun("run-1", fetchMock);

  assert.equal(run.status, "cancelled");
  assert.equal(String(calls[0]?.input), "/api/control-plane/runs/run-1/cancel");
  assert.equal(calls[0]?.init?.method, "POST");
});

test("control plane client creates a conversation through the dashboard proxy", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "conversation-9", title: "Dashboard-driven run" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  const conversation = await createConversation("Dashboard-driven run", fetchMock);

  assert.equal(conversation.id, "conversation-9");
  assert.equal(String(calls[0]?.input), "/api/control-plane/conversations");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { title: "Dashboard-driven run" });
});

test("control plane client appends a conversation message", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "message-1", content: "Please investigate the worker status." }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  const message = await appendConversationMessage({
    conversationId: "conversation-1",
    role: "user",
    content: "Please investigate the worker status.",
  }, fetchMock);

  assert.equal(message.id, "message-1");
  assert.equal(String(calls[0]?.input), "/api/control-plane/conversations/conversation-1/messages");
  assert.equal(calls[0]?.init?.method, "POST");
});

test("control plane client creates a run for a conversation", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ id: "run-7", status: "queued", kind: "user_prompt" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  const run = await createRun({
    conversationId: "conversation-1",
    goal: "Investigate the worker status.",
    kind: "user_prompt",
  }, fetchMock);

  assert.equal(run.id, "run-7");
  assert.equal(String(calls[0]?.input), "/api/control-plane/conversations/conversation-1/runs");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { goal: "Investigate the worker status.", kind: "user_prompt" });
});

test("control plane client submits a prompt by appending a user message and creating a run", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ id: "message-1", content: "Investigate the worker status." }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "run-1", status: "queued", kind: "user_prompt" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await submitPromptToConversation({
    conversationId: "conversation-1",
    prompt: "Investigate the worker status.",
  }, fetchMock);

  assert.equal(result.message.id, "message-1");
  assert.equal(result.run.id, "run-1");
  assert.equal(String(calls[0]?.input), "/api/control-plane/conversations/conversation-1/messages");
  assert.equal(String(calls[1]?.input), "/api/control-plane/conversations/conversation-1/runs");
});

test("dashboard client submits scoped agent guidance through the dashboard api", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const guidance = await submitAgentGuidance({
    conversationId: "conversation-1",
    taskId: "task-1",
    runId: "run-1",
    content: "Stay scoped.",
  }, fetchMock);

  assert.equal(guidance.ok, true);
  assert.equal(String(calls[0]?.input), "/api/actions/agent-guidance");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    conversationId: "conversation-1",
    taskId: "task-1",
    runId: "run-1",
    content: "Stay scoped.",
  });
});

test("control plane client deletes a conversation session through the dashboard proxy", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await deleteConversation("conversation-1", fetchMock);

  assert.deepEqual(result, { ok: true });
  assert.equal(String(calls[0]?.input), "/api/control-plane/conversations/conversation-1");
  assert.equal(calls[0]?.init?.method, "DELETE");
});

test("dashboard client fetches runtime settings through the dashboard api", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      defaultProvider: "openai-codex",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "medium",
      defaultBaseUrl: "http://127.0.0.1:11434/v1",
      autoDeleteEnabled: true,
      autoDeleteDays: 14,
      workspaceDefaults: {},
      sources: {
        defaultProvider: "pi-agent",
        defaultModel: "pi-agent",
        defaultThinkingLevel: "pi-agent",
        defaultBaseUrl: "workspace",
        autoDeleteEnabled: "workspace",
        autoDeleteDays: "workspace",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const settings = await fetchSettings(fetchMock);

  assert.equal(settings.defaultProvider, "openai-codex");
  assert.equal(settings.defaultModel, "gpt-5.4");
  assert.equal(settings.defaultThinkingLevel, "medium");
  assert.equal(settings.defaultBaseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(settings.autoDeleteEnabled, true);
  assert.equal(settings.autoDeleteDays, 14);
  assert.deepEqual(settings.workspaceDefaults, {});
  assert.deepEqual(settings.sources, {
    defaultProvider: "pi-agent",
    defaultModel: "pi-agent",
    defaultThinkingLevel: "pi-agent",
    defaultBaseUrl: "workspace",
    autoDeleteEnabled: "workspace",
    autoDeleteDays: "workspace",
  });
  assert.equal(String(calls[0]?.input), "/api/settings");
});

test("dashboard client updates runtime settings through the dashboard api", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder",
      defaultThinkingLevel: "high",
      defaultBaseUrl: "http://127.0.0.1:11434/v1",
      autoDeleteEnabled: true,
      autoDeleteDays: 30,
      workspaceDefaults: {
        defaultProvider: "ollama",
        defaultModel: "qwen3-coder",
        defaultThinkingLevel: "high",
        defaultBaseUrl: "http://127.0.0.1:11434/v1",
        autoDeleteEnabled: true,
        autoDeleteDays: 30,
      },
      sources: {
        defaultProvider: "workspace",
        defaultModel: "workspace",
        defaultThinkingLevel: "workspace",
        defaultBaseUrl: "workspace",
        autoDeleteEnabled: "workspace",
        autoDeleteDays: "workspace",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const settings = await updateSettings({
    defaultModel: "qwen3-coder",
    defaultThinkingLevel: "high",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    autoDeleteEnabled: true,
    autoDeleteDays: 30,
  }, fetchMock);

  assert.equal(settings.defaultModel, "qwen3-coder");
  assert.equal(settings.defaultBaseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(settings.autoDeleteEnabled, true);
  assert.equal(settings.autoDeleteDays, 30);
  assert.deepEqual(settings.workspaceDefaults, {
    defaultProvider: "ollama",
    defaultModel: "qwen3-coder",
    defaultThinkingLevel: "high",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    autoDeleteEnabled: true,
    autoDeleteDays: 30,
  });
  assert.deepEqual(settings.sources, {
    defaultProvider: "workspace",
    defaultModel: "workspace",
    defaultThinkingLevel: "workspace",
    defaultBaseUrl: "workspace",
    autoDeleteEnabled: "workspace",
    autoDeleteDays: "workspace",
  });
  assert.equal(String(calls[0]?.input), "/api/settings");
  assert.equal(calls[0]?.init?.method, "PATCH");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    defaultModel: "qwen3-coder",
    defaultThinkingLevel: "high",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    autoDeleteEnabled: true,
    autoDeleteDays: 30,
  });
});

test("dashboard client discovers a local server model through the dashboard api", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      models: ["qwen3-coder", "deepseek-r1"],
      detectedModel: "qwen3-coder",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await discoverLocalServerModel("http://127.0.0.1:11434/v1", fetchMock);

  assert.deepEqual(result, {
    models: ["qwen3-coder", "deepseek-r1"],
    detectedModel: "qwen3-coder",
  });
  assert.equal(String(calls[0]?.input), "/api/settings/discover-model");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    baseUrl: "http://127.0.0.1:11434/v1",
  });
});

test("dashboard client submits a multi-task delegation plan through the dashboard actions api", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await submitTaskDelegationPlan({
    conversationId: "conversation-1",
    runId: "run-1",
    tasks: [
      { title: "Audit worker logs", prompt: "Inspect the worker logs." },
      { title: "Review dashboard smoke", prompt: "Run the smoke checks." },
    ],
  }, fetchMock);

  assert.deepEqual(result, { ok: true });
  assert.equal(String(calls[0]?.input), "/api/actions/delegate-plan");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    conversationId: "conversation-1",
    runId: "run-1",
    tasks: [
      { title: "Audit worker logs", prompt: "Inspect the worker logs." },
      { title: "Review dashboard smoke", prompt: "Run the smoke checks." },
    ],
  });
});

test("dashboard client lists and mutates saved memory entries", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ id: "memory-1", title: "Memory", content: "Text", kind: "note", tags: ["ops"], pinned: false }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "PATCH") {
      return new Response(JSON.stringify({ id: "memory-1", title: "Memory", content: "Updated", kind: "note", tags: ["ops"], pinned: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "DELETE") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify([{ id: "memory-1", title: "Memory", content: "Text", kind: "note", tags: ["ops"], pinned: false }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const list = await fetchMemories(fetchMock);
  const created = await createMemory({ title: "Memory", content: "Text", kind: "note", tags: ["ops"] }, fetchMock);
  const updated = await updateMemory("memory-1", { content: "Updated", pinned: true }, fetchMock);
  const deleted = await deleteMemory("memory-1", fetchMock);

  assert.equal(list.length, 1);
  assert.equal(created.id, "memory-1");
  assert.equal(updated.pinned, true);
  assert.deepEqual(deleted, { ok: true });
  assert.equal(String(calls[0]?.input), "/api/memory");
  assert.equal(String(calls[1]?.input), "/api/memory");
  assert.equal(String(calls[2]?.input), "/api/memory/memory-1");
  assert.equal(String(calls[3]?.input), "/api/memory/memory-1");
});

test("dashboard client lists, registers, activates, and deletes workspaces", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    const url = String(input);
    if (!init?.method || init.method === "GET") {
      return new Response(JSON.stringify([{ id: "workspace-1", name: "pinchy-dev", path: "/repo" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/activate")) {
      return new Response(JSON.stringify({ ok: true, workspace: { id: "workspace-2", name: "demo", path: "/tmp/demo" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init.method === "DELETE") {
      return new Response(JSON.stringify({ ok: true, workspace: { id: "workspace-2", name: "demo", path: "/tmp/demo" }, activeWorkspaceId: "workspace-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "workspace-2", name: "demo", path: "/tmp/demo" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  };

  const listed = await fetchWorkspaces(fetchMock);
  const created = await registerWorkspace({ path: "/tmp/demo", name: "demo" }, fetchMock);
  const activated = await setActiveWorkspace("workspace-2", fetchMock);
  const deleted = await deleteWorkspace("workspace-2", fetchMock);

  assert.equal(listed[0]?.id, "workspace-1");
  assert.equal(created.path, "/tmp/demo");
  assert.equal(activated.workspace.id, "workspace-2");
  assert.equal(deleted.workspace.id, "workspace-2");
  assert.equal(String(calls[0]?.input), "/api/workspaces");
  assert.equal(String(calls[1]?.input), "/api/workspaces");
  assert.equal(String(calls[2]?.input), "/api/workspaces/workspace-2/activate");
  assert.equal(String(calls[3]?.input), "/api/workspaces/workspace-2");
  assert.equal(calls[3]?.init?.method, "DELETE");
});

test("selectConversationId keeps the current selection when still present and otherwise falls back to the first conversation", () => {
  const conversations = [
    { id: "conversation-1", title: "One", createdAt: "", updatedAt: "", status: "active" as const },
    { id: "conversation-2", title: "Two", createdAt: "", updatedAt: "", status: "active" as const },
  ];

  assert.equal(selectConversationId(conversations, "conversation-2"), "conversation-2");
  assert.equal(selectConversationId(conversations, "conversation-missing"), "conversation-1");
  assert.equal(selectConversationId([], "conversation-2"), undefined);
});
