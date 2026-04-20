import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  InteractiveMode,
  SessionManager,
  type CreateAgentSessionRuntimeFactory,
} from "@mariozechner/pi-coding-agent";

async function main() {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();

  const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
    const services = await createAgentSessionServices({ cwd, agentDir: getAgentDir() });
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
