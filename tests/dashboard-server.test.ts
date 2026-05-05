import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation, createRun, listAgentGuidances, listMessages, listRunCancellationRequests, updateRunStatus } from "../apps/host/src/agent-state-store.js";
import { createDashboardServer } from "../apps/host/src/dashboard.js";

async function closeHttpServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}

async function listenHttpServer(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      server.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      cleanup();
      resolve();
    });
  });
}

async function withServer(
  run: (args: { cwd: string; baseUrl: string; agentDir: string }) => Promise<void>,
  options: {
    controlPlaneApiBaseUrl?: string;
    agentDir?: string;
    agentSessionController?: {
      steerRun?: (input: { cwd: string; conversationId: string; runId?: string; content: string }) => Promise<void>;
      queueFollowUp?: (input: { cwd: string; conversationId: string; runId?: string; content: string }) => Promise<void>;
    };
  } = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-dashboard-"));
  const agentDir = options.agentDir ?? join(cwd, ".pi-agent");
  mkdirSync(agentDir, { recursive: true });
  const server = createDashboardServer({ cwd, port: 0, controlPlaneApiBaseUrl: options.controlPlaneApiBaseUrl, agentDir, agentSessionController: options.agentSessionController });
  await listenHttpServer(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ cwd, baseUrl, agentDir });
  } finally {
    await closeHttpServer(server);
    rmSync(cwd, { recursive: true, force: true });
  }
}

async function withHttpServer(run: (baseUrl: string) => Promise<void>, handler: http.RequestListener) {
  const server = http.createServer(handler);
  await listenHttpServer(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await closeHttpServer(server);
  }
}

