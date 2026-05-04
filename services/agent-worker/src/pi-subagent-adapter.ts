import { AuthStorage, createAgentSession, getAgentDir, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { resolve } from "node:path";
import type { PinchyRuntimeConfig } from "../../../apps/host/src/runtime-config.js";
import { buildRuntimeConfigSignature } from "../../../apps/host/src/runtime-config-signature.js";
import { loadPinchyRuntimeConfig } from "../../../apps/host/src/runtime-config.js";
import type { Run } from "../../../packages/shared/src/contracts.js";
import { createRuntimeModelSettingsResourceLoader } from "./pi-model-runtime-settings.js";
import type { SubagentAdapter, SubagentExecutionInput, SubagentExecutionResult, SubagentQueueFollowUpInput, SubagentResumeInput, SubagentSteerInput } from "./subagent-adapter.js";
import { buildRunExecutionPrompt, shouldReuseConversationSessionForRun } from "./run-orchestration-prompt.js";
import { PinchySessionManager } from "./pinchy-session-manager.js";

type PiModel = unknown;

function defaultResolveModel(provider: string, modelId: string, agentDir: string): PiModel | undefined {
  const builtInModel = getModel(
    provider as Parameters<typeof getModel>[0],
    modelId as Parameters<typeof getModel>[1],
  );
  if (builtInModel) return builtInModel;

  const authStorage = AuthStorage.create(resolve(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, resolve(agentDir, "models.json"));
  return modelRegistry.find(provider, modelId);
}

function readStreamedAssistantText(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const record = event as { type?: unknown; assistantMessageEvent?: { type?: unknown; delta?: unknown; content?: unknown } };
  if (record.type !== "message_update") return undefined;
  if (record.assistantMessageEvent?.type === "text_delta" && typeof record.assistantMessageEvent.delta === "string") {
    return record.assistantMessageEvent.delta;
  }
  if (record.assistantMessageEvent?.type === "text_end" && typeof record.assistantMessageEvent.content === "string") {
    return record.assistantMessageEvent.content;
  }
  return undefined;
}

function readAssistantMessageText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    const text = value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "text" in entry && typeof entry.text === "string") {
          return entry.text;
        }
        return "";
      })
      .join("")
      .trim();
    return text || undefined;
  }
  return undefined;
}

function collapseRepeatedAssistantText(value: string | undefined): string | undefined {
  if (!value) return value;
  const text = value.trim();
  for (let size = 1; size <= Math.floor(text.length / 2); size += 1) {
    if (text.length % size !== 0) continue;
    const chunk = text.slice(0, size);
    if (chunk.repeat(text.length / size) === text) {
      return chunk;
    }
  }
  return text;
}

function resolveCapturedAssistantText(streamedText: string, historyText?: string): string | undefined {
  const normalizedStreamedText = collapseRepeatedAssistantText(streamedText.trim());
  const normalizedHistoryText = collapseRepeatedAssistantText(historyText);
  if (normalizedStreamedText && normalizedHistoryText) {
    if (normalizedStreamedText === normalizedHistoryText || normalizedHistoryText.includes(normalizedStreamedText)) {
      return normalizedHistoryText;
    }
    if (normalizedStreamedText.includes(normalizedHistoryText)) {
      return normalizedStreamedText;
    }
  }
  return normalizedStreamedText || normalizedHistoryText;
}

type PiSession = {
  abort?: () => Promise<void>;
  sessionId?: string;
  sessionFile?: string;
  isStreaming?: boolean;
  messages?: Array<{ role?: string; content?: unknown }>;
  subscribe?: (listener: (event: unknown) => void) => (() => void) | void;
  prompt: (text: string, options?: { streamingBehavior?: "steer" | "followUp" }) => Promise<unknown>;
  steer?: (text: string) => Promise<unknown>;
  followUp: (text: string) => Promise<unknown>;
};

async function executeWithCapturedAssistantText(session: PiSession, operation: () => Promise<unknown>) {
  let streamedText = "";
  const unsubscribe = session.subscribe?.((event) => {
    const delta = readStreamedAssistantText(event);
    if (delta) {
      streamedText += delta;
    }
  });

  try {
    await operation();
    const messageFromHistory = [...(session.messages ?? [])]
      .reverse()
      .find((message) => message.role === "assistant");
    const assistantText = resolveCapturedAssistantText(streamedText, readAssistantMessageText(messageFromHistory?.content));
    return assistantText;
  } finally {
    unsubscribe?.();
  }
}

export type PiSubagentAdapterDependencies = {
  agentDir?: string;
  loadRuntimeConfig?: (cwd: string) => PinchyRuntimeConfig;
  resolveModel?: (provider: string, modelId: string, agentDir: string) => PiModel | undefined;
  sessionManager?: PinchySessionManager;
};

export class PiSubagentAdapter implements SubagentAdapter {
  private readonly agentDir: string;
  private readonly loadRuntimeConfig: (cwd: string) => PinchyRuntimeConfig;
  private readonly resolveModel: (provider: string, modelId: string, agentDir: string) => PiModel | undefined;
  private readonly sessionManager: PinchySessionManager;

  constructor(dependencies: PiSubagentAdapterDependencies = {}) {
    this.agentDir = dependencies.agentDir ?? getAgentDir();
    this.loadRuntimeConfig = dependencies.loadRuntimeConfig ?? loadPinchyRuntimeConfig;
    this.resolveModel = dependencies.resolveModel ?? defaultResolveModel;
    this.sessionManager = dependencies.sessionManager ?? new PinchySessionManager();
  }

