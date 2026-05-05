import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLlmEnvTemplate, buildLlmRuntimeConfigTemplate, resolvePlaywrightInstallCommand, runInteractivePinchySetup, buildPinchySetupPlan, summarizePinchySetupPlan } from "../apps/host/src/pinchy-setup.js";

async function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-setup-"));
  try {
    await run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("buildPinchySetupPlan provisions Playwright and reports optional local tooling", () => {
  const plan = buildPinchySetupPlan({
    playwrightCommand: { command: "/pkg/node_modules/.bin/playwright", args: ["install", "chromium"] },
    commandExists: (command) => command === "git",
    pathExists: () => false,
    resolvePlaywrightBrowserPath: () => "/browser/chromium",
    env: {},
  });

  assert.deepEqual(plan.steps, [
    {
      label: "Install Playwright Chromium",
      command: "/pkg/node_modules/.bin/playwright",
      args: ["install", "chromium"],
    },
  ]);
  assert.equal(plan.optionalChecks.find((check) => check.name === "git")?.status, "ok");
  assert.equal(plan.optionalChecks.find((check) => check.name === "cliclick")?.status, "warn");
  assert.equal(plan.optionalChecks.find((check) => check.name === "tesseract")?.status, "warn");
  assert.equal(plan.optionalChecks.find((check) => check.name === "local_models")?.status, "warn");
  assert.deepEqual(plan.llmSetup.missingRoles, ["default", "orchestration", "subagent"]);
  assert.equal(plan.discordSetup.status, "not_configured");
  assert.deepEqual(plan.discordSetup.missingEnv, [
    "PINCHY_DISCORD_BOT_TOKEN",
    "PINCHY_API_TOKEN",
    "PINCHY_DISCORD_ALLOWED_GUILD_IDS",
    "PINCHY_DISCORD_ALLOWED_CHANNEL_IDS",
    "PINCHY_DISCORD_BOT_USER_ID",
  ]);
});

test("buildPinchySetupPlan skips Playwright installation when Chromium is already installed", () => {
  const plan = buildPinchySetupPlan({
    playwrightCommand: { command: "/pkg/node_modules/.bin/playwright", args: ["install", "chromium"] },
    commandExists: () => true,
    pathExists: (path) => path === "/browser/chromium",
    resolvePlaywrightBrowserPath: () => "/browser/chromium",
    env: {},
  });

  assert.deepEqual(plan.steps, []);
  assert.equal(plan.playwright.status, "ok");
  assert.match(summarizePinchySetupPlan(plan), /Playwright Chromium: ok/);
});

test("resolvePlaywrightInstallCommand prefers the package-local playwright binary for installed packages", () => {
  const command = resolvePlaywrightInstallCommand("/opt/homebrew/lib/node_modules/pinchy-dev", {
    pathExists: (path) => path === "/opt/homebrew/lib/node_modules/pinchy-dev/node_modules/.bin/playwright",
  });

  assert.equal(command.command, "/opt/homebrew/lib/node_modules/pinchy-dev/node_modules/.bin/playwright");
  assert.deepEqual(command.args, ["install", "chromium"]);
});

test("buildPinchySetupPlan reports LLM role readiness from env", () => {
  const plan = buildPinchySetupPlan({
    playwrightCommand: { command: "/pkg/node_modules/.bin/playwright", args: ["install", "chromium"] },
    commandExists: () => true,
    env: {
      PINCHY_DEFAULT_PROVIDER: "openai",
      PINCHY_DEFAULT_MODEL: "gpt-5.4",
      PINCHY_ORCHESTRATION_PROVIDER: "ollama",
      PINCHY_ORCHESTRATION_MODEL: "qwen3-coder",
      PINCHY_SUBAGENT_PROVIDER: "ollama",
      PINCHY_SUBAGENT_MODEL: "deepseek-coder",
    },
  });

  assert.deepEqual(plan.llmSetup.configuredRoles, ["default", "orchestration", "subagent"]);
  assert.deepEqual(plan.llmSetup.missingRoles, []);
  assert.match(plan.llmSetup.hint, /base URLs/i);
});

test("buildPinchySetupPlan reports LLM role readiness from workspace runtime config", () => {
  const plan = buildPinchySetupPlan({
    playwrightCommand: { command: "/pkg/node_modules/.bin/playwright", args: ["install", "chromium"] },
    commandExists: () => true,
    env: {},
    runtimeConfig: {
      defaultProvider: "openai-codex",
      defaultModel: "gpt-5.4",
      orchestrationProvider: "ollama",
      orchestrationModel: "qwen3-coder",
      subagentProvider: "openai",
      subagentModel: "deepseek-coder",
    },
  });

  assert.deepEqual(plan.llmSetup.configuredRoles, ["default", "orchestration", "subagent"]);
  assert.deepEqual(plan.llmSetup.missingRoles, []);
});

test("buildPinchySetupPlan reports Discord readiness without storing secrets", () => {
  const plan = buildPinchySetupPlan({
    playwrightCommand: { command: "/pkg/node_modules/.bin/playwright", args: ["install", "chromium"] },
    commandExists: () => true,
    env: {
      PINCHY_DISCORD_BOT_TOKEN: "bot-token",
      PINCHY_API_TOKEN: "api-token",
      PINCHY_DISCORD_ALLOWED_GUILD_IDS: "guild-1",
      PINCHY_DISCORD_ALLOWED_CHANNEL_IDS: "channel-1",
      PINCHY_DISCORD_BOT_USER_ID: "bot-1",
    },
  });

  assert.equal(plan.discordSetup.status, "configured");
  assert.deepEqual(plan.discordSetup.missingEnv, []);
  assert.match(plan.discordSetup.hint, /Message Content Intent/);
});

test("summarizePinchySetupPlan explains what setup will do and what remains optional", () => {
  const text = summarizePinchySetupPlan({
    steps: [
      {
        label: "Install Playwright Chromium",
        command: "/pkg/node_modules/.bin/playwright",
        args: ["install", "chromium"],
      },
    ],
    playwright: {
      status: "missing",
      hint: "Pinchy setup will install Playwright Chromium.",
    },
    optionalChecks: [
      { name: "git", status: "ok", hint: undefined },
      { name: "cliclick", status: "warn", hint: "brew install cliclick" },
      { name: "tesseract", status: "warn", hint: "brew install tesseract" },
    ],
    llmSetup: {
      configuredRoles: ["default"],
      missingRoles: ["orchestration", "subagent"],
      docsPath: "docs/LOCAL_RUNTIME.md",
      hint: "Configure runtime providers.",
    },
    discordSetup: {
      status: "not_configured",
      missingEnv: ["PINCHY_DISCORD_BOT_TOKEN", "PINCHY_DISCORD_BOT_USER_ID"],
      docsPath: "docs/DISCORD.md",
      hint: "Set the listed environment variables in your shell or service manager.",
    },
  });

  assert.match(text, /Setup plan/);
  assert.match(text, /Install Playwright Chromium/);
  assert.match(text, /Optional local tools/);
  assert.match(text, /brew install cliclick/);
  assert.match(text, /pinchy doctor/);
  assert.match(text, /Optional local tools/);
  assert.match(text, /LLM runtime/);
  assert.match(text, /orchestration, subagent/);
  assert.match(text, /docs\/LOCAL_RUNTIME\.md/);
  assert.match(text, /Discord remote control/);
  assert.match(text, /PINCHY_DISCORD_BOT_TOKEN/);
  assert.match(text, /PINCHY_DISCORD_BOT_USER_ID/);
  assert.match(text, /docs\/DISCORD\.md/);
});

test("buildLlmRuntimeConfigTemplate includes separate orchestration and subagent providers", () => {
  const template = buildLlmRuntimeConfigTemplate({
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.4",
    orchestrationProvider: "ollama",
    orchestrationModel: "qwen3-coder",
    orchestrationBaseUrl: "http://127.0.0.1:11434/v1",
    subagentProvider: "openai",
    subagentModel: "deepseek-coder",
    subagentBaseUrl: "http://127.0.0.1:1234/v1",
  });

  const config = JSON.parse(template) as Record<string, string>;
  assert.equal(config.orchestrationProvider, "ollama");
  assert.equal(config.orchestrationBaseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(config.subagentProvider, "openai");
  assert.equal(config.subagentBaseUrl, "http://127.0.0.1:1234/v1");
});

test("buildLlmEnvTemplate includes separate orchestration and subagent env defaults", () => {
  const template = buildLlmEnvTemplate({
    defaultProvider: "ollama",
    defaultModel: "qwen3-coder",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    subagentProvider: "openai",
    subagentModel: "deepseek-coder",
    subagentBaseUrl: "http://127.0.0.1:1234/v1",
  });

  assert.match(template, /PINCHY_DEFAULT_PROVIDER="ollama"/);
  assert.match(template, /PINCHY_ORCHESTRATION_PROVIDER="ollama"/);
  assert.match(template, /PINCHY_SUBAGENT_PROVIDER="openai"/);
  assert.match(template, /PINCHY_SUBAGENT_BASE_URL="http:\/\/127\.0\.0\.1:1234\/v1"/);
});

test("runInteractivePinchySetup collects provider and Discord setup without writing secrets", async () => {
  const answers = [
    "1",
    "1",
    "qwen3-coder",
    "http://127.0.0.1:11434/v1",
    "2",
    "ollama",
    "qwen3-coder",
    "http://127.0.0.1:11434/v1",
    "openai",
    "deepseek-coder",
    "http://127.0.0.1:1234/v1",
    "2",
    "guild-1",
    "channel-1",
    "bot-1",
    "",
  ];
  const summary = await runInteractivePinchySetup({
    question: async () => answers.shift() ?? "",
  });

  assert.match(summary ?? "", /"orchestrationProvider": "ollama"/);
  assert.match(summary ?? "", /"subagentProvider": "openai"/);
  assert.match(summary ?? "", /PINCHY_DISCORD_BOT_TOKEN="<discord-bot-token>"/);
  assert.doesNotMatch(summary ?? "", /bot-token-secret/);
});

test("runInteractivePinchySetup uses selector prompts by default in interactive mode", async () => {
  const answers = [
    "",
    "",
    "",
    "",
    "",
  ];
  const prompts: string[] = [];
  const summary = await runInteractivePinchySetup({
    question: async (prompt) => {
      prompts.push(prompt);
      return answers.shift() ?? "";
    },
  });

  assert.match(summary ?? "", /Interactive setup templates/);
  assert.match(summary ?? "", /"defaultProvider": "ollama"/);
  assert.match(prompts[0] ?? "", /What do you want to set up/);
  assert.match(prompts[0] ?? "", /1\. LLM runtime and Discord/);
  assert.match(prompts[1] ?? "", /Configure LLM runtime/);
});

test("runInteractivePinchySetup persists non-secret LLM settings while preserving existing config", async () => {
  await withTempDir(async (cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), `${JSON.stringify({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      defaultBaseUrl: "https://api.openai.com/v1",
      orchestrationProvider: "openai",
      orchestrationModel: "gpt-5.4",
      subagentProvider: "ollama",
      subagentModel: "qwen3-coder",
      subagentBaseUrl: "http://127.0.0.1:11434/v1",
      autoDeleteEnabled: true,
    }, null, 2)}\n`);
    const answers = [
      "2",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ];

    const summary = await runInteractivePinchySetup({
      cwd,
      runtimeConfig: {
        defaultProvider: "openai",
        defaultModel: "gpt-5.4",
        defaultBaseUrl: "https://api.openai.com/v1",
        orchestrationProvider: "openai",
        orchestrationModel: "gpt-5.4",
        subagentProvider: "ollama",
        subagentModel: "qwen3-coder",
        subagentBaseUrl: "http://127.0.0.1:11434/v1",
      },
      question: async () => answers.shift() ?? "",
    });

    const persisted = JSON.parse(readFileSync(join(cwd, ".pinchy-runtime.json"), "utf8")) as Record<string, unknown>;
    assert.match(summary ?? "", /Saved LLM runtime settings/);
    assert.equal(persisted.defaultProvider, "openai");
    assert.equal(persisted.defaultModel, "gpt-5.4");
    assert.equal(persisted.subagentProvider, "ollama");
    assert.equal(persisted.subagentBaseUrl, "http://127.0.0.1:11434/v1");
    assert.equal(persisted.autoDeleteEnabled, true);
    assert.equal(persisted.PINCHY_DISCORD_BOT_TOKEN, undefined);
  });
});

test("runInteractivePinchySetup prints only the selected setup sections", async () => {
  const llmAnswers = ["2", "1", "", "", "1"];
  const llmOnly = await runInteractivePinchySetup({
    question: async () => llmAnswers.shift() ?? "",
  });
  assert.match(llmOnly ?? "", /LLM runtime/);
  assert.doesNotMatch(llmOnly ?? "", /Discord environment/);

  const discordAnswers = ["3", "1"];
  const discordOnly = await runInteractivePinchySetup({
    question: async () => discordAnswers.shift() ?? "",
  });
  assert.match(discordOnly ?? "", /Discord environment/);
  assert.doesNotMatch(discordOnly ?? "", /LLM runtime/);
});