test("dashboard server exposes effective runtime settings through the dashboard api and persists updates", async () => {
  const originalProvider = process.env.PINCHY_DEFAULT_PROVIDER;
  const originalModel = process.env.PINCHY_DEFAULT_MODEL;
  const originalThinking = process.env.PINCHY_DEFAULT_THINKING_LEVEL;
  process.env.PINCHY_DEFAULT_PROVIDER = "openai-codex";
  process.env.PINCHY_DEFAULT_MODEL = "gpt-5.4";
  process.env.PINCHY_DEFAULT_THINKING_LEVEL = "medium";

  await withServer(async ({ cwd, baseUrl }) => {
    const initialResponse = await fetch(`${baseUrl}/api/settings`);
    assert.equal(initialResponse.status, 200);
    const initial = await initialResponse.json() as {
      defaultProvider?: string;
      defaultModel?: string;
      defaultThinkingLevel?: string;
      defaultBaseUrl?: string;
      modelOptions?: { temperature?: number; topP?: number; topK?: number; maxTokens?: number; seed?: number; stop?: string[]; repeatPenalty?: number; presencePenalty?: number; frequencyPenalty?: number; contextWindow?: number };
      savedModelConfigs?: Array<{ id: string; name: string }>;
      storedProviderCredentials?: Record<string, boolean>;
      autoDeleteEnabled?: boolean;
      autoDeleteDays?: number;
      toolRetryWarningThreshold?: number;
      toolRetryHardStopThreshold?: number;
      dangerModeEnabled?: boolean;
      workspaceDefaults?: { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string; defaultBaseUrl?: string; modelOptions?: { temperature?: number; topP?: number; topK?: number; maxTokens?: number; seed?: number; stop?: string[]; repeatPenalty?: number; presencePenalty?: number; frequencyPenalty?: number; contextWindow?: number }; savedModelConfigs?: Array<{ id: string; name: string }>; autoDeleteEnabled?: boolean; autoDeleteDays?: number; toolRetryWarningThreshold?: number; toolRetryHardStopThreshold?: number; dangerModeEnabled?: boolean };
      sources?: { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string; defaultBaseUrl?: string; orchestrationModel?: string; subagentModel?: string; autoDeleteEnabled?: string; autoDeleteDays?: string; toolRetryWarningThreshold?: string; toolRetryHardStopThreshold?: string; dangerModeEnabled?: string };
    };
    assert.equal(initial.defaultProvider, "openai-codex");
    assert.equal(initial.defaultModel, "gpt-5.4");
    assert.equal(initial.defaultThinkingLevel, "medium");
    assert.equal(initial.defaultBaseUrl, undefined);
    assert.equal(initial.modelOptions, undefined);
    assert.deepEqual(initial.savedModelConfigs, []);
    assert.deepEqual(initial.storedProviderCredentials, {});
    assert.equal(initial.autoDeleteEnabled, undefined);
    assert.equal(initial.autoDeleteDays, undefined);
    assert.equal(initial.toolRetryWarningThreshold, undefined);
    assert.equal(initial.toolRetryHardStopThreshold, undefined);
    assert.equal(initial.dangerModeEnabled, undefined);
    assert.deepEqual(initial.workspaceDefaults, {
      savedModelConfigs: [],
    });
    assert.deepEqual(initial.sources, {
      defaultProvider: "env",
      defaultModel: "env",
      defaultThinkingLevel: "env",
      defaultBaseUrl: "unset",
      orchestrationModel: "unset",
      subagentModel: "unset",
      autoDeleteEnabled: "unset",
      autoDeleteDays: "unset",
      toolRetryWarningThreshold: "unset",
      toolRetryHardStopThreshold: "unset",
      dangerModeEnabled: "unset",
    });

    const updateResponse = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        defaultProvider: "ollama",
        defaultModel: "qwen3-coder",
        defaultThinkingLevel: "high",
        defaultBaseUrl: "http://127.0.0.1:11434/v1",
        modelOptions: {
          temperature: 0.15,
          topP: 0.92,
          topK: 30,
          maxTokens: 2048,
          seed: 17,
          stop: ["DONE"],
          repeatPenalty: 1.03,
          presencePenalty: 0.1,
          frequencyPenalty: 0.2,
          contextWindow: 16384,
        },
        savedModelConfigs: [
          {
            id: "local-qwen",
            name: "Local Qwen coder",
            provider: "ollama",
            model: "qwen3-coder",
            baseUrl: "http://127.0.0.1:11434/v1",
            thinkingLevel: "high",
            modelOptions: {
              temperature: 0.15,
              topK: 30,
              maxTokens: 2048,
            },
          },
        ],
        autoDeleteEnabled: true,
        autoDeleteDays: 30,
        toolRetryWarningThreshold: 6,
        toolRetryHardStopThreshold: 12,
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json() as {
      defaultProvider?: string;
      defaultModel?: string;
      defaultThinkingLevel?: string;
      defaultBaseUrl?: string;
      modelOptions?: { temperature?: number; topP?: number; topK?: number; maxTokens?: number; seed?: number; stop?: string[]; repeatPenalty?: number; presencePenalty?: number; frequencyPenalty?: number; contextWindow?: number };
      savedModelConfigs?: Array<{ id: string; name: string; provider?: string; model?: string; baseUrl?: string; thinkingLevel?: string; modelOptions?: { temperature?: number; topK?: number; maxTokens?: number } }>;
      storedProviderCredentials?: Record<string, boolean>;
      autoDeleteEnabled?: boolean;
      autoDeleteDays?: number;
      toolRetryWarningThreshold?: number;
      toolRetryHardStopThreshold?: number;
      dangerModeEnabled?: boolean;
      workspaceDefaults?: { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string; defaultBaseUrl?: string; modelOptions?: { temperature?: number; topP?: number; topK?: number; maxTokens?: number; seed?: number; stop?: string[]; repeatPenalty?: number; presencePenalty?: number; frequencyPenalty?: number; contextWindow?: number }; savedModelConfigs?: Array<{ id: string; name: string; provider?: string; model?: string; baseUrl?: string; thinkingLevel?: string; modelOptions?: { temperature?: number; topK?: number; maxTokens?: number } }>; autoDeleteEnabled?: boolean; autoDeleteDays?: number; toolRetryWarningThreshold?: number; toolRetryHardStopThreshold?: number; dangerModeEnabled?: boolean };
      sources?: { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string; defaultBaseUrl?: string; autoDeleteEnabled?: string; autoDeleteDays?: string; toolRetryWarningThreshold?: string; toolRetryHardStopThreshold?: string; dangerModeEnabled?: string };
    };
    assert.equal(updated.defaultProvider, "ollama");
    assert.equal(updated.defaultModel, "qwen3-coder");
    assert.equal(updated.defaultThinkingLevel, "high");
    assert.equal(updated.defaultBaseUrl, "http://127.0.0.1:11434/v1");
    assert.deepEqual(updated.modelOptions, {
      temperature: 0.15,
      topP: 0.92,
      topK: 30,
      maxTokens: 2048,
      seed: 17,
      stop: ["DONE"],
      repeatPenalty: 1.03,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      contextWindow: 16384,
    });
    assert.deepEqual(updated.savedModelConfigs, [
      {
        id: "local-qwen",
        name: "Local Qwen coder",
        provider: "ollama",
        model: "qwen3-coder",
        baseUrl: "http://127.0.0.1:11434/v1",
        thinkingLevel: "high",
        modelOptions: {
          temperature: 0.15,
          topK: 30,
          maxTokens: 2048,
        },
      },
    ]);
    assert.deepEqual(updated.storedProviderCredentials, {});
    assert.equal(updated.autoDeleteEnabled, true);
    assert.equal(updated.autoDeleteDays, 30);
    assert.equal(updated.toolRetryWarningThreshold, 6);
    assert.equal(updated.toolRetryHardStopThreshold, 12);
    assert.equal(updated.dangerModeEnabled, undefined);
    assert.deepEqual(updated.workspaceDefaults, {
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder",
      defaultThinkingLevel: "high",
      defaultBaseUrl: "http://127.0.0.1:11434/v1",
      modelOptions: {
        temperature: 0.15,
        topP: 0.92,
        topK: 30,
        maxTokens: 2048,
        seed: 17,
        stop: ["DONE"],
        repeatPenalty: 1.03,
        presencePenalty: 0.1,
        frequencyPenalty: 0.2,
        contextWindow: 16384,
      },
      savedModelConfigs: [
        {
          id: "local-qwen",
          name: "Local Qwen coder",
          provider: "ollama",
          model: "qwen3-coder",
          baseUrl: "http://127.0.0.1:11434/v1",
          thinkingLevel: "high",
          modelOptions: {
            temperature: 0.15,
            topK: 30,
            maxTokens: 2048,
          },
        },
      ],
      autoDeleteEnabled: true,
      autoDeleteDays: 30,
      toolRetryWarningThreshold: 6,
      toolRetryHardStopThreshold: 12,
    });
    assert.deepEqual(updated.sources, {
      defaultProvider: "workspace",
      defaultModel: "workspace",
      defaultThinkingLevel: "workspace",
      defaultBaseUrl: "workspace",
      orchestrationModel: "unset",
      subagentModel: "unset",
      autoDeleteEnabled: "workspace",
      autoDeleteDays: "workspace",
      toolRetryWarningThreshold: "workspace",
      toolRetryHardStopThreshold: "workspace",
      dangerModeEnabled: "unset",
    });

    const reread = await fetch(`${baseUrl}/api/settings`).then((response) => response.json() as Promise<typeof updated>);
    assert.deepEqual(reread, updated);

    const onDisk = JSON.parse(readFileSync(join(cwd, ".pinchy-runtime.json"), "utf8")) as Record<string, string | boolean | number>;
    assert.equal(onDisk.defaultProvider, "ollama");
    assert.equal(onDisk.defaultModel, "qwen3-coder");
    assert.equal(onDisk.defaultThinkingLevel, "high");
    assert.equal(onDisk.defaultBaseUrl, "http://127.0.0.1:11434/v1");
    assert.deepEqual(onDisk.modelOptions, {
      temperature: 0.15,
      topP: 0.92,
      topK: 30,
      maxTokens: 2048,
      seed: 17,
      stop: ["DONE"],
      repeatPenalty: 1.03,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      contextWindow: 16384,
    });
    assert.equal(onDisk.toolRetryWarningThreshold, 6);
    assert.equal(onDisk.toolRetryHardStopThreshold, 12);
    assert.deepEqual(onDisk.savedModelConfigs, [
      {
        id: "local-qwen",
        name: "Local Qwen coder",
        provider: "ollama",
        model: "qwen3-coder",
        baseUrl: "http://127.0.0.1:11434/v1",
        thinkingLevel: "high",
        modelOptions: {
          temperature: 0.15,
          topK: 30,
          maxTokens: 2048,
        },
      },
    ]);
    assert.equal(onDisk.autoDeleteEnabled, true);
    assert.equal(onDisk.autoDeleteDays, 30);
  });

  if (originalProvider === undefined) delete process.env.PINCHY_DEFAULT_PROVIDER;
  else process.env.PINCHY_DEFAULT_PROVIDER = originalProvider;
  if (originalModel === undefined) delete process.env.PINCHY_DEFAULT_MODEL;
  else process.env.PINCHY_DEFAULT_MODEL = originalModel;
  if (originalThinking === undefined) delete process.env.PINCHY_DEFAULT_THINKING_LEVEL;
  else process.env.PINCHY_DEFAULT_THINKING_LEVEL = originalThinking;
});

