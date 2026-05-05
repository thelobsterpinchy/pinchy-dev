import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { chromium } from "playwright";
import { findPinchyProvider, PINCHY_PROVIDER_CATALOG } from "../../../packages/shared/src/pi-provider-catalog.js";
import { getPinchyPackageRoot } from "./package-runtime.js";
import type { PinchyRuntimeConfig } from "./runtime-config.js";
import { updatePinchyRuntimeConfig } from "./pinchy-config.js";

export type PinchySetupStep = {
  label: string;
  command: string;
  args: string[];
};

export type PinchySetupOptionalCheck = {
  name: string;
  status: "ok" | "warn";
  hint?: string;
};

export type PinchySetupPlan = {
  steps: PinchySetupStep[];
  playwright: {
    status: "ok" | "missing";
    hint?: string;
  };
  optionalChecks: PinchySetupOptionalCheck[];
  llmSetup: {
    configuredRoles: string[];
    missingRoles: string[];
    docsPath: string;
    hint: string;
  };
  discordSetup: {
    status: "configured" | "not_configured";
    missingEnv: string[];
    docsPath: string;
    hint: string;
  };
};

export type PinchyLlmSetupDraft = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultBaseUrl?: string;
  orchestrationProvider?: string;
  orchestrationModel?: string;
  orchestrationBaseUrl?: string;
  subagentProvider?: string;
  subagentModel?: string;
  subagentBaseUrl?: string;
};

export type PinchyDiscordSetupDraft = {
  allowedGuildIds?: string;
  allowedChannelIds?: string;
  botUserId?: string;
  allowedUserIds?: string;
};

export type PinchyInteractiveSetupDraft = {
  llm?: PinchyLlmSetupDraft;
  discord?: PinchyDiscordSetupDraft;
  persistRuntimeConfig?: boolean;
};

type PinchySetupQuestion = (prompt: string) => Promise<string>;

type SetupChoice = {
  label: string;
  description?: string;
};

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

export function resolvePlaywrightInstallCommand(packageRoot = getPinchyPackageRoot(), input: {
  pathExists?: (path: string) => boolean;
} = {}) {
  const pathExists = input.pathExists ?? existsSync;
  const packageLocalCommand = resolve(packageRoot, "node_modules/.bin/playwright");
  const siblingCommand = resolve(dirname(packageRoot), ".bin", "playwright");
  return {
    command: pathExists(packageLocalCommand) ? packageLocalCommand : siblingCommand,
    args: ["install", "chromium"],
  };
}

function hasLocalModelSupport(hasCommand: (command: string) => boolean) {
  return hasCommand("ollama") || hasCommand("lmstudio") || hasCommand("lms");
}

