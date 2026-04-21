import test from "node:test";
import assert from "node:assert/strict";
import { createPiRunExecutor } from "../services/agent-worker/src/pi-run-executor.js";
import type { Run } from "../packages/shared/src/contracts.js";

test("Pi run executor starts a new Pi session for a fresh run", async () => {
  const calls: string[] = [];
  const sessionManagerFactory = {
    create(cwd: string) {
      calls.push(`create:${cwd}`);
      return { kind: "create", cwd };
    },
    open(sessionPath: string) {
      calls.push(`open:${sessionPath}`);
      return { kind: "open", sessionPath };
    },
  };

  const executor = createPiRunExecutor({
    agentDir: "/agent-dir",
    sessionManagerFactory,
    loadRuntimeConfig: () => ({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "medium",
    }),
    resolveModel: (provider, modelId) => {
      calls.push(`resolveModel:${provider}/${modelId}`);
      return { provider, id: modelId };
    },
    createSession: async ({ cwd, agentDir, sessionManager, model, thinkingLevel }) => {
      calls.push(`session:${cwd}:${agentDir}:${JSON.stringify(sessionManager)}:${JSON.stringify(model)}:${thinkingLevel ?? "none"}`);
      return {
        session: {
          sessionId: "pi-session-1",
          sessionFile: "/tmp/pi-session-1.json",
          async prompt(text: string) {
            calls.push(`prompt:${text}`);
          },
          async followUp(text: string) {
            calls.push(`followUp:${text}`);
          },
        },
      };
    },
  });

  const run: Run = {
    id: "run-1",
    conversationId: "conversation-1",
    goal: "Investigate the failing build",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.piSessionPath, "/tmp/pi-session-1.json");
  assert.match(result.summary, /Pi-backed run completed/);
  assert.deepEqual(calls, [
    "resolveModel:openai/gpt-5.4",
    "create:/repo",
    'session:/repo:/agent-dir:{"kind":"create","cwd":"/repo"}:{"provider":"openai","id":"gpt-5.4"}:medium',
    "prompt:Investigate the failing build",
  ]);
});