test("dashboard server rejects invalid settings patches without persisting earlier valid fields", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
    }, null, 2));

    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        defaultProvider: "ollama",
        defaultModel: "qwen3-coder",
        defaultThinkingLevel: "turbo",
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json() as { ok?: boolean; error?: string };
    assert.equal(payload.ok, false);
    assert.match(payload.error ?? "", /invalid thinking level/i);

    const reread = await fetch(`${baseUrl}/api/settings`).then((result) => result.json() as Promise<{
      workspaceDefaults?: { defaultProvider?: string; defaultModel?: string; savedModelConfigs?: unknown[] };
      sources?: { defaultProvider?: string; defaultModel?: string };
    }>);
    assert.deepEqual(reread.workspaceDefaults, {
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      savedModelConfigs: [],
    });
    assert.equal(reread.sources?.defaultProvider, "workspace");
    assert.equal(reread.sources?.defaultModel, "workspace");

    const runtimeConfigPath = join(cwd, ".pinchy-runtime.json");
    assert.equal(existsSync(runtimeConfigPath), true);
    assert.deepEqual(JSON.parse(readFileSync(runtimeConfigPath, "utf8")), {
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
    });
  });
});

test("dashboard server persists provider api keys in Pi auth storage and reports which providers have stored credentials", async () => {
  await withServer(async ({ baseUrl, agentDir }) => {
    const initial = await fetch(`${baseUrl}/api/settings`).then((response) => response.json() as Promise<{ storedProviderCredentials?: Record<string, boolean> }>);
    assert.deepEqual(initial.storedProviderCredentials, {});

    const updateResponse = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        defaultProvider: "openai",
        defaultModel: "gpt-5.4",
        providerApiKey: "sk-live-test-key",
      }),
    });
    assert.equal(updateResponse.status, 200);

    const updated = await updateResponse.json() as { storedProviderCredentials?: Record<string, boolean> };
    assert.equal(updated.storedProviderCredentials?.openai, true);

    const authJson = JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf8")) as Record<string, { type?: string; key?: string }>;
    assert.deepEqual(authJson.openai, {
      type: "api_key",
      key: "sk-live-test-key",
    });
  });
});

