import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation, createRun, listMessages, listRuns } from "../apps/host/src/agent-state-store.js";
import { processNextQueuedRun } from "../services/agent-worker/src/worker.js";
import { createSubmarineAdapter } from "../services/agent-worker/src/pi-submarine-adapter.js";
import type { Run } from "../packages/shared/src/contracts.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-submarine-adapter-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

function makeRun(id: string, goal = "Use Submarine"): Run {
  return {
    id,
    conversationId: "conversation-1",
    goal,
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-05-05T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z",
  };
}

function createFakeLiveSession(input: {
  sessionKey: string;
  events: Array<Record<string, unknown>>;
  calls: Array<{ method: string; params: Record<string, unknown> }>;
}) {
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const session = {
    child: {
      killed: false,
      stdin: {
        write(line: string) {
          const request = JSON.parse(line) as { id: string; method: string; params: Record<string, unknown> };
          input.calls.push({ method: request.method, params: request.params });
          if (request.method === "converse" && request.params.target_task_id) {
            input.events.push({
              type: "agent_completed",
              message: "Submarine resumed",
              result: "Resumed with human answer",
            });
          }
          setImmediate(() => pending.get(request.id)?.resolve({ ok: true }));
        },
      },
    },
    pending,
    queue: input.events,
  };
  return {
    sessionKey: input.sessionKey,
    session: session as never,
    config: {
      pythonPath: "python3",
      scriptModule: "submarine.serve_stdio",
      supervisor: {},
      agents: [],
    },
  };
}

test("Submarine worker adapter starts sessions with shared tools and resource context", async () => {
  await withTempDir(async (cwd) => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const adapter = createSubmarineAdapter({
      loadRuntimeConfig: () => ({
        defaultModel: "qwen3-coder",
        submarine: {
          enabled: true,
          supervisorModel: "qwen3-coder",
          supervisorBaseUrl: "http://127.0.0.1:8080/v1",
          agents: {
            worker: { model: "qwen3-coder", baseUrl: "http://127.0.0.1:8000/v1" },
          },
        },
      }),
      listToolCatalog: () => ({
        tools: [
          {
            name: "internet_search",
            label: "Internet Search",
            description: "Search the public internet.",
            source: { extensionName: "web-search", path: `${cwd}/.pi/extensions/web-search/index.ts` },
          },
        ],
        commands: [],
        listeners: [],
        errors: [],
      }),
      buildResourceContext: () => ({
        resources: [
          {
            type: "skill",
            name: "design-pattern-review",
            path: `${cwd}/.pi/skills/design-pattern-review/SKILL.md`,
            relativePath: ".pi/skills/design-pattern-review/SKILL.md",
            preview: "Design Pattern Review",
          },
        ],
        systemPrompt: "Workspace resources available to Submarine:\n- /skill:design-pattern-review",
      }),
      createSession: (_cwd, _run, config) => ({
        ...createFakeLiveSession({
          sessionKey: "submarine:run-1",
          events: [{ type: "agent_completed", message: "Submarine completed", result: "Actual assistant response" }],
          calls,
        }),
        config,
      }) as never,
    });

    const result = await adapter.executeRun({ cwd, run: makeRun("run-1") });
    const startSession = calls.find((call) => call.method === "start_session");

    assert.equal(result.kind, "completed");
    assert.equal(result.message, "Actual assistant response");
    assert.deepEqual(startSession?.params.tools, [
      {
        name: "internet_search",
        label: "Internet Search",
        description: "Search the public internet.",
      },
    ]);
    assert.deepEqual(startSession?.params.resources, [
      {
        type: "skill",
        name: "design-pattern-review",
        path: `${cwd}/.pi/skills/design-pattern-review/SKILL.md`,
        relativePath: ".pi/skills/design-pattern-review/SKILL.md",
        preview: "Design Pattern Review",
      },
    ]);
    assert.match(String((startSession?.params.supervisor as { system_prompt?: string } | undefined)?.system_prompt), /design-pattern-review/);
  });
});

test("Submarine worker adapter handles tool calls through the Node bridge before completion", async () => {
  await withTempDir(async (cwd) => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const toolCalls: Array<{ toolName: string; input: Record<string, unknown> }> = [];
    const adapter = createSubmarineAdapter({
      loadRuntimeConfig: () => ({ submarine: { enabled: true } }),
      listToolCatalog: () => ({ tools: [], commands: [], listeners: [], errors: [] }),
      buildResourceContext: () => ({ resources: [], systemPrompt: "" }),
      toolBridge: {
        async callTool(request) {
          toolCalls.push({ toolName: request.toolName, input: request.input ?? {} });
          return {
            content: [{ type: "text", text: "Search result" }],
            details: { outputPath: "artifacts/search.json" },
          };
        },
      },
      createSession: (_cwd, _run, config) => ({
        ...createFakeLiveSession({
          sessionKey: "submarine:run-tool",
          events: [
            { type: "tool_call", tool_call_id: "tool-1", tool_name: "internet_search", input: { query: "Pinchy Exa" } },
            { type: "agent_completed", message: "Done", result: "Used search result" },
          ],
          calls,
        }),
        config,
      }) as never,
    });

    const result = await adapter.executeRun({ cwd, run: makeRun("run-tool") });

    assert.equal(result.kind, "completed");
    assert.deepEqual(toolCalls, [{ toolName: "internet_search", input: { query: "Pinchy Exa" } }]);
    assert.ok(calls.some((call) => call.method === "tool_result" && (call.params.result as { details?: { outputPath?: string } }).details?.outputPath === "artifacts/search.json"));
  });
});

