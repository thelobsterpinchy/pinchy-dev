import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  clearSubmarineSession,
  createSubmarineSession,
  getSubmarineSession,
  updateSubmarineSession,
} from "../../../apps/host/src/agent-state-store.js";
import { loadPinchyRuntimeConfig, type PinchyRuntimeConfig } from "../../../apps/host/src/runtime-config.js";
import type { Run } from "../../../packages/shared/src/contracts.js";
import type { PiRunExecutionResult } from "./run-outcomes.js";

type RpcEnvelope = {
  type: "response" | "event";
  id?: string;
  result?: unknown;
  error?: string;
  event?: Record<string, unknown>;
};

type Deferred = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

type SubmarineSessionConfig = {
  pythonPath: string;
  scriptModule: string;
  supervisor: {
    base_url?: string;
    api_key?: string;
    model?: string;
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
  };
  agents: Array<{
    role: string;
    model?: string;
    base_url?: string;
    api_key?: string;
    system_prompt?: string;
    timeout?: number;
    workspace?: string;
    backend?: {
      type?: string;
      command?: string | string[];
      python_path?: string;
      script_module?: string;
      env?: Record<string, string>;
      extra?: Record<string, unknown>;
    };
  }>;
  runKindRoutes?: Record<string, { role?: string; model?: string }>;
};

type CreateSubmarineAdapterDependencies = {
  loadRuntimeConfig?: (cwd: string) => PinchyRuntimeConfig;
};

type LiveSession = {
  child: ChildProcessWithoutNullStreams;
  pending: Map<string, Deferred>;
  queue: Array<any>;
};

function isEvent(value: unknown): value is { type: string; message?: string; task_id?: string; error?: string; result?: string } {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

export function createSubmarineAdapter(dependencies: CreateSubmarineAdapterDependencies = {}) {
  const loadRuntimeConfig = dependencies.loadRuntimeConfig ?? loadPinchyRuntimeConfig;
  const sessions = new Map<string, LiveSession>();

  function buildConfig(cwd: string): SubmarineSessionConfig {
    const runtimeConfig = loadRuntimeConfig(cwd);
    const submarine = runtimeConfig.submarine ?? { enabled: false };
    return {
      pythonPath: submarine.pythonPath ?? "python3",
      scriptModule: submarine.scriptModule ?? "submarine.serve_stdio",
      supervisor: {
        base_url: submarine.supervisorBaseUrl,
        api_key: submarine.supervisorApiKey,
        model: submarine.supervisorModel ?? runtimeConfig.defaultModel,
      },
      agents: Object.entries(submarine.agents ?? {}).map(([role, agent]) => ({
        role,
        model: agent.model,
        base_url: agent.baseUrl,
        api_key: agent.apiKey,
        system_prompt: agent.systemPrompt,
        timeout: agent.timeout,
        workspace: agent.workspace,
        backend: agent.backend ? {
          type: agent.backend.type,
          command: agent.backend.command,
          python_path: agent.backend.pythonPath,
          script_module: agent.backend.scriptModule,
          env: agent.backend.env,
          extra: agent.backend.extra,
        } : undefined,
      })),
      runKindRoutes: submarine.runKindRoutes,
    };
  }

  function createLiveSession(cwd: string, run: Run) {
    const config = buildConfig(cwd);
    const child = spawn(config.pythonPath, ["-m", config.scriptModule], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    const sessionKey = `submarine:${run.id}`;
    const pending = new Map<string, Deferred>();
    const queue: Array<any> = [];
    let buffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      while (true) {
        const index = buffer.indexOf("\n");
        if (index === -1) break;
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const envelope = JSON.parse(line) as RpcEnvelope;
        if (envelope.type === "response" && envelope.id) {
          const deferred = pending.get(envelope.id);
          if (!deferred) continue;
          pending.delete(envelope.id);
          if (envelope.error) deferred.reject(new Error(envelope.error));
          else deferred.resolve(envelope.result);
          continue;
        }
        if (envelope.type === "event" && envelope.event) {
          queue.push(envelope.event);
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) queue.push({ type: "stderr", message: text });
    });

    const session = { child, pending, queue };
    sessions.set(sessionKey, session);
    createSubmarineSession(cwd, { runId: run.id, sessionKey });
    return { sessionKey, session, config };
  }

  function ensureSession(cwd: string, run: Run) {
    const metadata = getSubmarineSession(cwd, run.id);
    if (metadata) {
      const existing = sessions.get(metadata.sessionKey);
      if (existing && !existing.child.killed) {
        return { sessionKey: metadata.sessionKey, waitingTaskId: metadata.waitingTaskId, session: existing, config: buildConfig(cwd) };
      }
    }
    return createLiveSession(cwd, run);
  }

  async function rpc(session: LiveSession, method: string, params: Record<string, unknown>) {
    const id = randomUUID();
    const promise = new Promise<any>((resolve, reject) => {
      session.pending.set(id, { resolve, reject });
    });
    session.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    return promise;
  }

  async function waitForOutcome(cwd: string, run: Run, sessionKey: string): Promise<PiRunExecutionResult> {
    const session = sessions.get(sessionKey);
    if (!session) throw new Error(`Missing submarine session: ${sessionKey}`);

    while (true) {
      const event = session.queue.shift();
      if (!event) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      if (!isEvent(event)) continue;
      if (event.type === "agent_yielded") {
        updateSubmarineSession(cwd, run.id, {
          waitingTaskId: event.task_id,
          lastTaskMessage: event.message,
        });
        return {
          kind: "waiting_for_human",
          summary: event.message ?? "Subagent needs input",
          message: event.message ?? "Subagent needs input",
          blockedReason: event.message ?? "Subagent needs input",
          question: { prompt: event.message ?? "Subagent needs input" },
          sessionPath: sessionKey,
        };
      }
      if (event.type === "agent_completed") {
        clearSubmarineSession(cwd, run.id);
        sessions.delete(sessionKey);
        return {
          kind: "completed",
          summary: event.message ?? "Subagent completed",
          message: event.result ?? event.message ?? "Subagent completed",
          sessionPath: sessionKey,
        };
      }
      if (event.type === "agent_failed") {
        clearSubmarineSession(cwd, run.id);
        sessions.delete(sessionKey);
        return {
          kind: "failed",
          summary: event.message ?? "Subagent failed",
          message: event.message ?? "Subagent failed",
          error: event.error,
          sessionPath: sessionKey,
        };
      }
    }
  }

  return {
    async executeRun({ cwd, run }: { cwd: string; run: Run }): Promise<PiRunExecutionResult> {
      const created = createLiveSession(cwd, run);
      await rpc(created.session, "start_session", {
        supervisor: created.config.supervisor,
        agents: created.config.agents,
        run_kind_routes: created.config.runKindRoutes,
        shared_memory: { run_id: run.id, run_kind: run.kind, conversation_id: run.conversationId },
      });
      await rpc(created.session, "converse", { message: run.goal });
      return waitForOutcome(cwd, run, created.sessionKey);
    },
    async resumeRun({ cwd, run, reply }: { cwd: string; run: Run; reply: string }): Promise<PiRunExecutionResult> {
      const created = ensureSession(cwd, run);
      const metadata = getSubmarineSession(cwd, run.id);
      await rpc(created.session, "converse", {
        message: reply,
        target_task_id: metadata?.waitingTaskId,
      });
      updateSubmarineSession(cwd, run.id, {
        waitingTaskId: undefined,
      });
      return waitForOutcome(cwd, run, created.sessionKey);
    },
  };
}