test("dashboard server discovers a local server model through the dashboard api", async () => {
  await withHttpServer(async (localServerBaseUrl) => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/settings/discover-model`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseUrl: `${localServerBaseUrl}/v1` }),
      });

      assert.equal(response.status, 200);
      const payload = await response.json() as { models: string[]; detectedModel?: string };
      assert.deepEqual(payload, {
        models: ["qwen3-coder", "deepseek-r1"],
        detectedModel: "qwen3-coder",
      });
    });
  }, (req, res) => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        data: [
          { id: "qwen3-coder" },
          { id: "deepseek-r1" },
        ],
      }));
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });
});

test("dashboard server exposes doctor state through the dashboard api", async () => {
  await withServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/doctor`);
    assert.equal(response.status, 200);
    const report = await response.json() as { cwd: string; summary: { status: string }; checks: Array<{ name: string }> };
    assert.ok(report.cwd.length > 0);
    assert.ok(report.checks.some((check) => check.name === "workspace_init"));
  });
});

test("dashboard server exposes workspace registry state through the dashboard api", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    mkdirSync(join(cwd, ".pi/skills/tdd-implementation"), { recursive: true });
    mkdirSync(join(cwd, ".pi/extensions/browser-debugger"), { recursive: true });
    writeFileSync(join(cwd, ".pi/skills/tdd-implementation/SKILL.md"), "# tdd\n");
    writeFileSync(join(cwd, ".pi/extensions/browser-debugger/index.ts"), "export default {};\n");

    const state = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ workspaces: Array<{ id: string; path: string }>; activeWorkspaceId?: string; agentResources: Array<{ type: string; name: string }> }>);

    assert.equal(state.workspaces.length, 1);
    assert.equal(state.workspaces[0]?.path, cwd);
    assert.equal(state.activeWorkspaceId, state.workspaces[0]?.id);
    assert.ok(state.agentResources.some((entry) => entry.type === "skill" && entry.name === "tdd-implementation"));
    assert.ok(state.agentResources.some((entry) => entry.type === "extension" && entry.name === "browser-debugger"));
  });
});

test("dashboard server lists, registers, activates, and deletes workspaces", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const initial = await fetch(`${baseUrl}/api/workspaces`).then((response) => response.json() as Promise<Array<{ id: string; path: string }>>);
    assert.equal(initial[0]?.path, cwd);

    const createdResponse = await fetch(`${baseUrl}/api/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/tmp/demo-repo", name: "Demo repo" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as { id: string; path: string; name: string };
    assert.equal(created.path, "/tmp/demo-repo");
    assert.equal(created.name, "Demo repo");

    const activateResponse = await fetch(`${baseUrl}/api/workspaces/${created.id}/activate`, {
      method: "POST",
    });
    assert.equal(activateResponse.status, 200);
    const activated = await activateResponse.json() as { ok: true; workspace: { id: string } };
    assert.equal(activated.workspace.id, created.id);

    const state = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ activeWorkspaceId?: string }>);
    assert.equal(state.activeWorkspaceId, created.id);

    const deleteResponse = await fetch(`${baseUrl}/api/workspaces/${created.id}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 200);
    const deleted = await deleteResponse.json() as { ok: true; workspace: { id: string }; activeWorkspaceId?: string };
    assert.equal(deleted.workspace.id, created.id);
    assert.ok(deleted.activeWorkspaceId);
    assert.notEqual(deleted.activeWorkspaceId, created.id);

    const afterDelete = await fetch(`${baseUrl}/api/workspaces`).then((response) => response.json() as Promise<Array<{ id: string; path: string }>>);
    assert.equal(afterDelete.some((workspace) => workspace.id === created.id), false);

    const finalState = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ activeWorkspaceId?: string }>);
    assert.equal(finalState.activeWorkspaceId, deleted.activeWorkspaceId);

    const deleteLastResponse = await fetch(`${baseUrl}/api/workspaces/${deleted.activeWorkspaceId}`, {
      method: "DELETE",
    });
    assert.equal(deleteLastResponse.status, 409);
  });
});

test("dashboard server exposes canonical conversation session diagnostics in dashboard and conversation state", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const conversation = createConversation(cwd, { title: "Persistent Pi thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Start the persistent Pi session",
    });

    updateRunStatus(cwd, run.id, "completed", {
      sessionPath: "/tmp/pi-thread-session.json",
    });

    const dashboardState = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{
      conversationSessions: Array<{ conversationId: string; sessionPath: string; sourceRunId?: string; updatedAt?: string }>;
    }>);
    assert.equal(dashboardState.conversationSessions.length, 1);
    assert.equal(dashboardState.conversationSessions[0]?.conversationId, conversation.id);
    assert.equal(dashboardState.conversationSessions[0]?.sessionPath, "/tmp/pi-thread-session.json");
    assert.equal(dashboardState.conversationSessions[0]?.sourceRunId, run.id);
    assert.match(dashboardState.conversationSessions[0]?.updatedAt ?? "", /^20/);
  });
});