test("Pi run executor overrides the resolved model baseUrl when a local endpoint is configured", async () => {
  const calls: string[] = [];
  const executor = createPiRunExecutor({
    agentDir: "/agent-dir",
    loadRuntimeConfig: () => ({
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder",
      defaultThinkingLevel: "medium",
      defaultBaseUrl: "http://127.0.0.1:11434/v1",
    }),
    resolveModel: (provider, modelId) => {
      calls.push(`resolveModel:${provider}/${modelId}`);
      return { provider, id: modelId, baseUrl: "https://old.example.invalid" };
    },
    createSession: async ({ model }) => {
      calls.push(`model:${JSON.stringify(model)}`);
      return {
        session: {
          sessionFile: "/tmp/pi-session-local-endpoint.json",
          async prompt() {
            return undefined;
          },
          async followUp() {
            return undefined;
          },
        },
      };
    },
  });

  const run: Run = {
    id: "run-local-endpoint",
    conversationId: "conversation-1",
    goal: "Use the local endpoint",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  await executor.executeRun({ cwd: "/repo", run });

  assert.deepEqual(calls, [
    "resolveModel:ollama/qwen3-coder",
    'model:{"provider":"ollama","id":"qwen3-coder","baseUrl":"http://127.0.0.1:11434/v1"}',
  ]);
});

test("Pi run executor resumes an existing Pi session for a blocked run", async () => {
  const calls: string[] = [];
  const sessionManagerFactory = {
    create(cwd: string) {
      calls.push(`create:${cwd}`);
      return { kind: "create", cwd };
    },
    open(sessionPath: string) {
      calls.push(`open:${sessionPath}`);
      return { kind: "open", sessionPath };
    },
  };

  const executor = createPiRunExecutor({
    agentDir: "/agent-dir",
    sessionManagerFactory,
    createSession: async ({ cwd, agentDir, sessionManager }) => {
      calls.push(`session:${cwd}:${agentDir}:${JSON.stringify(sessionManager)}`);
      return {
        session: {
          sessionId: "pi-session-2",
          sessionFile: "/tmp/pi-session-2.json",
          async prompt(text: string) {
            calls.push(`prompt:${text}`);
          },
          async followUp(text: string) {
            calls.push(`followUp:${text}`);
          },
        },
      };
    },
  });

  const run: Run = {
    id: "run-2",
    conversationId: "conversation-1",
    goal: "Continue after human reply",
    kind: "resume_reply",
    status: "waiting_for_human",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    piSessionPath: "/tmp/existing-session.json",
  };

  const result = await executor.resumeRun({ cwd: "/repo", run, reply: "Use SQLite only if JSON becomes limiting." });

  assert.equal(result.piSessionPath, "/tmp/pi-session-2.json");
  assert.match(result.summary, /Pi-backed run resumed/);
  assert.deepEqual(calls, [
    "open:/tmp/existing-session.json",
    'session:/repo:/agent-dir:{"kind":"open","sessionPath":"/tmp/existing-session.json"}',
    "followUp:Use SQLite only if JSON becomes limiting.",
  ]);
});

test("Pi run executor uses plain string prompt results as the agent message", async () => {
  const executor = createPiRunExecutor({
    createSession: async () => ({
      session: {
        sessionFile: "/tmp/pi-session-string.json",
        async prompt() {
          return "PINCHY_E2E_OK The dashboard conversation loop is working.";
        },
        async followUp() {
          return undefined;
        },
      },
    }),
  });

  const run: Run = {
    id: "run-string",
    conversationId: "conversation-1",
    goal: "Reply with a short confirmation",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.kind, "completed");
  assert.equal(result.message, "PINCHY_E2E_OK The dashboard conversation loop is working.");
  assert.match(result.summary, /Pi-backed run completed/);
  assert.equal(result.piSessionPath, "/tmp/pi-session-string.json");
});

test("Pi run executor captures assistant text from streamed session events", async () => {
  const executor = createPiRunExecutor({
    createSession: async () => {
      let listener: ((event: unknown) => void) | undefined;
      return {
        session: {
          sessionFile: "/tmp/pi-session-stream.json",
          subscribe(nextListener: (event: unknown) => void) {
            listener = nextListener;
            return () => {
              listener = undefined;
            };
          },
          messages: [],
          async prompt() {
            listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "PINCHY_" } });
            listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "STREAM_OK" } });
            return undefined;
          },
          async followUp() {
            return undefined;
          },
        },
      };
    },
  });

  const run: Run = {
    id: "run-stream",
    conversationId: "conversation-1",
    goal: "Reply with the streamed confirmation",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.kind, "completed");
  assert.equal(result.message, "PINCHY_STREAM_OK");
  assert.match(result.summary, /Pi-backed run completed/);
  assert.equal(result.piSessionPath, "/tmp/pi-session-stream.json");
});

test("Pi run executor collapses exact duplicated assistant text captured from Pi", async () => {
  const executor = createPiRunExecutor({
    createSession: async () => {
      let listener: ((event: unknown) => void) | undefined;
      const session = {
        sessionFile: "/tmp/pi-session-repeat.json",
        messages: [],
        subscribe(nextListener: (event: unknown) => void) {
          listener = nextListener;
          return () => {
            listener = undefined;
          };
        },
        async prompt() {
          listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "PINCHY_CHAT_NATIVE_FINAL_OKPINCHY_CHAT_NATIVE_FINAL_OK" } });
          return undefined;
        },
        async followUp() {
          return undefined;
        },
      };
      return { session };
    },
  });

  const run: Run = {
    id: "run-repeat",
    conversationId: "conversation-1",
    goal: "Reply with a collapsed confirmation",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.kind, "completed");
  assert.equal(result.message, "PINCHY_CHAT_NATIVE_FINAL_OK");
});

