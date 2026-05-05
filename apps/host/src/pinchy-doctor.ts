import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { loadDiscordGatewayConfig } from "../../../services/discord-gateway/config.js";
import { loadPinchyRuntimeConfig, withDefaultSubmarineRuntimeConfig, type PinchyRuntimeConfig } from "./runtime-config.js";
import { buildSubmarinePythonEnv, getBundledSubmarinePythonPath } from "./submarine-python.js";

export type PinchyDoctorCheckStatus = "ok" | "warn" | "fail";

export type PinchyDoctorCheck = {
  name: string;
  status: PinchyDoctorCheckStatus;
  message: string;
  hint?: string;
};

export type PinchyDoctorReport = {
  cwd: string;
  checks: PinchyDoctorCheck[];
  summary: {
    status: PinchyDoctorCheckStatus;
    failCount: number;
    warnCount: number;
    okCount: number;
  };
};

export type PinchyDoctorDependencies = {
  pathExists?: (path: string) => boolean;
  commandExists?: (command: string) => boolean;
  resolvePlaywrightBrowserPath?: () => string | undefined;
  canLaunchPythonModule?: (pythonPath: string, moduleName: string, cwd: string) => boolean;
  endpointReachable?: (url: string) => boolean | undefined;
  runtimeConfig?: PinchyRuntimeConfig;
  env?: NodeJS.ProcessEnv;
};

function hasLocalModelSupport(hasCommand: (command: string) => boolean) {
  return hasCommand("ollama") || hasCommand("lmstudio") || hasCommand("lms");
}

function summarizeDoctorStatus(checks: PinchyDoctorCheck[]): PinchyDoctorReport["summary"] {
  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const okCount = checks.filter((check) => check.status === "ok").length;
  return {
    status: failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "ok",
    failCount,
    warnCount,
    okCount,
  };
}

