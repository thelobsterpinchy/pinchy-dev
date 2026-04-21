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