  private buildSessionDefaults(cwd: string) {
    const runtimeConfig = this.loadRuntimeConfig(cwd);
    const sessionModel = runtimeConfig.subagentModel || runtimeConfig.defaultModel;
    const sessionProvider = runtimeConfig.subagentModel !== undefined 
      ? (runtimeConfig.defaultProvider || "openai")
      : runtimeConfig.defaultProvider;
    
    const resolvedModel = sessionProvider && sessionModel
      ? this.resolveModel(sessionProvider, sessionModel, this.agentDir)
      : undefined;
    const model = runtimeConfig.defaultBaseUrl && resolvedModel && typeof resolvedModel === "object"
      ? { ...resolvedModel, baseUrl: runtimeConfig.defaultBaseUrl }
      : resolvedModel;

    return {
      model,
      thinkingLevel: runtimeConfig.defaultThinkingLevel,
      modelOptions: runtimeConfig.modelOptions,
      runtimeConfigSignature: buildRuntimeConfigSignature(runtimeConfig),
    };
  }

  private async createSession(cwd: string, input: { reuseSessionPath?: string }) {
    const defaults = this.buildSessionDefaults(cwd);
    
    const sessionManager = this.sessionManager;
    let session: PiSession;
    let sessionPath: string | undefined;

    if (input.reuseSessionPath) {
      const sessionManagerFactory = {
        open: (path: string) => SessionManager.open(path),
      };
      
      const result = await createAgentSession({
        cwd,
        agentDir: this.agentDir,
        sessionManager: sessionManagerFactory.open(input.reuseSessionPath),
        model: defaults.model as any,
        thinkingLevel: defaults.thinkingLevel,
        resourceLoader: await createRuntimeModelSettingsResourceLoader({
          cwd,
          agentDir: this.agentDir,
          options: defaults.modelOptions,
        }),
      });
      
      session = result.session as PiSession;
      sessionPath = result.session.sessionFile ?? input.reuseSessionPath;
    } else {
      const sessionManagerFactory = {
        create: (cwd: string) => SessionManager.create(cwd),
      };
      
      const result = await createAgentSession({
        cwd,
        agentDir: this.agentDir,
        sessionManager: sessionManagerFactory.create(cwd),
        model: defaults.model as any,
        thinkingLevel: defaults.thinkingLevel,
        resourceLoader: await createRuntimeModelSettingsResourceLoader({
          cwd,
          agentDir: this.agentDir,
          options: defaults.modelOptions,
        }),
      });
      
      session = result.session as PiSession;
      sessionPath = result.session.sessionFile;
    }

    return { session, sessionPath, runtimeConfigSignature: defaults.runtimeConfigSignature };
  }

  private findReusableSession(cwd: string, run: Run, runtimeConfigSignature: string): string | undefined {
    const priorSessions = this.sessionManager.findReusableSessions(cwd, runtimeConfigSignature, run.conversationId);
    if (priorSessions.length > 0) {
      return priorSessions[0].sessionPath;
    }
    
    const binding = this.sessionManager.findSessionByConversationId(cwd, run.conversationId);
    if (binding?.runtimeConfigSignature === runtimeConfigSignature) {
      return binding.sessionPath;
    }
    
    if (typeof run.sessionPath === "string" && run.sessionPath.trim()) {
      return run.sessionPath;
    }
    
    return undefined;
  }

  async executeRun(input: SubagentExecutionInput): Promise<SubagentExecutionResult> {
    const { cwd, run } = input;
    
    const reusableSessionPath = shouldReuseConversationSessionForRun(run)
      ? this.findReusableSession(cwd, run, this.buildSessionDefaults(cwd).runtimeConfigSignature ?? "")
      : undefined;

    const { session, sessionPath } = await this.createSession(cwd, { reuseSessionPath: reusableSessionPath });
    const executionPrompt = buildRunExecutionPrompt(run);
    
    const assistantText = await executeWithCapturedAssistantText(session, () => 
      reusableSessionPath && session.isStreaming
        ? session.followUp(executionPrompt)
        : session.prompt(executionPrompt)
    );

    return {
      kind: "completed",
      summary: `Subagent run completed for goal: ${run.goal}`,
      message: assistantText ?? `Subagent completed run: ${run.goal}`,
      sessionPath,
    };
  }

  async resumeRun(input: SubagentResumeInput): Promise<SubagentExecutionResult> {
    const { cwd, run, reply } = input;
    
    if (!run.sessionPath) {
      throw new Error(`Cannot resume run without sessionPath: ${run.id}`);
    }

    const { session } = await this.createSession(cwd, { reuseSessionPath: run.sessionPath });
    const assistantText = await executeWithCapturedAssistantText(session, () => session.followUp(reply));

    return {
      kind: "completed",
      summary: `Subagent run resumed for goal: ${run.goal}`,
      message: assistantText ?? `Subagent resumed run: ${run.goal}`,
      sessionPath: session.sessionFile ?? run.sessionPath,
    };
  }

  async steerRun(input: SubagentSteerInput): Promise<void> {
    const { cwd, run, content } = input;
    
    if (!run.sessionPath) {
      throw new Error(`Cannot steer run without sessionPath: ${run.id}`);
    }

    const { session } = await this.createSession(cwd, { reuseSessionPath: run.sessionPath });
    if (session.steer) {
      await session.steer(content);
    } else {
      await session.prompt(content, { streamingBehavior: "steer" });
    }
  }

  async queueFollowUp(input: SubagentQueueFollowUpInput): Promise<void> {
    const { cwd, run, content } = input;
    
    if (!run.sessionPath) {
      throw new Error(`Cannot queue follow-up without sessionPath: ${run.id}`);
    }

    const { session } = await this.createSession(cwd, { reuseSessionPath: run.sessionPath });
    await session.followUp(content);
  }
}
