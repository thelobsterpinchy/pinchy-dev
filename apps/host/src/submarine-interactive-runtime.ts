import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  AgentSession,
  type AgentSessionRuntimeDiagnostic,
  type AgentSessionServices,
  type CreateAgentSessionRuntimeResult,
  createExtensionRuntime,
} from "@mariozechner/pi-coding-agent";
import { loadPinchyRuntimeConfig } from "./runtime-config.js";
import { buildSubmarinePythonEnv } from "./submarine-python.js";
import { createExtensionBackedToolCatalog, type ToolCatalogSnapshot } from "./tool-catalog.js";
import { createExtensionBackedToolExecutor, type ToolExecutor } from "./tool-executor.js";
import { buildSubmarineResourceContext, type SubmarineResourceContext } from "../../../services/agent-worker/src/submarine-resource-bridge.js";
import type { PinchyRuntimeConfig } from "./runtime-config.js";

type RpcEnvelope = {
  type: "response" | "event";
  id?: string;
  result?: any;
  error?: string;
  event?: Record<string, any>;
};

type PendingRpc = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

type AgentListener = (event: any) => void | Promise<void>;

type QueueMode = "all" | "one-at-a-time";

function textMessage(role: "user" | "assistant", text: string, extras: Record<string, any> = {}) {
  return {
    role,
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    ...extras,
  };
}

export async function buildSubmarineInteractiveStartSessionPayload(input: {
  cwd: string;
  runtimeConfig: PinchyRuntimeConfig;
  toolCatalog?: ToolCatalogSnapshot;
  resourceContext?: SubmarineResourceContext;
}) {
  const submarine = input.runtimeConfig.submarine!;
  const toolCatalog = input.toolCatalog ?? await createExtensionBackedToolCatalog().listTools(input.cwd);
  const resourceContext = input.resourceContext ?? buildSubmarineResourceContext(input.cwd);
  return {
    supervisor: {
      model: submarine.supervisorModel ?? input.runtimeConfig.defaultModel,
      base_url: submarine.supervisorBaseUrl,
      api_key: submarine.supervisorApiKey,
      system_prompt: resourceContext.systemPrompt,
    },
    tools: toolCatalog.tools.map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      prompt_snippet: tool.promptSnippet,
      parameters: tool.parameters,
    })),
    resources: resourceContext.resources,
    agents: Object.entries(submarine.agents ?? {}).map(([role, agent]) => ({
      role,
      model: agent.model,
      base_url: agent.baseUrl,
      api_key: agent.apiKey,
      system_prompt: [agent.systemPrompt, resourceContext.systemPrompt].filter((entry): entry is string => Boolean(entry?.trim())).join("\n\n") || undefined,
      timeout: agent.timeout,
    })),
    run_kind_routes: submarine.runKindRoutes,
    shared_memory: {},
  };
}