test("dashboard server stores scoped agent guidance and exposes it in dashboard state", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const conversation = createConversation(cwd, { title: "Agent steering" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Inspect delegated task" });

    const taskResponse = await fetch(`${baseUrl}/api/actions/queue-task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Inspect delegated task",
        prompt: "Inspect delegated task",
        conversationId: conversation.id,
        runId: run.id,
      }),
    });
    assert.equal(taskResponse.status, 200);

    const state = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ tasks: Array<{ id: string; conversationId?: string; runId?: string }>; agentGuidances: Array<{ id: string }> }>);
    const task = state.tasks.find((entry) => entry.conversationId === conversation.id && entry.runId === run.id);
    assert.ok(task?.id);
    assert.deepEqual(state.agentGuidances, []);

    const guidanceResponse = await fetch(`${baseUrl}/api/actions/agent-guidance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        taskId: task.id,
        runId: run.id,
        content: "Stay scoped to the current task.",
      }),
    });
    assert.equal(guidanceResponse.status, 200);

    const stored = listAgentGuidances(cwd, { taskId: task.id });
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.content, "Stay scoped to the current task.");
    assert.equal(stored[0]?.status, "pending");

    const reread = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ agentGuidances: Array<{ taskId: string; content: string; status: string }> }>);
    assert.deepEqual(reread.agentGuidances, [
      {
        taskId: task.id,
        content: "Stay scoped to the current task.",
        status: "pending",
      },
    ].map((entry) => ({ ...stored[0], ...entry })));
  });
});

test("dashboard server exposes memory CRUD and reports memories in api state", async () => {
  await withServer(async ({ baseUrl }) => {
    const workspace = await fetch(`${baseUrl}/api/workspaces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/tmp/dashboard-memory-workspace", name: "Memory workspace" }),
    }).then((response) => response.json() as Promise<{ id: string }>);
    await fetch(`${baseUrl}/api/workspaces/${workspace.id}/activate`, { method: "POST" });

    const initialState = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ memories: Array<{ id: string }> }>);
    assert.deepEqual(initialState.memories, []);

    const invalidCreate = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", content: "Missing title" }),
    });
    assert.equal(invalidCreate.status, 400);

    const createResponse = await fetch(`${baseUrl}/api/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Watcher follow-up",
        content: "Add a regression test for the changed dashboard memory route.",
        kind: "decision",
        tags: ["dashboard", "watcher"],
        pinned: true,
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as { id: string; title: string; pinned: boolean; tags: string[]; kind: string };
    assert.equal(created.title, "Watcher follow-up");
    assert.equal(created.pinned, true);
    assert.equal(created.kind, "decision");
    assert.deepEqual(created.tags, ["dashboard", "watcher"]);

    const afterCreate = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ memories: Array<{ id: string; title: string }> }>);
    assert.equal(afterCreate.memories.length, 1);
    assert.equal(afterCreate.memories[0]?.id, created.id);

    const updateResponse = await fetch(`${baseUrl}/api/memory/${created.id}?view=detail`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated watcher follow-up", pinned: false }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json() as { id: string; title: string; pinned: boolean };
    assert.equal(updated.id, created.id);
    assert.equal(updated.title, "Updated watcher follow-up");
    assert.equal(updated.pinned, false);

    const missingDelete = await fetch(`${baseUrl}/api/memory/missing-entry`, { method: "DELETE" });
    assert.equal(missingDelete.status, 404);

    const deleteResponse = await fetch(`${baseUrl}/api/memory/${created.id}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 200);

    const finalState = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ memories: Array<{ id: string }> }>);
    assert.deepEqual(finalState.memories, []);
  });
});


test("dashboard server queues conversation-linked background tasks through dashboard actions", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const conversation = createConversation(cwd, { title: "Main orchestration thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Coordinate background work",
    });

    const response = await fetch(`${baseUrl}/api/actions/queue-task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Audit worker logs",
        prompt: "Inspect the worker logs and report bounded findings.",
        conversationId: conversation.id,
        runId: run.id,
        source: "user",
      }),
    });

    assert.equal(response.status, 200);

    const state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string; title: string; conversationId?: string; runId?: string; source?: string }> }>);
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0]?.title, "Audit worker logs");
    assert.equal(state.tasks[0]?.conversationId, conversation.id);
    assert.equal(state.tasks[0]?.runId, run.id);
    assert.equal(state.tasks[0]?.source, "user");

    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, "agent");
    assert.equal(messages[0]?.kind, undefined);
    assert.match(messages[0]?.content ?? "", /I queued a bounded background task for this thread/i);
    assert.match(messages[0]?.content ?? "", /Audit worker logs/i);
    assert.equal(messages[1]?.kind, "orchestration_update");
    assert.match(messages[1]?.content ?? "", /spawned a bounded background task/i);
    assert.match(messages[1]?.content ?? "", /execution mode: single/i);
    assert.match(messages[1]?.content ?? "", /delegated tasks created: 1/i);
    assert.match(messages[1]?.content ?? "", /1\. Audit worker logs/i);
    assert.match(messages[1]?.content ?? "", /synthesis status: waiting on 1 delegated task\(s\) before final synthesis/i);
  });
});

