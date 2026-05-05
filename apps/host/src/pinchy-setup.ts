import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { findPinchyProvider } from "../../../packages/shared/src/pi-provider-catalog.js";
import { getPinchyPackageRoot } from "./package-runtime.js";
import type { PinchyRuntimeConfig } from "./runtime-config.js";

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
};

function commandExists(command: string) {
  const result = spawnSync("bash", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

export function resolvePlaywrightInstallCommand(packageRoot = getPinchyPackageRoot()) {
  return {
    command: resolve(dirname(packageRoot), ".bin", "playwright"),
    args: ["install", "chromium"],
  };
}

function hasLocalModelSupport(hasCommand: (command: string) => boolean) {
  return hasCommand("ollama") || hasCommand("lmstudio") || hasCommand("lms");
}

export function buildPinchySetupPlan(input: {
  playwrightCommand?: { command: string; args: string[] };
  commandExists?: (command: string) => boolean;
  env?: NodeJS.ProcessEnv;
  runtimeConfig?: PinchyRuntimeConfig;
} = {}): PinchySetupPlan {
  const hasCommand = input.commandExists ?? commandExists;
  const env = input.env ?? process.env;
  const runtimeConfig = input.runtimeConfig ?? {};
  const playwrightCommand = input.playwrightCommand ?? resolvePlaywrightInstallCommand();
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
    steps: [
      {
        label: "Install Playwright Chromium",
        command: playwrightCommand.command,
        args: playwrightCommand.args,
      },
    ],
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
  const lines = [
    "[pinchy] Interactive setup templates:",
    "[pinchy] LLM runtime .pinchy-runtime.json:",
    buildLlmRuntimeConfigTemplate(draft.llm).trimEnd(),
    "[pinchy] LLM runtime environment alternative:",
    buildLlmEnvTemplate(draft.llm).trimEnd(),
    "[pinchy] Provider notes:",
    ...Array.from(new Set([
      providerHint(draft.llm?.defaultProvider),
      providerHint(draft.llm?.orchestrationProvider),
      providerHint(draft.llm?.subagentProvider),
    ].filter((entry): entry is string => Boolean(entry)))).map((hint) => `[pinchy] ${hint}`),
    "[pinchy] Discord environment:",
    buildDiscordEnvTemplate(draft.discord).trimEnd(),
    "[pinchy] Pinchy setup prints templates only. It does not write tokens or secrets.",
  ];
  return `${lines.join("\n")}\n`;
}

async function askWithDefault(question: (prompt: string) => Promise<string>, prompt: string, fallback?: string) {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = cleanInput(await question(`${prompt}${suffix}: `));
  return answer ?? fallback;
}

async function collectInteractiveSetupDraft(question: (prompt: string) => Promise<string>): Promise<PinchyInteractiveSetupDraft | undefined> {
  const answer = (await askWithDefault(question, "Generate Discord and LLM setup templates? y/N", "N"))?.toLowerCase();
  if (answer !== "y" && answer !== "yes") return undefined;

  const defaultProvider = await askWithDefault(question, "Default provider", "ollama");
  const defaultModel = await askWithDefault(question, "Default model", "qwen3-coder");
  const defaultBaseUrl = await askWithDefault(question, "Default base URL for local/OpenAI-compatible servers", defaultProvider === "ollama" ? "http://127.0.0.1:11434/v1" : undefined);
  const orchestrationProvider = await askWithDefault(question, "Orchestration provider", defaultProvider);
  const orchestrationModel = await askWithDefault(question, "Orchestration model", defaultModel);
  const orchestrationBaseUrl = await askWithDefault(question, "Orchestration base URL", defaultBaseUrl);
  const subagentProvider = await askWithDefault(question, "Subagent provider", defaultProvider);
  const subagentModel = await askWithDefault(question, "Subagent model", defaultModel);
  const subagentBaseUrl = await askWithDefault(question, "Subagent base URL", defaultBaseUrl);
  const allowedGuildIds = await askWithDefault(question, "Discord allowed guild IDs");
  const allowedChannelIds = await askWithDefault(question, "Discord allowed channel IDs");
  const botUserId = await askWithDefault(question, "Discord bot user ID");
  const allowedUserIds = await askWithDefault(question, "Discord allowed user IDs (optional)");

  return {
    llm: {
      defaultProvider,
      defaultModel,
      defaultBaseUrl,
      orchestrationProvider,
      orchestrationModel,
      orchestrationBaseUrl,
      subagentProvider,
      subagentModel,
      subagentBaseUrl,
    },
    discord: {
      allowedGuildIds,
      allowedChannelIds,
      botUserId,
      allowedUserIds,
    },
  };
}

export async function runInteractivePinchySetup(input: {
  stdin?: Readable & { isTTY?: boolean };
  stdout?: Writable & { isTTY?: boolean };
  question?: (prompt: string) => Promise<string>;
} = {}) {
  const stdin = input.stdin ?? process.stdin;
  const stdout = input.stdout ?? process.stdout;
  if (!input.question && (!stdin.isTTY || !stdout.isTTY)) return undefined;

  if (input.question) {
    const draft = await collectInteractiveSetupDraft(input.question);
    return draft ? summarizeInteractiveSetupDraft(draft) : undefined;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const draft = await collectInteractiveSetupDraft((prompt) => rl.question(prompt));
    if (!draft) return undefined;
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
