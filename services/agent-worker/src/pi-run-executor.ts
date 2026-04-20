import { AuthStorage, createAgentSession, getAgentDir, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";
import { resolve } from "node:path";
import { loadPinchyRuntimeConfig, type PinchyRuntimeConfig, type ThinkingLevel } from "../../../apps/host/src/runtime-config.js";
import type { Run } from "../../../packages/shared/src/contracts.js";

export type PiRunExecutionResult = {
  summary: string;
  message: string;
  piSessionPath?: string;
};

type PiSession = {
  sessionId?: string;
  sessionFile?: string;
  prompt: (text: string) => Promise<void>;
  followUp: (text: string) => Promise<void>;
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
    const model = runtimeConfig.defaultProvider && runtimeConfig.defaultModel
      ? resolveModel(runtimeConfig.defaultProvider, runtimeConfig.defaultModel, agentDir)
      : undefined;

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
      await session.prompt(run.goal);
      return {
        summary: `Pi-backed run completed for goal: ${run.goal}`,
        message: `Pi completed run: ${run.goal}`,
        piSessionPath: session.sessionFile,
      };
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
      await session.followUp(reply);
      return {
        summary: `Pi-backed run resumed for goal: ${run.goal}`,
        message: `Pi resumed run: ${run.goal}`,
        piSessionPath: session.sessionFile ?? run.piSessionPath,
      };
    },
  };
}