test("dashboard server reprioritizes, clears completed, and deletes queued tasks through dashboard actions", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const first = await fetch(`${baseUrl}/api/actions/queue-task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "First task", prompt: "Do the first task." }),
    });
    const second = await fetch(`${baseUrl}/api/actions/queue-task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Second task", prompt: "Do the second task." }),
    });
    const third = await fetch(`${baseUrl}/api/actions/queue-task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Third task", prompt: "Do the third task." }),
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 200);

    let state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string; title: string }> }>);
    const thirdTask = state.tasks.find((task) => task.title === "Third task");
    const secondTask = state.tasks.find((task) => task.title === "Second task");
    assert.deepEqual(state.tasks.map((task) => task.title), ["First task", "Second task", "Third task"]);

    const moveResponse = await fetch(`${baseUrl}/api/actions/task-reprioritize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: thirdTask?.id, direction: "top" }),
    });
    assert.equal(moveResponse.status, 200);

    state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string; title: string }> }>);
    assert.deepEqual(state.tasks.map((task) => task.title), ["Third task", "First task", "Second task"]);

    await fetch(`${baseUrl}/api/actions/task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: secondTask?.id, status: "done" }),
    });

    const clearCompletedResponse = await fetch(`${baseUrl}/api/actions/task-clear-completed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(clearCompletedResponse.status, 200);

    state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string; title: string }> }>);
    assert.deepEqual(state.tasks.map((task) => task.title), ["Third task", "First task"]);

    const deleteResponse = await fetch(`${baseUrl}/api/actions/task-delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId: thirdTask?.id }),
    });
    assert.equal(deleteResponse.status, 200);

    state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string; title: string }> }>);
    assert.deepEqual(state.tasks.map((task) => task.title), ["First task"]);
  });
});

test("dashboard server cancels a linked run when deleting a running task", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const conversation = createConversation(cwd, { title: "Queued task thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Run delegated task",
    });

    const response = await fetch(`${baseUrl}/api/actions/queue-task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Delete me",
        prompt: "Cancel this task if it is deleted.",
        conversationId: conversation.id,
        runId: run.id,
        source: "user",
      }),
    });
    assert.equal(response.status, 200);

    const queuedState = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string }> }>);
    const taskId = queuedState.tasks[0]?.id;

    await fetch(`${baseUrl}/api/actions/task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: taskId, status: "running" }),
    });

    const deleteResponse = await fetch(`${baseUrl}/api/actions/task-delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    assert.equal(deleteResponse.status, 200);

    const finalState = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string }> }>);
    assert.deepEqual(finalState.tasks, []);
    assert.equal(listRunCancellationRequests(cwd)[0]?.runId, run.id);
  });
});