export function buildPinchySetupPlan(input: {
  playwrightCommand?: { command: string; args: string[] };
  commandExists?: (command: string) => boolean;
  pathExists?: (path: string) => boolean;
  resolvePlaywrightBrowserPath?: () => string | undefined;
  env?: NodeJS.ProcessEnv;
  runtimeConfig?: PinchyRuntimeConfig;
} = {}): PinchySetupPlan {
  const hasCommand = input.commandExists ?? commandExists;
  const pathExists = input.pathExists ?? existsSync;
  const getPlaywrightBrowserPath = input.resolvePlaywrightBrowserPath ?? resolvePlaywrightBrowserPath;
  const env = input.env ?? process.env;
  const runtimeConfig = input.runtimeConfig ?? {};
  const playwrightCommand = input.playwrightCommand ?? resolvePlaywrightInstallCommand(getPinchyPackageRoot(), { pathExists });
  const playwrightBrowserPath = getPlaywrightBrowserPath();
  const hasPlaywrightChromium = Boolean(playwrightBrowserPath && pathExists(playwrightBrowserPath));
  const requiredDiscordEnv = [
    "PINCHY_DISCORD_BOT_TOKEN",
    "PINCHY_API_TOKEN",
    "PINCHY_DISCORD_ALLOWED_GUILD_IDS",
    "PINCHY_DISCORD_ALLOWED_CHANNEL_IDS",
    "PINCHY_DISCORD_BOT_USER_ID",
  ];
  const missingDiscordEnv = requiredDiscordEnv.filter((key) => !env[key]?.trim());
  const llmRoles = [
    {
      name: "default",
      configured: Boolean((runtimeConfig.defaultProvider ?? env.PINCHY_DEFAULT_PROVIDER)?.trim() && (runtimeConfig.defaultModel ?? env.PINCHY_DEFAULT_MODEL)?.trim()),
    },
    {
      name: "orchestration",
      configured: Boolean((runtimeConfig.orchestrationProvider ?? env.PINCHY_ORCHESTRATION_PROVIDER)?.trim() && (runtimeConfig.orchestrationModel ?? env.PINCHY_ORCHESTRATION_MODEL)?.trim()),
    },
    {
      name: "subagent",
      configured: Boolean((runtimeConfig.subagentProvider ?? env.PINCHY_SUBAGENT_PROVIDER)?.trim() && (runtimeConfig.subagentModel ?? env.PINCHY_SUBAGENT_MODEL)?.trim()),
    },
  ];
  return {
    steps: hasPlaywrightChromium ? [] : [
      {
        label: "Install Playwright Chromium",
        command: playwrightCommand.command,
        args: playwrightCommand.args,
      },
    ],
    playwright: {
      status: hasPlaywrightChromium ? "ok" : "missing",
      hint: hasPlaywrightChromium
        ? undefined
        : "Pinchy setup will install Playwright Chromium for browser debugging.",
    },
    optionalChecks: [
      { name: "git", status: hasCommand("git") ? "ok" : "warn", hint: hasCommand("git") ? undefined : "Install Git." },
      { name: "cliclick", status: hasCommand("cliclick") ? "ok" : "warn", hint: hasCommand("cliclick") ? undefined : "brew install cliclick" },
      { name: "tesseract", status: hasCommand("tesseract") ? "ok" : "warn", hint: hasCommand("tesseract") ? undefined : "brew install tesseract" },
      { name: "local_models", status: hasLocalModelSupport(hasCommand) ? "ok" : "warn", hint: hasLocalModelSupport(hasCommand) ? undefined : "Install or start Ollama / LM Studio." },
    ],
    llmSetup: {
      configuredRoles: llmRoles.filter((role) => role.configured).map((role) => role.name),
      missingRoles: llmRoles.filter((role) => !role.configured).map((role) => role.name),
      docsPath: "docs/LOCAL_RUNTIME.md",
      hint: "Use pinchy setup interactively or pinchy config set to choose provider/model defaults. Use OpenAI-compatible providers with base URLs for local LLM servers.",
    },
    discordSetup: {
      status: missingDiscordEnv.length === 0 ? "configured" : "not_configured",
      missingEnv: missingDiscordEnv,
      docsPath: "docs/DISCORD.md",
      hint: missingDiscordEnv.length === 0
        ? "Discord remote control is configured. Confirm Message Content Intent and thread permissions in the Discord developer portal."
        : "Set the listed environment variables in your shell, launch manager, or machine-level secret manager. Pinchy setup does not write Discord tokens to repo files.",
    },
  };
}

export function summarizePinchySetupPlan(plan: PinchySetupPlan) {
  const lines = [
    "[pinchy] Setup plan:",
    `[pinchy] Playwright Chromium: ${plan.playwright.status}${plan.playwright.hint ? ` (${plan.playwright.hint})` : ""}`,
    ...plan.steps.map((step) => `[pinchy] ${step.label}: ${step.command} ${step.args.join(" ")}`),
    "[pinchy] Optional local tools:",
    ...plan.optionalChecks.map((check) => `[pinchy] ${check.name}: ${check.status}${check.hint ? ` (${check.hint})` : ""}`),
    "[pinchy] LLM runtime:",
    `[pinchy] llm roles configured: ${plan.llmSetup.configuredRoles.length > 0 ? plan.llmSetup.configuredRoles.join(", ") : "none"}`,
    `[pinchy] llm roles to configure: ${plan.llmSetup.missingRoles.length > 0 ? plan.llmSetup.missingRoles.join(", ") : "none"}`,
    `[pinchy] hint: ${plan.llmSetup.hint}`,
    `[pinchy] docs: ${plan.llmSetup.docsPath}`,
    "[pinchy] Discord remote control:",
    `[pinchy] discord: ${plan.discordSetup.status}${plan.discordSetup.missingEnv.length > 0 ? ` (missing ${plan.discordSetup.missingEnv.join(", ")})` : ""}`,
    `[pinchy] hint: ${plan.discordSetup.hint}`,
    `[pinchy] docs: ${plan.discordSetup.docsPath}`,
    "[pinchy] Next steps: pinchy doctor | pinchy up | pinchy agent",
  ];
  return `${lines.join("\n")}\n`;
}