test("Pi run executor prefers a non-duplicated assistant reply when stream and history match", async () => {
  const executor = createPiRunExecutor({
    createSession: async () => {
      let listener: ((event: unknown) => void) | undefined;
      const session = {
        sessionFile: "/tmp/pi-session-dedupe.json",
        messages: [{ role: "assistant", content: "PINCHY_CHAT_NATIVE_OK" }],
        subscribe(nextListener: (event: unknown) => void) {
          listener = nextListener;
          return () => {
            listener = undefined;
          };
        },
        async prompt() {
          listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "PINCHY_CHAT_" } });
          listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "NATIVE_OK" } });
          return undefined;
        },
        async followUp() {
          return undefined;
        },
      };
      return { session };
    },
  });

  const run: Run = {
    id: "run-dedupe",
    conversationId: "conversation-1",
    goal: "Reply with a non-duplicated confirmation",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.kind, "completed");
  assert.equal(result.message, "PINCHY_CHAT_NATIVE_OK");
});

test("Pi run executor falls back to the last assistant session message when prompt returns void", async () => {
  const executor = createPiRunExecutor({
    createSession: async () => ({
      session: {
        sessionFile: "/tmp/pi-session-history.json",
        messages: [
          { role: "user", content: "Previous user turn" },
          { role: "assistant", content: "PINCHY_HISTORY_OK" },
        ],
        subscribe() {
          return () => {};
        },
        async prompt() {
          return undefined;
        },
        async followUp() {
          return undefined;
        },
      },
    }),
  });

  const run: Run = {
    id: "run-history",
    conversationId: "conversation-1",
    goal: "Reply with the history confirmation",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.kind, "completed");
  assert.equal(result.message, "PINCHY_HISTORY_OK");
  assert.match(result.summary, /Pi-backed run completed/);
  assert.equal(result.piSessionPath, "/tmp/pi-session-history.json");
});

test("Pi run executor preserves structured waiting_for_human outcomes returned by Pi", async () => {
  const executor = createPiRunExecutor({
    createSession: async () => ({
      session: {
        sessionFile: "/tmp/pi-session-3.json",
        async prompt() {
          return {
            kind: "waiting_for_human",
            summary: "Blocked pending clarification",
            message: "Need a storage decision before continuing.",
            blockedReason: "Need persistence format",
            question: {
              prompt: "Should I use JSON files or SQLite?",
              priority: "high",
              channelHints: ["discord"],
            },
          };
        },
        async followUp() {
          return undefined;
        },
      },
    }),
  });

  const run: Run = {
    id: "run-3",
    conversationId: "conversation-1",
    goal: "Choose a persistence path",
    kind: "qa_cycle",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.kind, "waiting_for_human");
  assert.equal(result.piSessionPath, "/tmp/pi-session-3.json");
  assert.equal(result.blockedReason, "Need persistence format");
  assert.equal(result.question.prompt, "Should I use JSON files or SQLite?");
});

test("Pi run executor preserves structured failed outcomes returned by Pi follow-ups", async () => {
  const executor = createPiRunExecutor({
    createSession: async () => ({
      session: {
        sessionFile: "/tmp/pi-session-4.json",
        async prompt() {
          return undefined;
        },
        async followUp() {
          return {
            kind: "failed",
            summary: "Resume failed",
            message: "Pi could not continue the run.",
            error: "tool call rejected",
          };
        },
      },
    }),
  });

  const run: Run = {
    id: "run-4",
    conversationId: "conversation-1",
    goal: "Resume after a reply",
    kind: "resume_reply",
    status: "waiting_for_human",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    piSessionPath: "/tmp/existing-session.json",
  };

  const result = await executor.resumeRun({ cwd: "/repo", run, reply: "Please continue." });

  assert.equal(result.kind, "failed");
  assert.equal(result.error, "tool call rejected");
  assert.equal(result.piSessionPath, "/tmp/pi-session-4.json");
});
