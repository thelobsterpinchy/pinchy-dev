import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  SessionManager,
  type CreateAgentSessionRuntimeFactory,
} from "@mariozechner/pi-coding-agent";
import {
  buildAgentStartupSummary,
  formatAgentStartupNotice,
  formatNonInteractiveAgentError,
  requiresInteractiveTerminal,
} from "./agent-startup.js";
import { loadPinchyRuntimeConfig } from "./runtime-config.js";
import { createSubmarineInteractiveRuntime } from "./submarine-interactive-runtime.js";

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();

  if (!requiresInteractiveTerminal()) {
    console.error(formatNonInteractiveAgentError());
    process.exit(1);
  }

  console.log(formatAgentStartupNotice(buildAgentStartupSummary(cwd)));

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
    const services = await createAgentSessionServices({ cwd, agentDir: getAgentDir() });
    const runtimeConfig = loadPinchyRuntimeConfig(cwd);
    if (runtimeConfig.submarine?.enabled) {
      return createSubmarineInteractiveRuntime({
        cwd,
        sessionManager,
        services,
        sessionStartEvent,
      });
    }
    return {
      ...(await createAgentSessionFromServices({
        services,
        sessionManager,
        sessionStartEvent,
      })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  const runtime = await createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager: SessionManager.create(cwd),
  });

  const mode = new InteractiveMode(runtime, {
    migratedProviders: [],
    modelFallbackMessage: undefined,
    initialMessage: process.env.PINCHY_INITIAL_MESSAGE,
    initialImages: [],
    initialMessages: [],
  });

  await mode.run();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
