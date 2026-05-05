import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  clearSubmarineSession,
  createSubmarineSession,
  getSubmarineSession,
  updateSubmarineSession,
} from "../../../apps/host/src/agent-state-store.js";
import { loadPinchyRuntimeConfig, type PinchyRuntimeConfig } from "../../../apps/host/src/runtime-config.js";
import { buildSubmarinePythonEnv } from "../../../apps/host/src/submarine-python.js";
import { createExtensionBackedToolCatalog, type ToolCatalogSnapshot } from "../../../apps/host/src/tool-catalog.js";
import type { Run } from "../../../packages/shared/src/contracts.js";
import type { PiRunExecutionResult } from "./run-outcomes.js";
import { buildSubmarineResourceContext, type SubmarineResourceContext } from "./submarine-resource-bridge.js";
import { createSubmarineToolBridge, type SubmarineToolBridge } from "./submarine-tool-bridge.js";

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
  tools?: Array<{
    name: string;
    label?: string;
    description?: string;
    prompt_snippet?: string;
    parameters?: unknown;
  }>;
  resources?: SubmarineResourceContext["resources"];
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
  createSession?: (cwd: string, run: Run, config: SubmarineSessionConfig) => LiveSessionBinding;
  toolBridge?: SubmarineToolBridge;
  listToolCatalog?: (cwd: string) => Promise<ToolCatalogSnapshot> | ToolCatalogSnapshot;
  buildResourceContext?: (cwd: string) => SubmarineResourceContext;
};

type LiveSession = {
  child: ChildProcessWithoutNullStreams;
  pending: Map<string, Deferred>;
  queue: Array<any>;
  stderrTail?: string[];
  exited?: boolean;
  exitError?: Error;
};

type LiveSessionBinding = {
  sessionKey: string;
  session: LiveSession;
  config: SubmarineSessionConfig;
};

type SubmarineEvent = {
  type: string;
  message?: string;
  task_id?: string;
  error?: string;
  result?: string;
  tool_call_id?: string;
  tool_name?: string;
  input?: Record<string, unknown>;
};