export async function handleSubmarineInteractiveToolCall(input: {
  cwd: string;
  event: Record<string, any>;
  sendToolResult: (params: Record<string, unknown>) => Promise<unknown>;
  toolExecutor?: ToolExecutor;
  signal?: AbortSignal;
}) {
  if (input.event.type !== "tool_call") return false;
  const toolCallId = typeof input.event.tool_call_id === "string" ? input.event.tool_call_id : undefined;
  const toolName = typeof input.event.tool_name === "string" ? input.event.tool_name : undefined;
  if (!toolName) {
    await input.sendToolResult({
      tool_call_id: toolCallId,
      result: {
        content: [{ type: "text", text: "Submarine tool call missing tool_name." }],
        isError: true,
      },
    });
    return true;
  }

  const toolExecutor = input.toolExecutor ?? createExtensionBackedToolExecutor();
  let result;
  try {
    result = await toolExecutor.executeTool({
      cwd: input.cwd,
      toolName,
      input: input.event.input && typeof input.event.input === "object" ? input.event.input : {},
      toolCallId,
      signal: input.signal,
      hasUI: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = {
      content: [{ type: "text", text: `Tool call failed: ${message}` }],
      isError: true,
      details: { toolName, error: message },
    };
  }
  await input.sendToolResult({
    tool_call_id: toolCallId,
    result,
  });
  return true;
}

class SubmarineBridgeClient {
  private child;
  private buffer = "";
  private pending = new Map<string, PendingRpc>();
  private eventListeners = new Set<(event: Record<string, any>) => void>();
  private stderrTail: string[] = [];
  private exited = false;
  private exitError?: Error;

  constructor(private cwd: string) {
    const runtimeConfig = loadPinchyRuntimeConfig(cwd);
    const submarine = runtimeConfig.submarine;
    if (!submarine?.enabled) {
      throw new Error("Submarine interactive runtime requested but submarine is not enabled.");
    }
    this.child = spawn(submarine.pythonPath ?? "python3", ["-m", submarine.scriptModule ?? "submarine.serve_stdio"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildSubmarinePythonEnv(process.env),
    });

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      while (true) {
        const index = this.buffer.indexOf("\n");
        if (index === -1) break;
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!line) continue;
        let envelope: RpcEnvelope;
        try {
          envelope = JSON.parse(line) as RpcEnvelope;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.failPending(new Error(this.formatProcessError(`Submarine emitted invalid JSON on stdout: ${message}`)));
          continue;
        }
        if (envelope.type === "response" && envelope.id) {
          const deferred = this.pending.get(envelope.id);
          if (!deferred) continue;
          this.pending.delete(envelope.id);
          if (envelope.error) deferred.reject(new Error(envelope.error));
          else deferred.resolve(envelope.result);
          continue;
        }
        if (envelope.type === "event" && envelope.event) {
          for (const listener of this.eventListeners) listener(envelope.event);
        }
      }
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
        this.stderrTail.push(line);
      }
      if (this.stderrTail.length > 20) {
        this.stderrTail.splice(0, this.stderrTail.length - 20);
      }
      process.stderr.write(`${text}\n`);
    });
    this.child.stdin.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.failPending(new Error(this.formatProcessError(`Submarine stdin write failed: ${message}`)));
    });
    this.child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.failPending(new Error(this.formatProcessError(`Submarine process failed to start: ${message}`)));
    });
    this.child.on("exit", (code, signal) => {
      this.failPending(new Error(this.formatProcessError(`Submarine process exited${signal ? ` with signal ${signal}` : ` with code ${code ?? "unknown"}`}`)));
    });
  }

  private formatProcessError(message: string) {
    const stderr = this.stderrTail.join("\n").trim();
    return stderr ? `${message}\nSubmarine stderr:\n${stderr}` : message;
  }

  private failPending(error: Error) {
    this.exited = true;
    this.exitError = error;
    for (const [id, deferred] of this.pending) {
      this.pending.delete(id);
      deferred.reject(error);
    }
  }

  onEvent(listener: (event: Record<string, any>) => void) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  rpc(method: string, params: Record<string, unknown>) {
    if (this.exited) {
      return Promise.reject(this.exitError ?? new Error("Submarine process is no longer available."));
    }
    const id = randomUUID();
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        const accepted = this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n", (error) => {
          if (!error) return;
          this.pending.delete(id);
          const processError = new Error(this.formatProcessError(error.message));
          this.failPending(processError);
          reject(processError);
        });
        if (!accepted && this.child.stdin.destroyed) {
          this.pending.delete(id);
          const processError = new Error(this.formatProcessError("Submarine stdin is closed."));
          this.failPending(processError);
          reject(processError);
        }
      } catch (error) {
        this.pending.delete(id);
        const message = error instanceof Error ? error.message : String(error);
        const processError = new Error(this.formatProcessError(message));
        this.failPending(processError);
        reject(processError);
      }
    });
  }

  async startSession() {
    const runtimeConfig = loadPinchyRuntimeConfig(this.cwd);
    await this.rpc("start_session", await buildSubmarineInteractiveStartSessionPayload({ cwd: this.cwd, runtimeConfig }));
  }

  async converse(message: string, targetTaskId?: string) {
    return this.rpc("converse", {
      message,
      target_task_id: targetTaskId,
    });
  }

  async sendToolResult(params: Record<string, unknown>) {
    return this.rpc("tool_result", params);
  }

  async stop() {
    try {
      await this.rpc("stop", {});
    } finally {
      this.child.kill();
    }
  }
}

class SubmarineInteractiveAgent {
  readonly sessionId = `submarine-${randomUUID()}`;
  private listeners = new Set<AgentListener>();
  private steeringQueue: any[] = [];
  private followUpQueue: any[] = [];
  private activeAbortController?: AbortController;
  private activeRun?: Promise<void>;
  private waitingTaskId?: string;
  private unsubscribeBridge?: () => void;
  private initialized = false;

  steeringMode: QueueMode = "all";
  followUpMode: QueueMode = "all";
  beforeToolCall?: any;
  afterToolCall?: any;

  state: any;

  constructor(private cwd: string) {
    const runtimeConfig = loadPinchyRuntimeConfig(cwd);
    this.bridge = new SubmarineBridgeClient(cwd);
    this.state = {
      systemPrompt: "",
      model: {
        id: runtimeConfig.submarine?.supervisorModel ?? runtimeConfig.defaultModel,
        name: runtimeConfig.submarine?.supervisorModel ?? runtimeConfig.defaultModel,
        provider: "submarine",
      },
      thinkingLevel: "low",
      tools: [],
      messages: [],
      isStreaming: false,
      streamingMessage: undefined,
      pendingToolCalls: new Set<string>(),
      errorMessage: undefined,
    };
  }

  private bridge?: SubmarineBridgeClient;

