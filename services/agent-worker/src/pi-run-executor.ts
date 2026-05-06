import { AuthStorage, createAgentSession, getAgentDir, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { resolve } from "node:path";
import { clearRunCancellationRequest, getConversationSessionBinding, hasRunCancellationRequest, listRuns } from "../../../apps/host/src/agent-state-store.js";
import { buildRuntimeConfigSignature } from "../../../apps/host/src/runtime-config-signature.js";
import { loadPinchyRuntimeConfig, type PinchyRuntimeConfig, type RuntimeModelOptions, type ThinkingLevel } from "../../../apps/host/src/runtime-config.js";
import type { Run } from "../../../packages/shared/src/contracts.js";
import { createRuntimeModelSettingsResourceLoader } from "./pi-model-runtime-settings.js";
import { selectRuntimeModel } from "./runtime-model-selection.js";
import { createSubmarineAdapter } from "./pi-submarine-adapter.js";
import { normalizeRunOutcome, type PiRunExecutionResult } from "./run-outcomes.js";
import { buildRunExecutionPrompt, shouldReuseConversationSessionForRun } from "./run-orchestration-prompt.js";

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

type PiSessionResult = {
  session: PiSession;
};

type PiSessionManagerFactory = {
  create: (cwd: string) => unknown;
  open: (sessionPath: string) => unknown;
};

type CreateSessionArgs = {
  cwd: string;
  agentDir: string;
  sessionManager: unknown;
  model?: unknown;
  thinkingLevel?: ThinkingLevel;
  modelOptions?: RuntimeModelOptions;
};

type PiRunExecutorDependencies = {
  hasRunCancellationRequest?: (cwd: string, runId: string) => boolean;
  clearRunCancellationRequest?: (cwd: string, runId: string) => boolean;
  agentDir?: string;
  createSession?: (args: CreateSessionArgs) => Promise<PiSessionResult>;
  sessionManagerFactory?: PiSessionManagerFactory;
  loadRuntimeConfig?: (cwd: string) => PinchyRuntimeConfig;
  resolveModel?: (provider: string, modelId: string, agentDir: string) => unknown;
  loadConversationRuns?: (cwd: string, conversationId: string) => Run[];
  loadConversationSessionBinding?: (cwd: string, conversationId: string) => { sessionPath: string; runtimeConfigSignature?: string } | undefined;
};
function defaultResolveModel(provider: string, modelId: string, agentDir: string) {
  const builtInModel = getModel(
    provider as Parameters<typeof getModel>[0],
    modelId as Parameters<typeof getModel>[1],
  );
  if (builtInModel) return builtInModel;

  const authStorage = AuthStorage.create(resolve(agentDir, "auth.json"));
  const modelRegistry = ModelRegistry.create(authStorage, resolve(agentDir, "models.json"));
  return modelRegistry.find(provider, modelId);
}

function readStreamedAssistantText(event: unknown) {
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

function collapseRepeatedAssistantText(value: string | undefined) {
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

function resolveCapturedAssistantText(streamedText: string, historyText?: string) {
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

async function executeWithCapturedAssistantText(session: PiSession, operation: () => Promise<unknown>, options?: { onCancellationCheck?: () => boolean; onCancellationHandled?: () => void }) {
  let streamedText = "";
  const unsubscribe = session.subscribe?.((event) => {
    const delta = readStreamedAssistantText(event);
    if (delta) {
      streamedText += delta;
    }
  });

  let cancellationHandled = false;
  const cancellationInterval = options?.onCancellationCheck && session.abort
    ? globalThis.setInterval(() => {
      if (cancellationHandled || !options.onCancellationCheck?.()) {
        return;
      }
      cancellationHandled = true;
      options.onCancellationHandled?.();
      void session.abort?.().catch(() => {});
    }, 25)
    : undefined;

  try {
    const rawResult = await operation();
    const messageFromHistory = [...(session.messages ?? [])]
      .reverse()
      .find((message) => message.role === "assistant");
    const assistantText = resolveCapturedAssistantText(streamedText, readAssistantMessageText(messageFromHistory?.content));
    return { rawResult, assistantText };
  } finally {
    if (cancellationInterval !== undefined) {
      globalThis.clearInterval(cancellationInterval);
    }
    unsubscribe?.();
  }
}

export function createPiRunExecutor(dependencies: PiRunExecutorDependencies = {}) {
  const agentDir = dependencies.agentDir ?? getAgentDir();
  const createSession = dependencies.createSession ?? (async (args: CreateSessionArgs) => createAgentSession({
    cwd: args.cwd,
    agentDir: args.agentDir,
    sessionManager: args.sessionManager as SessionManager,
    model: args.model as never,
    thinkingLevel: args.thinkingLevel,
    resourceLoader: await createRuntimeModelSettingsResourceLoader({
      cwd: args.cwd,
      agentDir: args.agentDir,
      options: args.modelOptions,
    }),
  }));
  const sessionManagerFactory = dependencies.sessionManagerFactory ?? (dependencies.createSession ? {
    create: (cwd: string) => ({ kind: "create", cwd }),
    open: (sessionPath: string) => ({ kind: "open", sessionPath }),
  } : {
    create: (cwd: string) => SessionManager.create(cwd),
    open: (sessionPath: string) => SessionManager.open(sessionPath),
  }) satisfies PiSessionManagerFactory;
  const loadRuntimeConfig = dependencies.loadRuntimeConfig ?? loadPinchyRuntimeConfig;
  const submarineAdapter = createSubmarineAdapter({ loadRuntimeConfig });
  const resolveModel = dependencies.resolveModel ?? defaultResolveModel;
  const loadConversationRuns = dependencies.loadConversationRuns ?? ((cwd: string, conversationId: string) => listRuns(cwd, conversationId));
  const loadConversationSessionBinding = dependencies.loadConversationSessionBinding ?? ((cwd: string, conversationId: string) => getConversationSessionBinding(cwd, conversationId));
  const hasCancellationRequest = dependencies.hasRunCancellationRequest ?? ((cwd: string, runId: string) => hasRunCancellationRequest(cwd, runId));
  const clearCancellationRequest = dependencies.clearRunCancellationRequest ?? ((cwd: string, runId: string) => clearRunCancellationRequest(cwd, runId));
  const useSubmarineRuntime = dependencies.createSession === undefined;

  function buildSessionDefaults(cwd: string) {
    const runtimeConfig = loadRuntimeConfig(cwd);
    const selection = selectRuntimeModel(runtimeConfig, "orchestration");
    const resolvedModel = selection.provider && selection.modelId
      ? resolveModel(selection.provider, selection.modelId, agentDir)
      : undefined;
    const model = selection.baseUrl && resolvedModel && typeof resolvedModel === "object"
      ? { ...resolvedModel, baseUrl: selection.baseUrl }
      : resolvedModel;

    return {
      model,
      thinkingLevel: selection.thinkingLevel,
      modelOptions: selection.modelOptions,
      runtimeConfigSignature: buildRuntimeConfigSignature(runtimeConfig),
    };
  }

  function hasCompatibleRuntimeConfigSignature(signature: string | undefined, run: Run) {
    return Boolean(signature && run.runtimeConfigSignature && signature === run.runtimeConfigSignature);
  }

  function findReusableConversationSessionPath(cwd: string, run: Run, runtimeConfigSignature: string | undefined) {
    const canonicalBinding = loadConversationSessionBinding(cwd, run.conversationId);
    if (canonicalBinding?.sessionPath?.trim() && canonicalBinding.runtimeConfigSignature === runtimeConfigSignature) {
      return canonicalBinding.sessionPath;
    }
    if (typeof run.sessionPath === "string" && run.sessionPath.trim() && hasCompatibleRuntimeConfigSignature(runtimeConfigSignature, run)) {
      return run.sessionPath;
    }
    const priorRuns = loadConversationRuns(cwd, run.conversationId)
      .filter((entry) => entry.id !== run.id && typeof entry.sessionPath === "string" && entry.sessionPath.trim().length > 0)
      .filter((entry) => hasCompatibleRuntimeConfigSignature(runtimeConfigSignature, entry))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return priorRuns[0]?.sessionPath;
  }

  async function openExistingConversationSession(cwd: string, run: Run) {
    const defaults = buildSessionDefaults(cwd);
    const canonicalSessionPath = loadConversationSessionBinding(cwd, run.conversationId)?.sessionPath?.trim();
    const activeRunSessionPath = typeof run.sessionPath === "string" ? run.sessionPath.trim() : undefined;
    const sessionPath = canonicalSessionPath
      || activeRunSessionPath
      || findReusableConversationSessionPath(cwd, run, defaults.runtimeConfigSignature);
    if (!sessionPath) {
      throw new Error(`Cannot find an active Pi session for conversation: ${run.conversationId}`);
    }
    const { session } = await createSession({
      cwd,
      agentDir,
      sessionManager: sessionManagerFactory.open(sessionPath),
      model: defaults.model,
      thinkingLevel: defaults.thinkingLevel,
      modelOptions: defaults.modelOptions,
    });
    return { session, sessionPath };
  }

  return {
    async executeRun({ cwd, run }: { cwd: string; run: Run }): Promise<PiRunExecutionResult> {
      const runtimeConfig = loadRuntimeConfig(cwd);
      if (useSubmarineRuntime && runtimeConfig.submarine?.enabled) {
        return submarineAdapter.executeRun({ cwd, run });
      }
      const defaults = buildSessionDefaults(cwd);
      const reusableSessionPath = shouldReuseConversationSessionForRun(run)
        ? findReusableConversationSessionPath(cwd, run, defaults.runtimeConfigSignature)
        : undefined;
      const { session } = await createSession({
        cwd,
        agentDir,
        sessionManager: reusableSessionPath ? sessionManagerFactory.open(reusableSessionPath) : sessionManagerFactory.create(cwd),
        model: defaults.model,
        thinkingLevel: defaults.thinkingLevel,
        modelOptions: defaults.modelOptions,
      });
      const executionPrompt = buildRunExecutionPrompt(run);
      const sendExecutionPrompt = reusableSessionPath && session.isStreaming
        ? () => session.followUp(executionPrompt)
        : () => session.prompt(executionPrompt);
      const { rawResult, assistantText } = await executeWithCapturedAssistantText(session, sendExecutionPrompt, {
        onCancellationCheck: () => hasCancellationRequest(cwd, run.id),
        onCancellationHandled: () => {
          clearCancellationRequest(cwd, run.id);
        },
      });
      return normalizeRunOutcome(rawResult, {
        summary: `Pi-backed run completed for goal: ${run.goal}`,
        message: assistantText ?? `Pi completed run: ${run.goal}`,
        sessionPath: session.sessionFile ?? reusableSessionPath,
      });
    },
    async resumeRun({ cwd, run, reply }: { cwd: string; run: Run; reply: string }): Promise<PiRunExecutionResult> {
      const runtimeConfig = loadRuntimeConfig(cwd);
      if (useSubmarineRuntime && runtimeConfig.submarine?.enabled) {
        return submarineAdapter.resumeRun({ cwd, run, reply });
      }
      if (!run.sessionPath) {
        throw new Error(`Cannot resume run without correct SessionPath: ${run.id}`);
      }
      const defaults = buildSessionDefaults(cwd);
      const { session } = await createSession({
        cwd,
        agentDir,
        sessionManager: sessionManagerFactory.open(run.sessionPath),
        model: defaults.model,
        thinkingLevel: defaults.thinkingLevel,
        modelOptions: defaults.modelOptions,
      });
      const { rawResult, assistantText } = await executeWithCapturedAssistantText(session, () => session.followUp(reply), {
        onCancellationCheck: () => hasCancellationRequest(cwd, run.id),
        onCancellationHandled: () => {
          clearCancellationRequest(cwd, run.id);
        },
      });
      return normalizeRunOutcome(rawResult, {
        summary: `Pi-backed run resumed for goal: ${run.goal}`,
        message: assistantText ?? `Pi resumed run: ${run.goal}`,
        sessionPath: session.sessionFile ?? run.sessionPath,
      });
    },
    async steerRun({ cwd, run, content }: { cwd: string; run: Run; content: string }) {
      const { session } = await openExistingConversationSession(cwd, run);
      if (session.steer) {
        await session.steer(content);
        return;
      }
      await session.prompt(content, { streamingBehavior: "steer" });
    },
    async queueFollowUp({ cwd, run, content }: { cwd: string; run: Run; content: string }) {
      const { session } = await openExistingConversationSession(cwd, run);
      await session.followUp(content);
    },
  };
}