function quoteShell(value: string) {
  return JSON.stringify(value);
}

function cleanInput(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function providerHint(providerId: string | undefined) {
  const provider = findPinchyProvider(providerId);
  if (!provider) return undefined;
  if (provider.authKind === "none") return "No API key is required for this provider.";
  if (provider.authKind === "oauth") return "Authenticate this provider through the Pi agent settings UI.";
  if (provider.envVar) return `Set ${provider.envVar} in your shell or Pi auth storage if this provider requires an API key.`;
  return undefined;
}

function providerLabel(providerId: string | undefined) {
  const provider = findPinchyProvider(providerId);
  return provider ? `${provider.label} (${provider.id})` : providerId ?? "unset";
}

function defaultBaseUrlForProvider(providerId: string | undefined) {
  if (providerId === "ollama") return "http://127.0.0.1:11434/v1";
  if (providerId === "openai") return "http://127.0.0.1:1234/v1";
  return undefined;
}

function pinchyLine(message = "") {
  return `[pinchy] ${message}`;
}

export function buildLlmRuntimeConfigTemplate(draft: PinchyLlmSetupDraft = {}) {
  const defaultProvider = cleanInput(draft.defaultProvider) ?? "ollama";
  const defaultModel = cleanInput(draft.defaultModel) ?? "qwen3-coder";
  const defaultBaseUrl = cleanInput(draft.defaultBaseUrl);
  const orchestrationProvider = cleanInput(draft.orchestrationProvider) ?? defaultProvider;
  const orchestrationModel = cleanInput(draft.orchestrationModel) ?? defaultModel;
  const orchestrationBaseUrl = cleanInput(draft.orchestrationBaseUrl) ?? defaultBaseUrl;
  const subagentProvider = cleanInput(draft.subagentProvider) ?? defaultProvider;
  const subagentModel = cleanInput(draft.subagentModel) ?? defaultModel;
  const subagentBaseUrl = cleanInput(draft.subagentBaseUrl) ?? defaultBaseUrl;

  const config: Record<string, string> = {
    defaultProvider,
    defaultModel,
    orchestrationProvider,
    orchestrationModel,
    subagentProvider,
    subagentModel,
  };
  if (defaultBaseUrl) config.defaultBaseUrl = defaultBaseUrl;
  if (orchestrationBaseUrl) config.orchestrationBaseUrl = orchestrationBaseUrl;
  if (subagentBaseUrl) config.subagentBaseUrl = subagentBaseUrl;
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function buildLlmEnvTemplate(draft: PinchyLlmSetupDraft = {}) {
  const defaultProvider = cleanInput(draft.defaultProvider) ?? "ollama";
  const defaultModel = cleanInput(draft.defaultModel) ?? "qwen3-coder";
  const defaultBaseUrl = cleanInput(draft.defaultBaseUrl);
  const orchestrationProvider = cleanInput(draft.orchestrationProvider) ?? defaultProvider;
  const orchestrationModel = cleanInput(draft.orchestrationModel) ?? defaultModel;
  const orchestrationBaseUrl = cleanInput(draft.orchestrationBaseUrl) ?? defaultBaseUrl;
  const subagentProvider = cleanInput(draft.subagentProvider) ?? defaultProvider;
  const subagentModel = cleanInput(draft.subagentModel) ?? defaultModel;
  const subagentBaseUrl = cleanInput(draft.subagentBaseUrl) ?? defaultBaseUrl;
  const entries = [
    ["PINCHY_DEFAULT_PROVIDER", defaultProvider],
    ["PINCHY_DEFAULT_MODEL", defaultModel],
    ["PINCHY_DEFAULT_BASE_URL", defaultBaseUrl],
    ["PINCHY_ORCHESTRATION_PROVIDER", orchestrationProvider],
    ["PINCHY_ORCHESTRATION_MODEL", orchestrationModel],
    ["PINCHY_ORCHESTRATION_BASE_URL", orchestrationBaseUrl],
    ["PINCHY_SUBAGENT_PROVIDER", subagentProvider],
    ["PINCHY_SUBAGENT_MODEL", subagentModel],
    ["PINCHY_SUBAGENT_BASE_URL", subagentBaseUrl],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return `${entries.map(([key, value]) => `export ${key}=${quoteShell(value)}`).join("\n")}\n`;
}

export function buildDiscordEnvTemplate(draft: PinchyDiscordSetupDraft = {}) {
  const entries = [
    ["PINCHY_DISCORD_BOT_TOKEN", "<discord-bot-token>"],
    ["PINCHY_API_TOKEN", "<local-pinchy-api-token>"],
    ["PINCHY_DISCORD_ALLOWED_GUILD_IDS", cleanInput(draft.allowedGuildIds) ?? "<discord-guild-id>"],
    ["PINCHY_DISCORD_ALLOWED_CHANNEL_IDS", cleanInput(draft.allowedChannelIds) ?? "<discord-channel-id>"],
    ["PINCHY_DISCORD_BOT_USER_ID", cleanInput(draft.botUserId) ?? "<discord-bot-user-id>"],
    ["PINCHY_DISCORD_ALLOWED_USER_IDS", cleanInput(draft.allowedUserIds)],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return `${entries.map(([key, value]) => `export ${key}=${quoteShell(value)}`).join("\n")}\n`;
}

export function summarizeInteractiveSetupDraft(draft: PinchyInteractiveSetupDraft) {
  const lines = ["[pinchy] Interactive setup templates:"];
  if (draft.llm) {
    if (draft.persistRuntimeConfig) {
      lines.push("[pinchy] Saved LLM runtime settings to .pinchy-runtime.json.");
    } else {
      lines.push(
        "[pinchy] LLM runtime .pinchy-runtime.json:",
        buildLlmRuntimeConfigTemplate(draft.llm).trimEnd(),
      );
    }
    lines.push(
      "[pinchy] LLM runtime environment alternative:",
      buildLlmEnvTemplate(draft.llm).trimEnd(),
      "[pinchy] Provider notes:",
      ...Array.from(new Set([
        providerHint(draft.llm.defaultProvider),
        providerHint(draft.llm.orchestrationProvider),
        providerHint(draft.llm.subagentProvider),
      ].filter((entry): entry is string => Boolean(entry)))).map((hint) => `[pinchy] ${hint}`),
    );
  }
  if (draft.discord) {
    lines.push(
      "[pinchy] Discord environment:",
      buildDiscordEnvTemplate(draft.discord).trimEnd(),
    );
  }
  lines.push(draft.persistRuntimeConfig
    ? "[pinchy] Pinchy setup writes only non-secret runtime settings. It does not write tokens or secrets."
    : "[pinchy] Pinchy setup prints templates only. It does not write tokens or secrets.");
  return `${lines.join("\n")}\n`;
}

async function askWithDefault(question: (prompt: string) => Promise<string>, prompt: string, fallback?: string) {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = cleanInput(await question(`${prompt}${suffix}: `));
  return answer ?? fallback;
}

async function selectOption(question: PinchySetupQuestion, title: string, choices: SetupChoice[], defaultIndex = 0) {
  const renderedChoices = choices
    .map((choice, index) => `  ${index + 1}. ${choice.label}${choice.description ? ` - ${choice.description}` : ""}`)
    .join("\n");
  const prompt = `${pinchyLine(title)}\n${renderedChoices}\n${pinchyLine(`Choose 1-${choices.length}`)} [${defaultIndex + 1}]: `;
  const answer = cleanInput(await question(prompt));
  if (!answer) return defaultIndex;
  const parsed = Number(answer);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= choices.length) return parsed - 1;
  const labelIndex = choices.findIndex((choice) => choice.label.toLowerCase().startsWith(answer.toLowerCase()));
  return labelIndex >= 0 ? labelIndex : defaultIndex;
}

async function collectLlmSetupDraft(question: PinchySetupQuestion, runtimeConfig: PinchyRuntimeConfig): Promise<PinchyLlmSetupDraft | undefined> {
  const existingProvider = runtimeConfig.defaultProvider;
  const existingModel = runtimeConfig.defaultModel;
  const defaultChoice = existingProvider ? 3 : 0;
  const setupKind = await selectOption(question, "Configure LLM runtime", [
    { label: "Local Ollama", description: "recommended for local-first setup; no API key required" },
    { label: "LM Studio or local OpenAI-compatible server", description: "use a local /v1 endpoint" },
    { label: "OpenAI or hosted OpenAI-compatible provider", description: "use OPENAI_API_KEY or a compatible endpoint" },
    { label: "Keep existing settings", description: existingProvider && existingModel ? `${providerLabel(existingProvider)} / ${existingModel}` : "leave current config unchanged" },
    { label: "Custom provider", description: "enter a provider id from the Pinchy provider catalog" },
  ], defaultChoice);

  if (setupKind === 3 && !existingProvider && !existingModel) return undefined;

  const defaults = [
    { provider: "ollama", model: "qwen3-coder", baseUrl: "http://127.0.0.1:11434/v1" },
    { provider: "openai", model: "qwen3-coder", baseUrl: "http://127.0.0.1:1234/v1" },
    { provider: "openai", model: "gpt-5.4", baseUrl: undefined },
    { provider: existingProvider ?? "ollama", model: existingModel ?? "qwen3-coder", baseUrl: runtimeConfig.defaultBaseUrl ?? defaultBaseUrlForProvider(existingProvider) },
    { provider: existingProvider ?? "ollama", model: existingModel ?? "qwen3-coder", baseUrl: runtimeConfig.defaultBaseUrl ?? defaultBaseUrlForProvider(existingProvider) },
  ][setupKind]!;

  const defaultProvider = setupKind === 4
    ? await askWithDefault(question, `Default provider (${PINCHY_PROVIDER_CATALOG.map((provider) => provider.id).slice(0, 6).join(", ")}, ...)`, defaults.provider)
    : defaults.provider;
  const defaultModel = await askWithDefault(question, "Default model", defaults.model);
  const defaultBaseUrl = await askWithDefault(question, "Default base URL for local/OpenAI-compatible servers", defaults.baseUrl);

  const roleMode = await selectOption(question, "Configure orchestration and subagent roles", [
    { label: "Use the default model for both", description: "simplest setup" },
    { label: "Customize orchestration and subagent models", description: "use a larger planner and cheaper/faster workers" },
  ], runtimeConfig.orchestrationProvider || runtimeConfig.subagentProvider ? 1 : 0);

  if (roleMode === 0) {
    return {
      defaultProvider,
      defaultModel,
      defaultBaseUrl,
      orchestrationProvider: defaultProvider,
      orchestrationModel: defaultModel,
      orchestrationBaseUrl: defaultBaseUrl,
      subagentProvider: defaultProvider,
      subagentModel: defaultModel,
      subagentBaseUrl: defaultBaseUrl,
    };
  }

  const orchestrationProvider = await askWithDefault(question, "Orchestration provider", runtimeConfig.orchestrationProvider ?? defaultProvider);
  const orchestrationModel = await askWithDefault(question, "Orchestration model", runtimeConfig.orchestrationModel ?? defaultModel);
  const orchestrationBaseUrl = await askWithDefault(question, "Orchestration base URL", runtimeConfig.orchestrationBaseUrl ?? defaultBaseUrl);
  const subagentProvider = await askWithDefault(question, "Subagent provider", runtimeConfig.subagentProvider ?? defaultProvider);
  const subagentModel = await askWithDefault(question, "Subagent model", runtimeConfig.subagentModel ?? defaultModel);
  const subagentBaseUrl = await askWithDefault(question, "Subagent base URL", runtimeConfig.subagentBaseUrl ?? defaultBaseUrl);

  return {
    defaultProvider,
    defaultModel,
    defaultBaseUrl,
    orchestrationProvider,
    orchestrationModel,
    orchestrationBaseUrl,
    subagentProvider,
    subagentModel,
    subagentBaseUrl,
  };
}

async function collectDiscordSetupDraft(question: PinchySetupQuestion, env: NodeJS.ProcessEnv): Promise<PinchyDiscordSetupDraft | undefined> {
  const existingConfigured = Boolean(
    env.PINCHY_DISCORD_BOT_TOKEN?.trim()
    && env.PINCHY_API_TOKEN?.trim()
    && env.PINCHY_DISCORD_ALLOWED_GUILD_IDS?.trim()
    && env.PINCHY_DISCORD_ALLOWED_CHANNEL_IDS?.trim(),
  );
  const choice = await selectOption(question, "Discord remote control", [
    { label: "Show setup checklist", description: "print the required environment variables and docs" },
    { label: "Enter server and channel IDs", description: "fill the non-secret Discord IDs into the env template" },
    { label: "Skip Discord for now", description: existingConfigured ? "Discord already looks configured from this shell" : "configure later" },
  ], existingConfigured ? 2 : 0);

  if (choice === 2) return undefined;
  if (choice === 0) return {};

  const allowedGuildIds = await askWithDefault(question, "Discord server/guild ID", env.PINCHY_DISCORD_ALLOWED_GUILD_IDS);
  const allowedChannelIds = await askWithDefault(question, "Discord channel ID", env.PINCHY_DISCORD_ALLOWED_CHANNEL_IDS);
  const botUserId = await askWithDefault(question, "Discord bot user ID", env.PINCHY_DISCORD_BOT_USER_ID);
  const allowedUserIds = await askWithDefault(question, "Allowed Discord user IDs (optional)", env.PINCHY_DISCORD_ALLOWED_USER_IDS);

  return {
    allowedGuildIds,
    allowedChannelIds,
    botUserId,
    allowedUserIds,
  };
}

function buildRuntimeConfigPatch(draft: PinchyLlmSetupDraft): Partial<PinchyRuntimeConfig> {
  const entries = Object.entries({
    defaultProvider: cleanInput(draft.defaultProvider),
    defaultModel: cleanInput(draft.defaultModel),
    defaultBaseUrl: cleanInput(draft.defaultBaseUrl),
    orchestrationProvider: cleanInput(draft.orchestrationProvider),
    orchestrationModel: cleanInput(draft.orchestrationModel),
    orchestrationBaseUrl: cleanInput(draft.orchestrationBaseUrl),
    subagentProvider: cleanInput(draft.subagentProvider),
    subagentModel: cleanInput(draft.subagentModel),
    subagentBaseUrl: cleanInput(draft.subagentBaseUrl),
  }).filter((entry): entry is [keyof PinchyRuntimeConfig, string] => Boolean(entry[1]));
  return Object.fromEntries(entries) as Partial<PinchyRuntimeConfig>;
}

async function collectInteractiveSetupDraft(question: PinchySetupQuestion, input: {
  runtimeConfig?: PinchyRuntimeConfig;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<PinchyInteractiveSetupDraft | undefined> {
  const runtimeConfig = input.runtimeConfig ?? {};
  const env = input.env ?? process.env;
  const answer = await selectOption(question, "What do you want to set up?", [
    { label: "LLM runtime and Discord", description: "recommended first run" },
    { label: "LLM runtime only", description: "persist provider/model choices" },
    { label: "Discord only", description: "print env guidance without writing secrets" },
    { label: "Show current plan and exit", description: "no changes" },
  ], 0);
  if (answer === 3) return undefined;

  const llm = answer === 0 || answer === 1 ? await collectLlmSetupDraft(question, runtimeConfig) : undefined;
  const discord = answer === 0 || answer === 2 ? await collectDiscordSetupDraft(question, env) : undefined;
  if (!llm && !discord) return undefined;

  return {
    llm,
    discord,
  };
}

export async function runInteractivePinchySetup(input: {
  cwd?: string;
  runtimeConfig?: PinchyRuntimeConfig;
  env?: NodeJS.ProcessEnv;
  stdin?: Readable & { isTTY?: boolean };
  stdout?: Writable & { isTTY?: boolean };
  question?: (prompt: string) => Promise<string>;
} = {}) {
  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;
  if (!input.question && (!stdin.isTTY || !stdout.isTTY)) return undefined;
  const runtimeConfig = input.runtimeConfig ?? {};
  const env = input.env ?? process.env;

  if (input.question) {
    const draft = await collectInteractiveSetupDraft(input.question, { runtimeConfig, env });
    if (!draft) return undefined;
    if (input.cwd && draft.llm) {
      updatePinchyRuntimeConfig(input.cwd, buildRuntimeConfigPatch(draft.llm));
      draft.persistRuntimeConfig = true;
    }
    return summarizeInteractiveSetupDraft(draft);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const draft = await collectInteractiveSetupDraft((prompt) => rl.question(prompt), { runtimeConfig, env });
    if (!draft) return undefined;
    if (input.cwd && draft.llm) {
      updatePinchyRuntimeConfig(input.cwd, buildRuntimeConfigPatch(draft.llm));
      draft.persistRuntimeConfig = true;
    }
    const summary = summarizeInteractiveSetupDraft(draft);
    stdout.write(summary);
    return summary;
  } finally {
    rl.close();
  }
}

export function runPinchySetup(plan: PinchySetupPlan) {
  for (const step of plan.steps) {
    const result = spawnSync(step.command, step.args, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (result.status !== 0) {
      throw new Error(`Setup step failed: ${step.label}`);
    }
  }
}
