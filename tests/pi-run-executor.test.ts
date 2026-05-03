import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiRunExecutor } from "../services/agent-worker/src/pi-run-executor.js";
import { requestRunCancellation } from "../apps/host/src/agent-state-store.js";
import { buildRuntimeConfigSignature } from "../apps/host/src/runtime-config-signature.js";
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
  assert.equal(calls[0], "resolveModel:openai/gpt-5.4");
  assert.equal(calls[1], "create:/repo");
  assert.equal(calls[2], 'session:/repo:/agent-dir:{"kind":"create","cwd":"/repo"}:{"provider":"openai","id":"gpt-5.4"}:medium');
  assert.match(calls[3] ?? "", /^prompt:/);
  assert.match(calls[3] ?? "", /Investigate the failing build/);
});

test("Pi run executor wraps user-prompt runs with orchestration-first delegation guidance", async () => {
  let promptText = "";
  const executor = createPiRunExecutor({
    agentDir: "/agent-dir",
    loadRuntimeConfig: () => ({}),
    resolveModel: () => undefined,
    createSession: async () => ({
      session: {
        sessionFile: "/tmp/pi-session-delegation.json",
        async prompt(text: string) {
          promptText = text;
          return undefined;
        },
        async followUp() {
          return undefined;
        },
      },
    }),
  });

  await executor.executeRun({
    cwd: "/repo",
    run: {
      id: "run-delegate",
      conversationId: "conversation-1",
      goal: "Audit the worker, inspect the dashboard, and then implement the smallest safe fix.",
      kind: "user_prompt",
      status: "queued",
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
  });

  assert.match(promptText, /delegate_task_plan/i);
  assert.match(promptText, /queue_task/i);
  assert.match(promptText, /when work can be parallelized, delegate it first/i);
  assert.match(promptText, /for coding or implementation changes, delegate to a subagent even when the work is a single non-parallelizable change/i);
  assert.match(promptText, /when a delegated agent finishes or asks a question, wake up in the main thread and relay that completion or question back to the user/i);
  assert.match(promptText, /respond first in the main thread/i);
  assert.match(promptText, /decompose the request into one or more bounded tasks/i);
  assert.match(promptText, /Audit the worker, inspect the dashboard, and then implement the smallest safe fix\./i);
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

test("Pi run executor starts a fresh session for strictly conversational follow-up user prompts", async () => {
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
  const runtimeConfig = { defaultProvider: "openai", defaultModel: "gpt-5.4", defaultThinkingLevel: "medium" as const };
  const runtimeConfigSignature = buildRuntimeConfigSignature(runtimeConfig);

  const executor = createPiRunExecutor({
    agentDir: "/agent-dir",
    sessionManagerFactory,
    loadRuntimeConfig: () => runtimeConfig,
    loadConversationRuns: () => ([
      {
        id: "run-older",
        conversationId: "conversation-1",
        goal: "Initial thread work",
        kind: "user_prompt",
        status: "completed",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:05.000Z",
        piSessionPath: "/tmp/existing-thread-session.json",
        runtimeConfigSignature,
      },
    ]),
    createSession: async ({ cwd, agentDir, sessionManager }) => {
      calls.push(`session:${cwd}:${agentDir}:${JSON.stringify(sessionManager)}`);
      return {
        session: {
          sessionId: "pi-session-thread",
          sessionFile: "/tmp/new-thread-session.json",
          isStreaming: false,
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
    id: "run-follow-up",
    conversationId: "conversation-1",
    goal: "great! how was your day?",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:01:00.000Z",
    updatedAt: "2026-04-20T00:01:00.000Z",
    runtimeConfigSignature,
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.piSessionPath, "/tmp/new-thread-session.json");
  assert.deepEqual(calls, [
    "create:/repo",
    'session:/repo:/agent-dir:{"kind":"create","cwd":"/repo"}',
    calls[2]!,
  ]);
  assert.match(calls[2] ?? "", /^prompt:/);
  assert.match(calls[2] ?? "", /great! how was your day\?/i);
  assert.match(calls[2] ?? "", /Do not call delegate_task_plan or queue_task for this request\./i);
});

test("Pi run executor reuses the latest Pi session for delegation-eligible follow-up user prompts in the same conversation", async () => {
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
  const runtimeConfig = { defaultProvider: "openai", defaultModel: "gpt-5.4", defaultThinkingLevel: "medium" as const };
  const runtimeConfigSignature = buildRuntimeConfigSignature(runtimeConfig);

  const executor = createPiRunExecutor({
    agentDir: "/agent-dir",
    sessionManagerFactory,
    loadRuntimeConfig: () => runtimeConfig,
    loadConversationRuns: () => ([
      {
        id: "run-older",
        conversationId: "conversation-1",
        goal: "Initial thread work",
        kind: "user_prompt",
        status: "completed",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:05.000Z",
        piSessionPath: "/tmp/existing-thread-session.json",
        runtimeConfigSignature,
      },
    ]),
    createSession: async ({ cwd, agentDir, sessionManager }) => {
      calls.push(`session:${cwd}:${agentDir}:${JSON.stringify(sessionManager)}`);
      return {
        session: {
          sessionId: "pi-session-thread",
          sessionFile: "/tmp/existing-thread-session.json",
          isStreaming: false,
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
    id: "run-follow-up",
    conversationId: "conversation-1",
    goal: "Investigate the dashboard bug and implement the smallest safe fix.",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:01:00.000Z",
    updatedAt: "2026-04-20T00:01:00.000Z",
    runtimeConfigSignature,
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.piSessionPath, "/tmp/existing-thread-session.json");
  assert.deepEqual(calls, [
    "open:/tmp/existing-thread-session.json",
    'session:/repo:/agent-dir:{"kind":"open","sessionPath":"/tmp/existing-thread-session.json"}',
    calls[2]!,
  ]);
  assert.match(calls[2] ?? "", /^prompt:/);
  assert.match(calls[2] ?? "", /Investigate the dashboard bug and implement the smallest safe fix\./i);
});

test("Pi run executor does not reuse an older conversation session when the runtime model settings changed", async () => {
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
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder",
      defaultThinkingLevel: "high",
    }),
    loadConversationSessionBinding: () => undefined,
    loadConversationRuns: () => ([
      {
        id: "run-older",
        conversationId: "conversation-1",
        goal: "Initial thread work",
        kind: "user_prompt",
        status: "completed",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:05.000Z",
        piSessionPath: "/tmp/existing-thread-session.json",
        runtimeConfigSignature: "stale-signature",
      },
    ]),
    resolveModel: (provider, modelId) => ({ provider, id: modelId }),
    createSession: async ({ cwd, agentDir, sessionManager, model, thinkingLevel }) => {
      calls.push(`session:${cwd}:${agentDir}:${JSON.stringify(sessionManager)}:${JSON.stringify(model)}:${thinkingLevel ?? "none"}`);
      return {
        session: {
          sessionId: "pi-session-new-thread",
          sessionFile: "/tmp/new-thread-session.json",
          isStreaming: false,
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
    id: "run-follow-up-new-model",
    conversationId: "conversation-1",
    goal: "Continue with a new model",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:01:00.000Z",
    updatedAt: "2026-04-20T00:01:00.000Z",
    runtimeConfigSignature: "current-signature",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.piSessionPath, "/tmp/new-thread-session.json");
  assert.equal(calls.some((entry) => entry.startsWith("open:")), false);
  assert.equal(calls[0], "create:/repo");
  assert.match(calls[1] ?? "", /^session:\/repo:\/agent-dir:\{"kind":"create"/);
  assert.match(calls[2] ?? "", /^prompt:/);
});

test("Pi run executor uses followUp only when the reopened Pi session is still streaming", async () => {
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

  const runtimeConfig = { defaultProvider: "openai", defaultModel: "gpt-5.4", defaultThinkingLevel: "medium" as const };
  const runtimeConfigSignature = buildRuntimeConfigSignature(runtimeConfig);
  const executor = createPiRunExecutor({
    agentDir: "/agent-dir",
    sessionManagerFactory,
    loadRuntimeConfig: () => runtimeConfig,
    loadConversationSessionBinding: () => ({ piSessionPath: "/tmp/streaming-thread-session.json", runtimeConfigSignature }),
    createSession: async ({ cwd, agentDir, sessionManager }) => {
      calls.push(`session:${cwd}:${agentDir}:${JSON.stringify(sessionManager)}`);
      return {
        session: {
          sessionId: "pi-session-streaming-thread",
          sessionFile: "/tmp/streaming-thread-session.json",
          isStreaming: true,
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
    id: "run-follow-up-streaming",
    conversationId: "conversation-1",
    goal: "Investigate the dashboard bug and implement the smallest safe fix.",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:01:00.000Z",
    updatedAt: "2026-04-20T00:01:00.000Z",
    runtimeConfigSignature,
  };

  await executor.executeRun({ cwd: "/repo", run });

  assert.match(calls[2] ?? "", /^followUp:/);
});

test("Pi run executor prefers the canonical conversation session binding over scanning prior runs", async () => {
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

  const runtimeConfig = { defaultProvider: "openai", defaultModel: "gpt-5.4", defaultThinkingLevel: "medium" as const };
  const runtimeConfigSignature = buildRuntimeConfigSignature(runtimeConfig);
  const executor = createPiRunExecutor({
    agentDir: "/agent-dir",
    sessionManagerFactory,
    loadRuntimeConfig: () => runtimeConfig,
    loadConversationSessionBinding: () => ({ piSessionPath: "/tmp/canonical-thread-session.json", runtimeConfigSignature }),
    loadConversationRuns: () => ([
      {
        id: "run-older",
        conversationId: "conversation-1",
        goal: "Older thread work",
        kind: "user_prompt",
        status: "completed",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:10.000Z",
        piSessionPath: "/tmp/non-canonical-latest-run-session.json",
        runtimeConfigSignature,
      },
    ]),
    createSession: async ({ cwd, agentDir, sessionManager }) => {
      calls.push(`session:${cwd}:${agentDir}:${JSON.stringify(sessionManager)}`);
      return {
        session: {
          sessionId: "pi-session-thread",
          sessionFile: "/tmp/canonical-thread-session.json",
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
    id: "run-follow-up-canonical",
    conversationId: "conversation-1",
    goal: "Investigate the worker and implement the smallest safe fix.",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:01:00.000Z",
    updatedAt: "2026-04-20T00:01:00.000Z",
    runtimeConfigSignature,
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.piSessionPath, "/tmp/canonical-thread-session.json");
  assert.deepEqual(calls, [
    "open:/tmp/canonical-thread-session.json",
    'session:/repo:/agent-dir:{"kind":"open","sessionPath":"/tmp/canonical-thread-session.json"}',
    calls[2]!,
  ]);
  assert.match(calls[2] ?? "", /^prompt:/);
  assert.match(calls[2] ?? "", /Investigate the worker and implement the smallest safe fix\./i);
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

test("Pi run executor collapses repeated adjacent assistant blocks inside one visible reply", async () => {
  const repeated = "Yes — I’ll inspect the logs now.";
  const executor = createPiRunExecutor({
    createSession: async () => {
      let listener: ((event: unknown) => void) | undefined;
      const session = {
        sessionFile: "/tmp/pi-session-adjacent-repeat.json",
        messages: [],
        subscribe(nextListener: (event: unknown) => void) {
          listener = nextListener;
          return () => {
            listener = undefined;
          };
        },
        async prompt() {
          listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: `${repeated}${repeated}` } });
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
    id: "run-adjacent-repeat",
    conversationId: "conversation-1",
    goal: "Reply without duplicated adjacent assistant text",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.kind, "completed");
  assert.equal(result.message, repeated);
});

test("Pi run executor collapses repeated adjacent multi-block assistant replies", async () => {
  const block = "I checked the process list and logs.\n\nShort answer: no duplicate agents.";
  const executor = createPiRunExecutor({
    createSession: async () => {
      let listener: ((event: unknown) => void) | undefined;
      const session = {
        sessionFile: "/tmp/pi-session-multi-block-repeat.json",
        messages: [],
        subscribe(nextListener: (event: unknown) => void) {
          listener = nextListener;
          return () => {
            listener = undefined;
          };
        },
        async prompt() {
          listener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: `${block}${block}` } });
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
    id: "run-multi-block-repeat",
    conversationId: "conversation-1",
    goal: "Reply without duplicated multi-block assistant text",
    kind: "user_prompt",
    status: "queued",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };

  const result = await executor.executeRun({ cwd: "/repo", run });

  assert.equal(result.kind, "completed");
  assert.equal(result.message, block);
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

test("Pi run executor aborts an active Pi session when run cancellation is requested", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-pi-abort-"));
  try {
    let aborted = false;
    const executor = createPiRunExecutor({
      createSession: async () => ({
        session: {
          sessionFile: "/tmp/pi-session-abort.json",
          async prompt() {
            await new Promise((resolve) => setTimeout(resolve, 120));
            if (aborted) {
              throw new Error("aborted");
            }
            return undefined;
          },
          async followUp() {
            return undefined;
          },
          async abort() {
            aborted = true;
          },
        },
      }),
    });

    const run: Run = {
      id: "run-abort",
      conversationId: "conversation-1",
      goal: "Abort me",
      kind: "user_prompt",
      status: "queued",
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    };

    const execution = executor.executeRun({ cwd, run });
    await new Promise((resolve) => setTimeout(resolve, 25));
    requestRunCancellation(cwd, run.id, "Conversation deleted");

    await assert.rejects(execution, /aborted/i);
    assert.equal(aborted, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("Pi run executor can steer an active session using the conversation session binding", async () => {
  const calls: string[] = [];
  const executor = createPiRunExecutor({
    loadConversationSessionBinding: () => ({
      piSessionPath: "/tmp/pi-thread-session.json",
    }),
    createSession: async () => ({
      session: {
        sessionFile: "/tmp/pi-thread-session.json",
        async prompt(_text: string, _options?: { streamingBehavior?: "steer" | "followUp" }) {
          calls.push("prompt-fallback");
          return undefined;
        },
        async steer(text: string) {
          calls.push(`steer:${text}`);
          return undefined;
        },
        async followUp() {
          return undefined;
        },
      },
    }),
  });

  await executor.steerRun({
    cwd: "/repo",
    run: {
      id: "run-steer",
      conversationId: "conversation-1",
      goal: "Active delegated work",
      kind: "user_prompt",
      status: "running",
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
    content: "Stop going that direction and inspect the API route instead.",
  });

  assert.deepEqual(calls, ["steer:Stop going that direction and inspect the API route instead."]);
});

test("Pi run executor can queue a follow-up on an active session using the conversation session binding", async () => {
  const calls: string[] = [];
  const executor = createPiRunExecutor({
    loadConversationSessionBinding: () => ({
      piSessionPath: "/tmp/pi-thread-session.json",
    }),
    createSession: async () => ({
      session: {
        sessionFile: "/tmp/pi-thread-session.json",
        async prompt() {
          return undefined;
        },
        async steer() {
          return undefined;
        },
        async followUp(text: string) {
          calls.push(`followUp:${text}`);
          return undefined;
        },
      },
    }),
  });

  await executor.queueFollowUp({
    cwd: "/repo",
    run: {
      id: "run-follow-up",
      conversationId: "conversation-1",
      goal: "Active delegated work",
      kind: "user_prompt",
      status: "running",
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
    content: "After that, summarize the root cause in one paragraph.",
  });

  assert.deepEqual(calls, ["followUp:After that, summarize the root cause in one paragraph."]);
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