test("dashboard server delegates a dependency-aware multi-task plan and appends a thread summary", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const conversation = createConversation(cwd, { title: "Main orchestration thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Coordinate background work",
    });

    const response = await fetch(`${baseUrl}/api/actions/delegate-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        runId: run.id,
        tasks: [
          { id: "inspect", title: "Audit worker logs", prompt: "Inspect the worker logs and summarize failures." },
          { id: "review", title: "Review dashboard smoke", prompt: "Run the dashboard smoke checks and report actionable issues." },
          { id: "fix", title: "Apply safe fix", prompt: "Implement the smallest safe fix after the investigation.", dependsOn: ["inspect", "review"] },
        ],
      }),
    });
    assert.equal(response.status, 200);

    const state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string; title: string; conversationId?: string; runId?: string; dependsOnTaskIds?: string[] }> }>);
    assert.equal(state.tasks.length, 3);
    assert.deepEqual(state.tasks.map((task) => task.title).sort(), ["Apply safe fix", "Audit worker logs", "Review dashboard smoke"]);
    assert.ok(state.tasks.every((task) => task.conversationId === conversation.id));
    assert.ok(state.tasks.every((task) => task.runId === run.id));

    const inspectTask = state.tasks.find((task) => task.title === "Audit worker logs");
    const reviewTask = state.tasks.find((task) => task.title === "Review dashboard smoke");
    const fixTask = state.tasks.find((task) => task.title === "Apply safe fix");
    assert.deepEqual(fixTask?.dependsOnTaskIds?.sort(), [inspectTask?.id, reviewTask?.id].sort());

    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.kind, undefined);
    assert.match(messages[0]?.content ?? "", /I delegated 3 bounded background tasks for this thread/i);
    assert.match(messages[0]?.content ?? "", /Audit worker logs, Review dashboard smoke, Apply safe fix/i);
    assert.equal(messages[1]?.kind, "orchestration_update");
    assert.match(messages[1]?.content ?? "", /delegated 3 bounded background tasks/i);
    assert.match(messages[1]?.content ?? "", /execution mode: mixed/i);
    assert.match(messages[1]?.content ?? "", /1\. Audit worker logs/i);
    assert.match(messages[1]?.content ?? "", /2\. Review dashboard smoke/i);
    assert.match(messages[1]?.content ?? "", /3\. Apply safe fix/i);
    assert.match(messages[1]?.content ?? "", /Apply safe fix waits for Audit worker logs/i);
    assert.match(messages[1]?.content ?? "", /Apply safe fix waits for Review dashboard smoke/i);
    assert.match(messages[1]?.content ?? "", /synthesis status: waiting on 3 delegated task\(s\) before final synthesis/i);
  });
});

test("dashboard server exposes task execution diagnostics including dependencies, shared worker process, and linked Pi session details", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const conversation = createConversation(cwd, { title: "Main orchestration thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Coordinate background work",
    });

    updateRunStatus(cwd, run.id, "running", {
      sessionPath: "/tmp/pi-subagent-session.json",
    });

    await fetch(`${baseUrl}/api/actions/delegate-plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        runId: run.id,
        tasks: [
          { id: "inspect", title: "Audit worker logs", prompt: "Inspect the worker logs and summarize failures." },
          { id: "fix", title: "Apply safe fix", prompt: "Implement the smallest safe fix after the investigation.", dependsOn: ["inspect"] },
        ],
      }),
    });

    const state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{
      id: string;
      title: string;
      runId?: string;
      execution?: {
        queueState: string;
        blockedByTaskTitles?: string[];
        linkedRunStatus?: string;
        sessionPath?: string;
        conversationSessionPath?: string;
        workerStatus?: string;
        workerPid?: number;
      };
    }> }>);

    const inspectTask = state.tasks.find((task) => task.title === "Audit worker logs");
    const fixTask = state.tasks.find((task) => task.title === "Apply safe fix");

    assert.equal(inspectTask?.runId, run.id);
    assert.equal(inspectTask?.execution?.queueState, "ready");
    assert.equal(inspectTask?.execution?.linkedRunStatus, undefined);
    assert.equal(inspectTask?.execution?.conversationSessionPath, "/tmp/pi-subagent-session.json");
    assert.match(inspectTask?.execution?.workerStatus ?? "", /running|stopped/);

    assert.equal(fixTask?.execution?.queueState, "waiting_for_dependencies");
    assert.deepEqual(fixTask?.execution?.blockedByTaskTitles, ["Audit worker logs"]);
    assert.match(fixTask?.execution?.workerStatus ?? "", /running|stopped/);
  });
});

test("dashboard server appends task lifecycle summaries for linked conversation tasks", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const conversation = createConversation(cwd, { title: "Main orchestration thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Coordinate background work",
    });

    await fetch(`${baseUrl}/api/actions/queue-task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Review dashboard smoke",
        prompt: "Run the dashboard smoke checks and summarize failures.",
        conversationId: conversation.id,
        runId: run.id,
        source: "user",
      }),
    });

    const state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ id: string }> }>);
    const taskId = state.tasks[0]?.id;
    assert.ok(taskId);

    const updateResponse = await fetch(`${baseUrl}/api/actions/task`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: taskId,
        status: "done",
      }),
    });
    assert.equal(updateResponse.status, 200);

    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 4);
    assert.equal(messages[2]?.kind, "orchestration_update");
    assert.match(messages[2]?.content ?? "", /background task update/i);
    assert.match(messages[2]?.content ?? "", /Review dashboard smoke/);
    assert.match(messages[2]?.content ?? "", /done/);
    assert.equal(messages[3]?.kind, "orchestration_final");
    assert.match(messages[3]?.content ?? "", /final synthesis summary/i);
    assert.match(messages[3]?.content ?? "", /ready to synthesize the final thread update/i);
  });
});

test("dashboard server can interrupt-and-steer an active delegated agent and queue a follow-up", async () => {
  const calls: string[] = [];
  await withServer(async ({ cwd, baseUrl }) => {
    const conversation = createConversation(cwd, { title: "Main orchestration thread" });
    const run = createRun(cwd, {
      conversationId: conversation.id,
      goal: "Coordinate background work",
    });

    const steerResponse = await fetch(`${baseUrl}/api/actions/agent-steer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        runId: run.id,
        content: "Stop going that direction and inspect the API route instead.",
      }),
    });
    assert.equal(steerResponse.status, 200);

    const followUpResponse = await fetch(`${baseUrl}/api/actions/agent-follow-up`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation.id,
        runId: run.id,
        content: "After that, summarize the root cause in one paragraph.",
      }),
    });
    assert.equal(followUpResponse.status, 200);

    assert.deepEqual(calls, [
      `steer:${conversation.id}:${run.id}:Stop going that direction and inspect the API route instead.`,
      `followUp:${conversation.id}:${run.id}:After that, summarize the root cause in one paragraph.`,
    ]);

    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 2);
    assert.match(messages[0]?.content ?? "", /I interrupted the delegated agent and steered it/i);
    assert.match(messages[0]?.content ?? "", /inspect the API route instead/i);
    assert.match(messages[1]?.content ?? "", /I queued a follow-up for the delegated agent/i);
    assert.match(messages[1]?.content ?? "", /summarize the root cause/i);
  }, {
    agentSessionController: {
      steerRun: async ({ conversationId, runId, content }) => {
        calls.push(`steer:${conversationId}:${runId}:${content}`);
      },
      queueFollowUp: async ({ conversationId, runId, content }) => {
        calls.push(`followUp:${conversationId}:${runId}:${content}`);
      },
    },
  });
});