function commandExists(command: string) {
  const result = spawnSync("bash", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function resolvePlaywrightBrowserPath() {
  try {
    return chromium.executablePath();
  } catch {
    return undefined;
  }
}

function canLaunchPythonModule(pythonPath: string, moduleName: string, cwd: string) {
  const result = spawnSync(pythonPath, ["-m", moduleName, "--help"], {
    cwd,
    env: buildSubmarinePythonEnv(process.env),
    stdio: "ignore",
    timeout: 5_000,
  });
  return result.status === 0;
}

function isValidHttpUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function checkEndpoint(url: string | undefined, endpointReachable: ((url: string) => boolean | undefined) | undefined) {
  if (!isValidHttpUrl(url)) return "fail" as const;
  const reachable = endpointReachable?.(url!);
  if (reachable === true) return "ok" as const;
  if (reachable === false) return "fail" as const;
  return "warn" as const;
}

const REQUIRED_SUBMARINE_TOOL_BRIDGE_PATHS = [
  ".pi/extensions/web-search/index.ts",
  ".pi/extensions/browser-debugger/index.ts",
  ".pi/extensions/approval-inbox/index.ts",
  ".pi/extensions/guardrails/index.ts",
  ".pi/extensions/design-patterns/index.ts",
];

const REQUIRED_SUBMARINE_RESOURCE_PATHS = [
  ".pi/skills/design-pattern-review/SKILL.md",
  ".pi/skills/engineering-excellence/SKILL.md",
  ".pi/skills/tdd-implementation/SKILL.md",
  ".pi/skills/website-debugger/SKILL.md",
  ".pi/skills/playwright-investigation/SKILL.md",
];

function addSubmarineChecks(input: {
  cwd: string;
  checks: PinchyDoctorCheck[];
  pathExists: (path: string) => boolean;
  hasCommand: (command: string) => boolean;
  runtimeConfig: PinchyRuntimeConfig;
  canLaunchModule: (pythonPath: string, moduleName: string, cwd: string) => boolean;
  endpointReachable?: (url: string) => boolean | undefined;
}) {
  const submarine = input.runtimeConfig.submarine;
  if (!submarine?.enabled) {
    input.checks.push({
      name: "submarine_runtime",
      status: "ok",
      message: "Submarine runtime is not configured.",
      hint: "Run `pinchy setup` and choose Runtime strategy only to opt into Submarine.",
    });
    return;
  }

  input.checks.push({
    name: "submarine_runtime",
    status: "ok",
    message: "Submarine runtime is enabled.",
    hint: "Run the remaining Submarine doctor checks before treating it as production-ready.",
  });

  const pythonPath = submarine.pythonPath ?? "python3";
  const scriptModule = submarine.scriptModule ?? "submarine.serve_stdio";
  const hasPython = input.hasCommand(pythonPath);
  input.checks.push({
    name: "submarine_python",
    status: hasPython ? "ok" : "fail",
    message: hasPython ? `${pythonPath} is available for Submarine.` : `${pythonPath} is not available for Submarine.`,
    hint: hasPython ? undefined : "Install Python or update submarine.pythonPath in .pinchy-runtime.json.",
  });

  const moduleLaunches = hasPython && input.canLaunchModule(pythonPath, scriptModule, input.cwd);
  input.checks.push({
    name: "submarine_module",
    status: moduleLaunches ? "ok" : "fail",
    message: moduleLaunches ? `${scriptModule} can be launched.` : `${scriptModule} could not be launched with ${pythonPath}.`,
    hint: moduleLaunches ? `Using bundled Submarine Python path: ${getBundledSubmarinePythonPath()}.` : "Install the Submarine Python package, restore the packaged vendor/submarine-python directory, or update submarine.scriptModule.",
  });

  const supervisorEndpointStatus = checkEndpoint(submarine.supervisorBaseUrl, input.endpointReachable);
  input.checks.push({
    name: "submarine_supervisor_endpoint",
    status: supervisorEndpointStatus,
    message: supervisorEndpointStatus === "ok"
      ? "Submarine supervisor endpoint is reachable."
      : supervisorEndpointStatus === "fail"
        ? "Submarine supervisor endpoint is missing, invalid, or unreachable."
        : "Submarine supervisor endpoint is configured but reachability was not checked.",
    hint: supervisorEndpointStatus === "ok" ? undefined : "Set submarine.supervisorBaseUrl and make sure the model server is running.",
  });

  const agents = Object.entries(submarine.agents ?? {});
  const invalidAgents = agents.filter(([, agent]) => !isValidHttpUrl(agent.baseUrl));
  const unreachableAgents = agents.filter(([, agent]) => isValidHttpUrl(agent.baseUrl) && input.endpointReachable?.(agent.baseUrl!) === false);
  const agentStatus: PinchyDoctorCheckStatus = agents.length === 0 || invalidAgents.length > 0 || unreachableAgents.length > 0
    ? "fail"
    : input.endpointReachable ? "ok" : "warn";
  input.checks.push({
    name: "submarine_agent_endpoints",
    status: agentStatus,
    message: agentStatus === "ok"
      ? "Submarine agent endpoints are configured and reachable."
      : agentStatus === "fail"
        ? "One or more Submarine agent endpoints are missing, invalid, or unreachable."
        : "Submarine agent endpoints are configured but reachability was not checked.",
    hint: agentStatus === "ok" ? undefined : "Configure submarine.agents with model and baseUrl values, then start those model servers.",
  });

  const missingToolBridgePaths = REQUIRED_SUBMARINE_TOOL_BRIDGE_PATHS.filter((path) => !input.pathExists(resolve(input.cwd, path)));
  input.checks.push({
    name: "submarine_tool_bridge",
    status: missingToolBridgePaths.length === 0 ? "ok" : "fail",
    message: missingToolBridgePaths.length === 0
      ? "Submarine tool bridge workspace extensions are present."
      : `Submarine tool bridge is missing workspace extensions: ${missingToolBridgePaths.join(", ")}.`,
    hint: missingToolBridgePaths.length === 0 ? undefined : "Run `pinchy init` to restore workspace .pi resources.",
  });

  const missingResourcePaths = REQUIRED_SUBMARINE_RESOURCE_PATHS.filter((path) => !input.pathExists(resolve(input.cwd, path)));
  input.checks.push({
    name: "submarine_resources",
    status: missingResourcePaths.length === 0 ? "ok" : "fail",
    message: missingResourcePaths.length === 0
      ? "Submarine skill and prompt resources are present."
      : `Submarine is missing workspace resources: ${missingResourcePaths.join(", ")}.`,
    hint: missingResourcePaths.length === 0 ? undefined : "Run `pinchy init` to restore workspace .pi skills and prompts.",
  });
}

export function buildPinchyDoctorReport(cwd: string, dependencies: PinchyDoctorDependencies = {}): PinchyDoctorReport {
  const pathExists = dependencies.pathExists ?? existsSync;
  const hasCommand = dependencies.commandExists ?? commandExists;
  const getPlaywrightBrowserPath = dependencies.resolvePlaywrightBrowserPath ?? resolvePlaywrightBrowserPath;
  const rawRuntimeConfig = dependencies.runtimeConfig ?? loadPinchyRuntimeConfig(cwd);
  const runtimeConfig = {
    ...rawRuntimeConfig,
    submarine: withDefaultSubmarineRuntimeConfig(rawRuntimeConfig.submarine, {
      defaultModel: rawRuntimeConfig.defaultModel,
      defaultBaseUrl: rawRuntimeConfig.defaultBaseUrl,
      subagentModel: rawRuntimeConfig.subagentModel,
      subagentBaseUrl: rawRuntimeConfig.subagentBaseUrl,
    }),
  };
  const canLaunchModule = dependencies.canLaunchPythonModule ?? canLaunchPythonModule;
  const env = dependencies.env ?? process.env;

  const checks: PinchyDoctorCheck[] = [];

  const workspaceInitialized = pathExists(resolve(cwd, ".pi/settings.json"));
  checks.push({
    name: "workspace_init",
    status: workspaceInitialized ? "ok" : "fail",
    message: workspaceInitialized ? "Workspace is initialized for Pinchy." : "Workspace is not initialized for Pinchy yet.",
    hint: workspaceInitialized ? undefined : "Run `pinchy init` in this repository.",
  });

  for (const fileName of [".pinchy-runtime.json", ".pinchy-goals.json", ".pinchy-watch.json"]) {
    const exists = pathExists(resolve(cwd, fileName));
    checks.push({
      name: fileName.replace(/^\./, "").replace(/\.json$/, "").replace(/-/g, "_"),
      status: exists ? "ok" : "warn",
      message: exists ? `${fileName} is present.` : `${fileName} is missing; Pinchy can recreate defaults.`,
      hint: exists ? undefined : "Run `pinchy init` to scaffold missing workspace defaults.",
    });
  }

  checks.push({
    name: "git",
    status: hasCommand("git") ? "ok" : "warn",
    message: hasCommand("git") ? "git is available." : "git is not installed or not on PATH.",
    hint: hasCommand("git") ? undefined : "Install Git so Pinchy can work with repository state reliably.",
  });

  const hasPlaywrightCli = pathExists(resolve(cwd, "node_modules/.bin/playwright"));
  const playwrightBrowserPath = getPlaywrightBrowserPath();
  const hasPlaywrightBrowserBinary = playwrightBrowserPath ? pathExists(playwrightBrowserPath) : false;
  const hasPlaywrightChromium = hasPlaywrightCli && hasPlaywrightBrowserBinary;
  checks.push({
    name: "playwright_chromium",
    status: hasPlaywrightChromium ? "ok" : "warn",
    message: hasPlaywrightChromium
      ? "Playwright tooling and Chromium browser binaries are available for browser debugging."
      : hasPlaywrightCli
        ? "Playwright CLI is installed, but browser binaries are missing for browser debugging."
        : "Playwright tooling is missing for browser debugging.",
    hint: hasPlaywrightChromium ? undefined : "Run `pinchy setup` or `npm run playwright:install`.",
  });

  checks.push({
    name: "local_models",
    status: hasLocalModelSupport(hasCommand) ? "ok" : "warn",
    message: hasLocalModelSupport(hasCommand) ? "A local model provider appears available." : "No local model provider was detected.",
    hint: hasLocalModelSupport(hasCommand) ? undefined : "Install or start Ollama / LM Studio, then set runtime defaults with `pinchy config set defaultProvider ...`.",
  });

  checks.push({
    name: "cliclick",
    status: hasCommand("cliclick") ? "ok" : "warn",
    message: hasCommand("cliclick") ? "cliclick is available for richer desktop automation." : "cliclick is not installed; richer desktop click helpers stay limited.",
    hint: hasCommand("cliclick") ? undefined : "Install with `brew install cliclick`.",
  });

  checks.push({
    name: "tesseract",
    status: hasCommand("tesseract") ? "ok" : "warn",
    message: hasCommand("tesseract") ? "tesseract is available for OCR-driven tooling." : "tesseract is not installed; OCR/text-driven flows stay limited.",
    hint: hasCommand("tesseract") ? undefined : "Install with `brew install tesseract`.",
  });

  const discordConfig = loadDiscordGatewayConfig(env);
  if (!discordConfig.enabled) {
    checks.push({
      name: "discord_bot",
      status: "warn",
      message: "Discord bot gateway is not configured.",
      hint: "Run `pinchy setup` and choose Discord remote control, or follow docs/DISCORD.md.",
    });
  } else {
    const missing: string[] = [];
    if (!discordConfig.apiToken) missing.push("PINCHY_API_TOKEN");
    if (!discordConfig.botUserId) missing.push("PINCHY_DISCORD_BOT_USER_ID");
    checks.push({
      name: "discord_bot",
      status: missing.length === 0 ? "ok" : "fail",
      message: missing.length === 0
        ? "Discord bot gateway environment is configured."
        : `Discord bot gateway is missing required settings: ${missing.join(", ")}.`,
      hint: missing.length === 0
        ? "Ensure the Discord app has Message Content Intent and channel permissions: view/send messages, create public threads, send in threads, and read message history."
        : "Run `pinchy setup` to save the missing local Discord settings. Guild and channel allowlists are optional.",
    });
  }

  addSubmarineChecks({
    cwd,
    checks,
    pathExists,
    hasCommand,
    runtimeConfig,
    canLaunchModule,
    endpointReachable: dependencies.endpointReachable,
  });

  return {
    cwd,
    checks,
    summary: summarizeDoctorStatus(checks),
  };
}

export function summarizePinchyDoctorReportJson(report: PinchyDoctorReport) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function summarizePinchyDoctorReport(report: PinchyDoctorReport) {
  const lines = [
    `[pinchy] Pinchy doctor for ${report.cwd}`,
    `[pinchy] overall: ${report.summary.status} (ok=${report.summary.okCount} warn=${report.summary.warnCount} fail=${report.summary.failCount})`,
    ...report.checks.flatMap((check) => {
      const detail = `[pinchy] ${check.name}: ${check.status} - ${check.message}`;
      return check.hint ? [detail, `[pinchy] hint: ${check.hint}`] : [detail];
    }),
  ];
  return `${lines.join("\n")}\n`;
}