  subscribe(listener: AgentListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async emit(event: any) {
    switch (event.type) {
      case "message_start":
      case "message_update":
        this.state.streamingMessage = event.message;
        break;
      case "message_end":
        this.state.streamingMessage = undefined;
        this.state.messages.push(event.message);
        break;
      case "agent_end":
        break;
    }
    for (const listener of this.listeners) {
      await listener(event);
    }
  }

  private extractText(message: any) {
    if (typeof message === "string") return message;
    if (Array.isArray(message)) {
      return message
        .flatMap((entry) => (entry?.content ?? []))
        .filter((part: any) => part?.type === "text")
        .map((part: any) => part.text)
        .join("\n");
    }
    if (message?.content) {
      return (message.content as any[])
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("\n");
    }
    return "";
  }

  private async ensureInitialized() {
    if (this.initialized) return;
    await this.bridge!.startSession();
    this.unsubscribeBridge = this.bridge!.onEvent((event) => {
      void handleSubmarineInteractiveToolCall({
        cwd: this.cwd,
        event,
        sendToolResult: (params) => this.bridge!.sendToolResult(params),
        signal: this.activeAbortController?.signal,
      });
      if (event.type === "agent_yielded") {
        this.waitingTaskId = event.task_id;
      }
      if (event.type === "agent_completed" || event.type === "agent_failed") {
        this.waitingTaskId = undefined;
      }
    });
    this.initialized = true;
  }

  private async runConversation(text: string) {
    await this.ensureInitialized();
    this.state.isStreaming = true;
    this.activeAbortController = new AbortController();

    const userMessage = textMessage("user", text);
    await this.emit({ type: "agent_start" });
    await this.emit({ type: "message_start", message: userMessage });
    await this.emit({ type: "message_end", message: userMessage });

    const result = await this.bridge!.converse(text, this.waitingTaskId);
    const responseText = result?.response?.response ?? result?.response?.text ?? result?.response?.message ?? "";
    const assistantMessage = textMessage("assistant", responseText, { stopReason: "end_turn" });

    await this.emit({ type: "turn_start" });
    await this.emit({ type: "message_start", message: assistantMessage });
    await this.emit({ type: "message_end", message: assistantMessage });
    await this.emit({ type: "turn_end", message: assistantMessage, toolResults: [] });
    await this.emit({ type: "agent_end", messages: [...this.state.messages] });

    this.state.isStreaming = false;
    this.state.streamingMessage = undefined;
    this.activeAbortController = undefined;

    const queued = this.steeringQueue.splice(0);
    if (queued.length > 0) {
      const next = this.extractText(queued[0]);
      if (next) {
        await this.runConversation(next);
      }
    }
  }

  async prompt(message: any) {
    const text = this.extractText(message);
    this.activeRun = this.runConversation(text);
    await this.activeRun;
  }

  async continue() {
    if (!this.hasQueuedMessages()) return;
    const queue = this.steeringQueue.length > 0 ? this.steeringQueue : this.followUpQueue;
    const next = queue.shift();
    const text = this.extractText(next);
    if (!text) return;
    this.activeRun = this.runConversation(text);
    await this.activeRun;
  }

  steer(message: any) {
    this.steeringQueue.push(message);
  }

  followUp(message: any) {
    this.followUpQueue.push(message);
  }

  clearSteeringQueue() {
    this.steeringQueue = [];
  }

  clearFollowUpQueue() {
    this.followUpQueue = [];
  }

  clearAllQueues() {
    this.clearSteeringQueue();
    this.clearFollowUpQueue();
  }

  hasQueuedMessages() {
    return this.steeringQueue.length > 0 || this.followUpQueue.length > 0;
  }

  get signal() {
    return this.activeAbortController?.signal;
  }

  abort() {
    this.activeAbortController?.abort();
  }

  waitForIdle() {
    return this.activeRun ?? Promise.resolve();
  }

  reset() {
    this.state.messages = [];
    this.state.streamingMessage = undefined;
    this.state.errorMessage = undefined;
    this.state.pendingToolCalls = new Set<string>();
    this.clearAllQueues();
  }

  async dispose() {
    this.unsubscribeBridge?.();
    await this.bridge!.stop();
  }
}

export async function createSubmarineInteractiveRuntime(options: {
  cwd: string;
  sessionManager: any;
  services: AgentSessionServices;
  sessionStartEvent?: any;
}): Promise<CreateAgentSessionRuntimeResult> {
  const agent = new SubmarineInteractiveAgent(options.cwd) as any;
  const session = new AgentSession({
    agent,
    sessionManager: options.sessionManager,
    settingsManager: options.services.settingsManager,
    cwd: options.cwd,
    resourceLoader: options.services.resourceLoader,
    modelRegistry: options.services.modelRegistry,
    sessionStartEvent: options.sessionStartEvent,
  });

  const diagnostics: AgentSessionRuntimeDiagnostic[] = [
    ...options.services.diagnostics,
    {
      type: "info",
      message: "Using Submarine-backed interactive runtime through AgentSession.",
    },
  ];

  return {
    session,
    services: options.services,
    diagnostics,
    extensionsResult: {
      extensions: [],
      errors: [],
      runtime: createExtensionRuntime(),
    },
  };
}
