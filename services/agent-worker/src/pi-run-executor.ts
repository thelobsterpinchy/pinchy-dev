import { AuthStorage, createAgentSession, getAgentDir, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { resolve } from "node:path";
import { loadPinchyRuntimeConfig, type PinchyRuntimeConfig, type ThinkingLevel } from "../../../apps/host/src/runtime-config.js";
import type { Run } from "../../../packages/shared/src/contracts.js";
import { normalizeRunOutcome, type PiRunExecutionResult } from "./run-outcomes.js";

type PiSession = {
  sessionId?: string;
  sessionFile?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
  subscribe?: (listener: (event: unknown) => void) => (() => void) | void;
  prompt: (text: string) => Promise<unknown>;
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
};

type PiRunExecutorDependencies = {
  agentDir?: string;
  createSession?: (args: CreateSessionArgs) => Promise<PiSessionResult>;
  sessionManagerFactory?: PiSessionManagerFactory;
  loadRuntimeConfig?: (cwd: string) => PinchyRuntimeConfig;
  resolveModel?: (provider: string, modelId: string, agentDir: string) => unknown;
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

async function executeWithCapturedAssistantText(session: PiSession, operation: () => Promise<unknown>) {
  let streamedText = "";
  const unsubscribe = session.subscribe?.((event) => {
    const delta = readStreamedAssistantText(event);
    if (delta) {
      streamedText += delta;
    }
  });

  try {
    const rawResult = await operation();
    const messageFromHistory = [...(session.messages ?? [])]
      .reverse()
      .find((message) => message.role === "assistant");
    const assistantText = resolveCapturedAssistantText(streamedText, readAssistantMessageText(messageFromHistory?.content));
    return { rawResult, assistantText };
  } finally {
    unsubscribe?.();
  }
}

export function createPiRunExecutor(dependencies: PiRunExecutorDependencies = {}) {
  const agentDir = dependencies.agentDir ?? getAgentDir();
  const createSession = dependencies.createSession ?? ((args: CreateSessionArgs) => createAgentSession({
    cwd: args.cwd,
    agentDir: args.agentDir,
    sessionManager: args.sessionManager as SessionManager,
    model: args.model as never,
    thinkingLevel: args.thinkingLevel,
  }));
  const sessionManagerFactory = dependencies.sessionManagerFactory ?? {
    create: (cwd: string) => SessionManager.create(cwd),
    open: (sessionPath: string) => SessionManager.open(sessionPath),
  } satisfies PiSessionManagerFactory;
  const loadRuntimeConfig = dependencies.loadRuntimeConfig ?? loadPinchyRuntimeConfig;
  const resolveModel = dependencies.resolveModel ?? defaultResolveModel;

  function buildSessionDefaults(cwd: string) {
    const runtimeConfig = loadRuntimeConfig(cwd);
    const resolvedModel = runtimeConfig.defaultProvider && runtimeConfig.defaultModel
      ? resolveModel(runtimeConfig.defaultProvider, runtimeConfig.defaultModel, agentDir)
      : undefined;
    const model = runtimeConfig.defaultBaseUrl && resolvedModel && typeof resolvedModel === "object"
      ? { ...resolvedModel, baseUrl: runtimeConfig.defaultBaseUrl }
      : resolvedModel;

    return {
      model,
      thinkingLevel: runtimeConfig.defaultThinkingLevel,
    };
  }

  return {
    async executeRun({ cwd, run }: { cwd: string; run: Run }): Promise<PiRunExecutionResult> {
      const defaults = buildSessionDefaults(cwd);
      const { session } = await createSession({
        cwd,
        agentDir,
        sessionManager: sessionManagerFactory.create(cwd),
        model: defaults.model,
        thinkingLevel: defaults.thinkingLevel,
      });
      const { rawResult, assistantText } = await executeWithCapturedAssistantText(session, () => session.prompt(run.goal));
      return normalizeRunOutcome(rawResult, {
        summary: `Pi-backed run completed for goal: ${run.goal}`,
        message: assistantText ?? `Pi completed run: ${run.goal}`,
        piSessionPath: session.sessionFile,
      });
    },
    async resumeRun({ cwd, run, reply }: { cwd: string; run: Run; reply: string }): Promise<PiRunExecutionResult> {
      if (!run.piSessionPath) {
        throw new Error(`Cannot resume run without piSessionPath: ${run.id}`);
      }
      const defaults = buildSessionDefaults(cwd);
      const { session } = await createSession({
        cwd,
        agentDir,
        sessionManager: sessionManagerFactory.open(run.piSessionPath),
        model: defaults.model,
        thinkingLevel: defaults.thinkingLevel,
      });
      const { rawResult, assistantText } = await executeWithCapturedAssistantText(session, () => session.followUp(reply));
      return normalizeRunOutcome(rawResult, {
        summary: `Pi-backed run resumed for goal: ${run.goal}`,
        message: assistantText ?? `Pi resumed run: ${run.goal}`,
        piSessionPath: session.sessionFile ?? run.piSessionPath,
      });
    },
  };
}