function isEvent(value: unknown): value is SubmarineEvent {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

export function createSubmarineAdapter(dependencies: CreateSubmarineAdapterDependencies = {}) {
  const loadRuntimeConfig = dependencies.loadRuntimeConfig ?? loadPinchyRuntimeConfig;
  const toolBridge = dependencies.toolBridge ?? createSubmarineToolBridge();
  const listToolCatalog = dependencies.listToolCatalog ?? ((cwd: string) => createExtensionBackedToolCatalog().listTools(cwd));
  const buildResourceContext = dependencies.buildResourceContext ?? buildSubmarineResourceContext;
  const sessions = new Map<string, LiveSession>();

  function failPendingRequests(session: LiveSession, error: Error) {
    for (const [id, deferred] of session.pending) {
      session.pending.delete(id);
      deferred.reject(error);
    }
  }

  function failSession(session: LiveSession, error: Error) {
    session.exited = true;
    session.exitError = error;
    failPendingRequests(session, error);
  }

  function appendTail(lines: string[] | undefined, text: string, maxLines = 20) {
    if (!lines) return;
    for (const line of text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
      lines.push(line);
    }
    if (lines.length > maxLines) {
      lines.splice(0, lines.length - maxLines);
    }
  }

  function formatSessionError(session: LiveSession, message: string) {
    const stderr = session.stderrTail?.join("\n").trim();
    return stderr ? `${message}\nSubmarine stderr:\n${stderr}` : message;
  }

  function makeFailedOutcome(cwd: string, run: Run, sessionKey: string, error: unknown): PiRunExecutionResult {
    clearSubmarineSession(cwd, run.id);
    sessions.delete(sessionKey);
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: "failed",
      summary: "Submarine execution failed before the agent could respond",
      message,
      error: message,
      sessionPath: sessionKey,
    };
  }

  async function buildConfig(cwd: string): Promise<SubmarineSessionConfig> {
    const runtimeConfig = loadRuntimeConfig(cwd);
    const submarine = runtimeConfig.submarine ?? { enabled: false };
    const resourceContext = buildResourceContext(cwd);
    const toolCatalog = await listToolCatalog(cwd);
    const supervisorSystemPrompt = resourceContext.systemPrompt;
    return {
      pythonPath: submarine.pythonPath ?? "python3",
      scriptModule: submarine.scriptModule ?? "submarine.serve_stdio",
      supervisor: {
        base_url: submarine.supervisorBaseUrl,
        api_key: submarine.supervisorApiKey,
        model: submarine.supervisorModel ?? runtimeConfig.defaultModel,
        system_prompt: supervisorSystemPrompt || undefined,
      },
      tools: toolCatalog.tools.map((tool) => ({
        name: tool.name,
        ...(tool.label ? { label: tool.label } : {}),
        ...(tool.description ? { description: tool.description } : {}),
        ...(tool.promptSnippet !== undefined ? { prompt_snippet: tool.promptSnippet } : {}),
        ...(tool.parameters !== undefined ? { parameters: tool.parameters } : {}),
      })),
      resources: resourceContext.resources,
      agents: Object.entries(submarine.agents ?? {}).map(([role, agent]) => ({
        role,
        model: agent.model,
        base_url: agent.baseUrl,
        api_key: agent.apiKey,
        system_prompt: [agent.systemPrompt, resourceContext.systemPrompt].filter((entry): entry is string => Boolean(entry?.trim())).join("\n\n") || undefined,
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

  function createProcessLiveSession(cwd: string, run: Run, config: SubmarineSessionConfig): LiveSessionBinding {
    const child = spawn(config.pythonPath, ["-m", config.scriptModule], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildSubmarinePythonEnv(process.env),
    });
    const sessionKey = `submarine:${run.id}`;
    const pending = new Map<string, Deferred>();
    const queue: Array<any> = [];
    const stderrTail: string[] = [];
    const session: LiveSession = { child, pending, queue, stderrTail };
    let buffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      while (true) {
        const index = buffer.indexOf("\n");
        if (index === -1) break;
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let envelope: RpcEnvelope;
        try {
          envelope = JSON.parse(line) as RpcEnvelope;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const sessionError = new Error(formatSessionError(session, `Submarine emitted invalid JSON on stdout: ${message}`));
          queue.push({
            type: "agent_failed",
            message: sessionError.message,
            error: sessionError.message,
          });
          failSession(session, sessionError);
          continue;
        }
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
      if (text) {
        appendTail(stderrTail, text);
        queue.push({ type: "stderr", message: text });
      }
    });

    child.stdin.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const sessionError = new Error(formatSessionError(session, `Submarine stdin write failed: ${message}`));
      queue.push({
        type: "agent_failed",
        message: sessionError.message,
        error: sessionError.message,
      });
      failSession(session, sessionError);
    });
    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const sessionError = new Error(formatSessionError(session, `Submarine process failed to start: ${message}`));
      queue.push({
        type: "agent_failed",
        message: sessionError.message,
        error: sessionError.message,
      });
      failSession(session, sessionError);
    });
    child.on("exit", (code, signal) => {
      const errorMessage = `Submarine process exited before completion${signal ? ` with signal ${signal}` : ` with code ${code ?? "unknown"}`}`;
      const formattedError = formatSessionError(session, errorMessage);
      queue.push({
        type: "agent_failed",
        message: formattedError,
        error: formattedError,
      });
      failSession(session, new Error(formattedError));
    });
    sessions.set(sessionKey, session);
    createSubmarineSession(cwd, { runId: run.id, sessionKey });
    return { sessionKey, session, config };
  }

  async function createLiveSession(cwd: string, run: Run) {
    const config = await buildConfig(cwd);
    if (!dependencies.createSession) return createProcessLiveSession(cwd, run, config);
    const binding = dependencies.createSession(cwd, run, config);
    sessions.set(binding.sessionKey, binding.session);
    createSubmarineSession(cwd, { runId: run.id, sessionKey: binding.sessionKey });
    return binding;
  }

  async function ensureSession(cwd: string, run: Run) {
    const metadata = getSubmarineSession(cwd, run.id);
    if (metadata) {
      const existing = sessions.get(metadata.sessionKey);
      if (existing && !existing.child.killed) {
        return { sessionKey: metadata.sessionKey, waitingTaskId: metadata.waitingTaskId, session: existing, config: await buildConfig(cwd) };
      }
    }
    return createLiveSession(cwd, run);
  }

  async function rpc(session: LiveSession, method: string, params: Record<string, unknown>) {
    if (session.exited) {
      throw session.exitError ?? new Error("Submarine process is no longer available.");
    }
    const id = randomUUID();
    return new Promise<any>((resolve, reject) => {
      session.pending.set(id, { resolve, reject });
      const line = JSON.stringify({ id, method, params }) + "\n";
      try {
        const accepted = session.child.stdin.write(line, (error) => {
          if (!error) return;
          session.pending.delete(id);
          const sessionError = new Error(formatSessionError(session, error.message));
          failSession(session, sessionError);
          reject(sessionError);
        });
        if (!accepted && session.child.stdin.destroyed) {
          session.pending.delete(id);
          const sessionError = new Error(formatSessionError(session, "Submarine stdin is closed."));
          failSession(session, sessionError);
          reject(sessionError);
        }
      } catch (error) {
        session.pending.delete(id);
        const message = error instanceof Error ? error.message : String(error);
        const sessionError = new Error(formatSessionError(session, message));
        failSession(session, sessionError);
        reject(sessionError);
      }
    });
  }

  async function waitForOutcome(cwd: string, run: Run, sessionKey: string): Promise<PiRunExecutionResult> {
    const session = sessions.get(sessionKey);
    if (!session) throw new Error(`Missing submarine session: ${sessionKey}`);

    while (true) {
      const event = session.queue.shift();
      if (!event) {
        if (session.exited) {
          return makeFailedOutcome(cwd, run, sessionKey, session.exitError ?? new Error("Submarine process exited before completion."));
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        continue;
      }
      if (!isEvent(event)) continue;
      if (event.type === "tool_call") {
        const toolName = event.tool_name;
        if (!toolName) {
          await rpc(session, "tool_result", {
            tool_call_id: event.tool_call_id,
            result: {
              content: [{ type: "text", text: "Submarine tool call missing tool_name." }],
              isError: true,
            },
          });
          continue;
        }
        let result;
        try {
          result = await toolBridge.callTool({
            cwd,
            toolName,
            input: event.input ?? {},
            toolCallId: event.tool_call_id,
            runId: run.id,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result = {
            content: [{ type: "text", text: `Tool call failed: ${message}` }],
            isError: true,
            details: { toolName, error: message },
          };
        }
        await rpc(session, "tool_result", {
          tool_call_id: event.tool_call_id,
          result,
        });
        continue;
      }
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
      const created = await createLiveSession(cwd, run);
      try {
        await rpc(created.session, "start_session", {
          supervisor: created.config.supervisor,
          tools: created.config.tools,
          resources: created.config.resources,
          agents: created.config.agents,
          run_kind_routes: created.config.runKindRoutes,
          shared_memory: { run_id: run.id, run_kind: run.kind, conversation_id: run.conversationId },
        });
        await rpc(created.session, "converse", { message: run.goal });
        return await waitForOutcome(cwd, run, created.sessionKey);
      } catch (error) {
        return makeFailedOutcome(cwd, run, created.sessionKey, error);
      }
    },
    async resumeRun({ cwd, run, reply }: { cwd: string; run: Run; reply: string }): Promise<PiRunExecutionResult> {
      const created = await ensureSession(cwd, run);
      const metadata = getSubmarineSession(cwd, run.id);
      try {
        await rpc(created.session, "converse", {
          message: reply,
          target_task_id: metadata?.waitingTaskId,
        });
        updateSubmarineSession(cwd, run.id, {
          waitingTaskId: undefined,
        });
        return await waitForOutcome(cwd, run, created.sessionKey);
      } catch (error) {
        return makeFailedOutcome(cwd, run, created.sessionKey, error);
      }
    },
  };
}
