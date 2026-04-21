import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation, createRun, listMessages } from "../apps/host/src/agent-state-store.js";
import { createDashboardServer } from "../apps/host/src/dashboard.js";

async function withServer(
  run: (args: { cwd: string; baseUrl: string }) => Promise<void>,
  options: { controlPlaneApiBaseUrl?: string } = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-dashboard-"));
  const server = createDashboardServer({ cwd, port: 0, controlPlaneApiBaseUrl: options.controlPlaneApiBaseUrl });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ cwd, baseUrl });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(cwd, { recursive: true, force: true });
  }
}

async function withHttpServer(run: (baseUrl: string) => Promise<void>, handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
      workspaceDefaults?: { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string; defaultBaseUrl?: string };
      sources?: { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string; defaultBaseUrl?: string };
    };
    assert.equal(initial.defaultProvider, "openai-codex");
    assert.equal(initial.defaultModel, "gpt-5.4");
    assert.equal(initial.defaultThinkingLevel, "medium");
    assert.equal(initial.defaultBaseUrl, undefined);
    assert.deepEqual(initial.workspaceDefaults, {});
    assert.deepEqual(initial.sources, {
      defaultProvider: "env",
      defaultModel: "env",
      defaultThinkingLevel: "env",
      defaultBaseUrl: "unset",
    });

    const updateResponse = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        defaultProvider: "ollama",
        defaultModel: "qwen3-coder",
        defaultThinkingLevel: "high",
        defaultBaseUrl: "http://127.0.0.1:11434/v1",
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json() as {
      defaultProvider?: string;
      defaultModel?: string;
      defaultThinkingLevel?: string;
      defaultBaseUrl?: string;
      workspaceDefaults?: { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string; defaultBaseUrl?: string };
      sources?: { defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string; defaultBaseUrl?: string };
    };
    assert.equal(updated.defaultProvider, "openai-codex");
    assert.equal(updated.defaultModel, "gpt-5.4");
    assert.equal(updated.defaultThinkingLevel, "medium");
    assert.equal(updated.defaultBaseUrl, "http://127.0.0.1:11434/v1");
    assert.deepEqual(updated.workspaceDefaults, {
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder",
      defaultThinkingLevel: "high",
      defaultBaseUrl: "http://127.0.0.1:11434/v1",
    });
    assert.deepEqual(updated.sources, {
      defaultProvider: "env",
      defaultModel: "env",
      defaultThinkingLevel: "env",
      defaultBaseUrl: "workspace",
    });

    const reread = await fetch(`${baseUrl}/api/settings`).then((response) => response.json() as Promise<typeof updated>);
    assert.deepEqual(reread, updated);

    const onDisk = JSON.parse(readFileSync(join(cwd, ".pinchy-runtime.json"), "utf8")) as Record<string, string>;
    assert.equal(onDisk.defaultProvider, "ollama");
    assert.equal(onDisk.defaultModel, "qwen3-coder");
    assert.equal(onDisk.defaultThinkingLevel, "high");
    assert.equal(onDisk.defaultBaseUrl, "http://127.0.0.1:11434/v1");
  });

  if (originalProvider === undefined) delete process.env.PINCHY_DEFAULT_PROVIDER;
  else process.env.PINCHY_DEFAULT_PROVIDER = originalProvider;
  if (originalModel === undefined) delete process.env.PINCHY_DEFAULT_MODEL;
  else process.env.PINCHY_DEFAULT_MODEL = originalModel;
  if (originalThinking === undefined) delete process.env.PINCHY_DEFAULT_THINKING_LEVEL;
  else process.env.PINCHY_DEFAULT_THINKING_LEVEL = originalThinking;
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
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, "agent");
    assert.match(messages[0]?.content ?? "", /spawned a bounded background task/i);
    assert.match(messages[0]?.content ?? "", /Audit worker logs/);
  });
});

test("dashboard server delegates a multi-task plan into linked bounded tasks and appends a thread summary", async () => {
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
          { title: "Audit worker logs", prompt: "Inspect the worker logs and summarize failures." },
          { title: "Review dashboard smoke", prompt: "Run the dashboard smoke checks and report actionable issues." },
        ],
      }),
    });
    assert.equal(response.status, 200);

    const state = await fetch(`${baseUrl}/api/state`).then((result) => result.json() as Promise<{ tasks: Array<{ title: string; conversationId?: string; runId?: string }> }>);
    assert.equal(state.tasks.length, 2);
    assert.deepEqual(state.tasks.map((task) => task.title).sort(), ["Audit worker logs", "Review dashboard smoke"]);
    assert.ok(state.tasks.every((task) => task.conversationId === conversation.id));
    assert.ok(state.tasks.every((task) => task.runId === run.id));

    const messages = listMessages(cwd, conversation.id);
    assert.equal(messages.length, 1);
    assert.match(messages[0]?.content ?? "", /delegated 2 bounded background tasks/i);
    assert.match(messages[0]?.content ?? "", /Audit worker logs/);
    assert.match(messages[0]?.content ?? "", /Review dashboard smoke/);
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
    assert.equal(messages.length, 2);
    assert.match(messages[1]?.content ?? "", /background task update/i);
    assert.match(messages[1]?.content ?? "", /Review dashboard smoke/);
    assert.match(messages[1]?.content ?? "", /done/);
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