test("Submarine worker adapter returns structured tool errors without crashing the session", async () => {
  await withTempDir(async (cwd) => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const adapter = createSubmarineAdapter({
      loadRuntimeConfig: () => ({ submarine: { enabled: true } }),
      listToolCatalog: () => ({ tools: [], commands: [], listeners: [], errors: [] }),
      buildResourceContext: () => ({ resources: [], systemPrompt: "" }),
      toolBridge: {
        async callTool() {
          throw new Error("search provider unavailable");
        },
      },
      createSession: (_cwd, _run, config) => ({
        ...createFakeLiveSession({
          sessionKey: "submarine:run-tool-failure",
          events: [
            { type: "tool_call", tool_call_id: "tool-1", tool_name: "internet_search", input: { query: "Pinchy Exa" } },
            { type: "agent_completed", message: "Done", result: "Recovered from tool failure" },
          ],
          calls,
        }),
        config,
      }) as never,
    });

    const result = await adapter.executeRun({ cwd, run: makeRun("run-tool-failure") });
    const toolResult = calls.find((call) => call.method === "tool_result")?.params.result as { isError?: boolean; content?: Array<{ text?: string }> } | undefined;

    assert.equal(result.kind, "completed");
    assert.equal(toolResult?.isError, true);
    assert.match(toolResult?.content?.[0]?.text ?? "", /search provider unavailable/);
  });
});

test("Submarine worker adapter returns failed outcome when the bridge stdin is closed", async () => {
  await withTempDir(async (cwd) => {
    const adapter = createSubmarineAdapter({
      loadRuntimeConfig: () => ({ submarine: { enabled: true } }),
      listToolCatalog: () => ({ tools: [], commands: [], listeners: [], errors: [] }),
      buildResourceContext: () => ({ resources: [], systemPrompt: "" }),
      createSession: (_cwd, _run, config) => ({
        sessionKey: "submarine:run-epipe",
        session: {
          child: {
            killed: false,
            stdin: {
              destroyed: true,
              write() {
                throw Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
              },
            },
          },
          pending: new Map(),
          queue: [],
        },
        config,
      }) as never,
    });

    const result = await adapter.executeRun({ cwd, run: makeRun("run-epipe") });

    assert.equal(result.kind, "failed");
    assert.match(result.error ?? "", /EPIPE|stdin is closed/i);
  });
});

test("Submarine worker adapter preserves waiting task id across resume", async () => {
  await withTempDir(async (cwd) => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const adapter = createSubmarineAdapter({
      loadRuntimeConfig: () => ({ submarine: { enabled: true } }),
      listToolCatalog: () => ({ tools: [], commands: [], listeners: [], errors: [] }),
      buildResourceContext: () => ({ resources: [], systemPrompt: "" }),
      createSession: (_cwd, run, config) => ({
        ...createFakeLiveSession({
          sessionKey: `submarine:${run.id}`,
          events: [{ type: "agent_yielded", task_id: "task-123", message: "Need input" }],
          calls,
        }),
        config,
      }) as never,
    });

    const waiting = await adapter.executeRun({ cwd, run: makeRun("run-wait") });
    const resumed = await adapter.resumeRun({
      cwd,
      run: { ...makeRun("run-wait"), status: "waiting_for_human", sessionPath: "submarine:run-wait" },
      reply: "continue",
    });

    assert.equal(waiting.kind, "waiting_for_human");
    assert.equal(resumed.kind, "completed");
    assert.ok(calls.some((call) => call.method === "converse" && call.params.target_task_id === "task-123"));
  });
});

test("Submarine worker adapter converts interrupted sessions into failed outcomes", async () => {
  await withTempDir(async (cwd) => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const adapter = createSubmarineAdapter({
      loadRuntimeConfig: () => ({ submarine: { enabled: true } }),
      listToolCatalog: () => ({ tools: [], commands: [], listeners: [], errors: [] }),
      buildResourceContext: () => ({ resources: [], systemPrompt: "" }),
      createSession: (_cwd, _run, config) => ({
        ...createFakeLiveSession({
          sessionKey: "submarine:run-interrupted",
          events: [
            {
              type: "agent_failed",
              message: "Submarine process exited before completion with signal SIGTERM",
              error: "Submarine process exited before completion with signal SIGTERM",
            },
          ],
          calls,
        }),
        config,
      }) as never,
    });

    const result = await adapter.executeRun({ cwd, run: makeRun("run-interrupted") });

    assert.equal(result.kind, "failed");
    assert.match(result.error ?? "", /SIGTERM/);
  });
});

test("Submarine worker outcome persists actual assistant response for Discord and dashboard surfaces", async () => {
  await withTempDir(async (cwd) => {
    const conversation = createConversation(cwd, { title: "Submarine mapped run" });
    const run = createRun(cwd, { conversationId: conversation.id, goal: "Say hello through Submarine" });
    const summaries: string[] = [];

    await processNextQueuedRun(cwd, {
      executeRun: async () => ({
        kind: "completed",
        summary: "Submarine completed",
        message: "Hello from the actual Submarine assistant.",
      }),
      sendRunSummary: async (_cwd, input) => {
        summaries.push(input.summary);
        return undefined;
      },
    });

    const persistedRun = listRuns(cwd, conversation.id).find((entry) => entry.id === run.id);
    const agentMessage = listMessages(cwd, conversation.id).find((message) => message.runId === run.id && message.role === "agent");
    assert.equal(persistedRun?.status, "completed");
    assert.equal(agentMessage?.content, "Hello from the actual Submarine assistant.");
    assert.deepEqual(summaries, ["Hello from the actual Submarine assistant."]);
  });
});