test("dashboard server filters stale auto-approved approvals out of api state", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    writeFileSync(join(cwd, ".pinchy-approvals.json"), JSON.stringify([
      {
        id: "approval-hidden",
        status: "pending",
        toolName: "desktop_click",
        reason: "Click a button",
        payload: {},
      },
      {
        id: "approval-visible",
        status: "pending",
        toolName: "desktop_open_app",
        reason: "Open an app",
        payload: {},
      },
      {
        id: "approval-denied",
        status: "denied",
        toolName: "desktop_click",
        reason: "Denied click",
        payload: {},
      },
    ], null, 2));

    writeFileSync(join(cwd, ".pinchy-approval-policy.json"), JSON.stringify({
      scopes: {
        "desktop.actions": true,
      },
    }, null, 2));

    const state = await fetch(`${baseUrl}/api/state`).then((response) => response.json() as Promise<{ approvals: Array<{ id: string }> }>);

    assert.deepEqual(state.approvals.map((entry) => entry.id), ["approval-denied"]);
  });
});


test("dashboard server serves built dashboard assets before falling back to legacy html", async () => {
  await withServer(async ({ cwd, baseUrl }) => {
    const distDir = join(cwd, "apps/dashboard/dist/assets");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(cwd, "apps/dashboard/dist/index.html"), "<html><body>modern shell</body></html>");
    writeFileSync(join(distDir, "main.js"), "console.log('dashboard');");

    const shellResponse = await fetch(`${baseUrl}/`);
    assert.equal(shellResponse.status, 200);
    assert.match(await shellResponse.text(), /modern shell/);

    const assetResponse = await fetch(`${baseUrl}/assets/main.js`);
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get("content-type"), "application/javascript; charset=utf-8");
    assert.match(await assetResponse.text(), /dashboard/);
  });
});


test("dashboard server proxies control-plane requests with the active workspace header", async () => {
  await withHttpServer(async (controlPlaneApiBaseUrl) => {
    await withServer(async ({ baseUrl }) => {
      const created = await fetch(`${baseUrl}/api/workspaces`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "/tmp/demo-repo", name: "Demo repo" }),
      }).then((response) => response.json() as Promise<{ id: string }>);

      await fetch(`${baseUrl}/api/workspaces/${created.id}/activate`, { method: "POST" });

      const response = await fetch(`${baseUrl}/api/control-plane/conversations`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        workspacePath: "/tmp/demo-repo",
      });
    }, { controlPlaneApiBaseUrl });
  }, async (req, res) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      workspacePath: req.headers["x-pinchy-workspace-path"],
    }));
  });
});

test("dashboard server proxies unicode workspace paths through an ascii-safe header", async () => {
  await withHttpServer(async (controlPlaneApiBaseUrl) => {
    await withServer(async ({ baseUrl }) => {
      const unicodePath = "/tmp/Brandon’s demo repo";
      const created = await fetch(`${baseUrl}/api/workspaces`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: unicodePath, name: "Unicode repo" }),
      }).then((response) => response.json() as Promise<{ id: string }>);

      await fetch(`${baseUrl}/api/workspaces/${created.id}/activate`, { method: "POST" });

      const response = await fetch(`${baseUrl}/api/control-plane/conversations`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        workspacePath: encodeURIComponent(unicodePath),
      });
    }, { controlPlaneApiBaseUrl });
  }, async (req, res) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      workspacePath: req.headers["x-pinchy-workspace-path"],
    }));
  });
});

test("dashboard server proxies control-plane requests with method, query, body, and content type intact", async () => {
  await withHttpServer(async (controlPlaneApiBaseUrl) => {
    await withServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/control-plane/questions/question-1/reply?channel=dashboard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "Reply from watcher review" }),
      });

      assert.equal(response.status, 202);
      assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
      assert.deepEqual(await response.json(), {
        ok: true,
        method: "POST",
        url: "/questions/question-1/reply?channel=dashboard",
        contentType: "application/json",
        body: { content: "Reply from watcher review" },
      });
    }, { controlPlaneApiBaseUrl });
  }, async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    res.writeHead(202, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      method: req.method,
      url: req.url,
      contentType: req.headers["content-type"],
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    }));
  });
});
