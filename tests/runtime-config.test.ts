import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPinchyRuntimeConfig, loadPinchyRuntimeConfigDetails } from "../apps/host/src/runtime-config.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-runtime-config-"));
  const originalProvider = process.env.PINCHY_DEFAULT_PROVIDER;
  const originalModel = process.env.PINCHY_DEFAULT_MODEL;
  const originalThinking = process.env.PINCHY_DEFAULT_THINKING_LEVEL;
  const originalBaseUrl = process.env.PINCHY_DEFAULT_BASE_URL;
  const originalOrchestrationProvider = process.env.PINCHY_ORCHESTRATION_PROVIDER;
  const originalOrchestrationModel = process.env.PINCHY_ORCHESTRATION_MODEL;
  const originalOrchestrationBaseUrl = process.env.PINCHY_ORCHESTRATION_BASE_URL;
  const originalSubagentProvider = process.env.PINCHY_SUBAGENT_PROVIDER;
  const originalSubagentModel = process.env.PINCHY_SUBAGENT_MODEL;
  const originalSubagentBaseUrl = process.env.PINCHY_SUBAGENT_BASE_URL;
  try {
    run(cwd);
  } finally {
    if (originalProvider === undefined) delete process.env.PINCHY_DEFAULT_PROVIDER;
    else process.env.PINCHY_DEFAULT_PROVIDER = originalProvider;
    if (originalModel === undefined) delete process.env.PINCHY_DEFAULT_MODEL;
    else process.env.PINCHY_DEFAULT_MODEL = originalModel;
    if (originalThinking === undefined) delete process.env.PINCHY_DEFAULT_THINKING_LEVEL;
    else process.env.PINCHY_DEFAULT_THINKING_LEVEL = originalThinking;
    if (originalBaseUrl === undefined) delete process.env.PINCHY_DEFAULT_BASE_URL;
    else process.env.PINCHY_DEFAULT_BASE_URL = originalBaseUrl;
    if (originalOrchestrationProvider === undefined) delete process.env.PINCHY_ORCHESTRATION_PROVIDER;
    else process.env.PINCHY_ORCHESTRATION_PROVIDER = originalOrchestrationProvider;
    if (originalOrchestrationModel === undefined) delete process.env.PINCHY_ORCHESTRATION_MODEL;
    else process.env.PINCHY_ORCHESTRATION_MODEL = originalOrchestrationModel;
    if (originalOrchestrationBaseUrl === undefined) delete process.env.PINCHY_ORCHESTRATION_BASE_URL;
    else process.env.PINCHY_ORCHESTRATION_BASE_URL = originalOrchestrationBaseUrl;
    if (originalSubagentProvider === undefined) delete process.env.PINCHY_SUBAGENT_PROVIDER;
    else process.env.PINCHY_SUBAGENT_PROVIDER = originalSubagentProvider;
    if (originalSubagentModel === undefined) delete process.env.PINCHY_SUBAGENT_MODEL;
    else process.env.PINCHY_SUBAGENT_MODEL = originalSubagentModel;
    if (originalSubagentBaseUrl === undefined) delete process.env.PINCHY_SUBAGENT_BASE_URL;
    else process.env.PINCHY_SUBAGENT_BASE_URL = originalSubagentBaseUrl;
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadPinchyRuntimeConfig reads provider, model, and thinking defaults from .pinchy-runtime.json", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "medium",
      defaultBaseUrl: "http://localhost:11434/v1",
      autoDeleteEnabled: true,
      autoDeleteDays: 14,
      toolRetryWarningThreshold: 6,
      toolRetryHardStopThreshold: 12,
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.defaultProvider, "openai");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, "medium");
    assert.equal(config.defaultBaseUrl, "http://localhost:11434/v1");
    assert.equal(config.autoDeleteEnabled, true);
    assert.equal(config.autoDeleteDays, 14);
    assert.equal(config.toolRetryWarningThreshold, 6);
    assert.equal(config.toolRetryHardStopThreshold, 12);
  });
});

test("loadPinchyRuntimeConfig reads separate orchestration and subagent provider endpoints", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai-codex",
      defaultModel: "gpt-5.4",
      orchestrationProvider: "ollama",
      orchestrationModel: "qwen3-coder",
      orchestrationBaseUrl: "http://127.0.0.1:11434/v1",
      subagentProvider: "openai",
      subagentModel: "deepseek-coder",
      subagentBaseUrl: "http://127.0.0.1:1234/v1",
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.orchestrationProvider, "ollama");
    assert.equal(config.orchestrationModel, "qwen3-coder");
    assert.equal(config.orchestrationBaseUrl, "http://127.0.0.1:11434/v1");
    assert.equal(config.subagentProvider, "openai");
    assert.equal(config.subagentModel, "deepseek-coder");
    assert.equal(config.subagentBaseUrl, "http://127.0.0.1:1234/v1");
  });
});

test("loadPinchyRuntimeConfig supports env defaults for orchestration and subagent provider endpoints", () => {
  withTempDir((cwd) => {
    process.env.PINCHY_ORCHESTRATION_PROVIDER = "ollama";
    process.env.PINCHY_ORCHESTRATION_MODEL = "qwen3-coder";
    process.env.PINCHY_ORCHESTRATION_BASE_URL = "http://127.0.0.1:11434/v1";
    process.env.PINCHY_SUBAGENT_PROVIDER = "openai";
    process.env.PINCHY_SUBAGENT_MODEL = "deepseek-coder";
    process.env.PINCHY_SUBAGENT_BASE_URL = "http://127.0.0.1:1234/v1";

    const detailed = loadPinchyRuntimeConfigDetails(cwd, { globalSettingsPath: join(cwd, "missing-global-settings.json") });
    assert.equal(detailed.orchestrationProvider, "ollama");
    assert.equal(detailed.orchestrationModel, "qwen3-coder");
    assert.equal(detailed.orchestrationBaseUrl, "http://127.0.0.1:11434/v1");
    assert.equal(detailed.subagentProvider, "openai");
    assert.equal(detailed.subagentModel, "deepseek-coder");
    assert.equal(detailed.subagentBaseUrl, "http://127.0.0.1:1234/v1");
    assert.equal(detailed.sources.orchestrationProvider, "env");
    assert.equal(detailed.sources.orchestrationModel, "env");
    assert.equal(detailed.sources.orchestrationBaseUrl, "env");
    assert.equal(detailed.sources.subagentProvider, "env");
    assert.equal(detailed.sources.subagentModel, "env");
    assert.equal(detailed.sources.subagentBaseUrl, "env");
  });
});

test("loadPinchyRuntimeConfig lets workspace overrides win over env defaults", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet",
      defaultThinkingLevel: "low",
      defaultBaseUrl: "http://localhost:11434/v1",
    }));

    process.env.PINCHY_DEFAULT_PROVIDER = "openai";
    process.env.PINCHY_DEFAULT_MODEL = "gpt-5.4";
    process.env.PINCHY_DEFAULT_THINKING_LEVEL = "high";
    process.env.PINCHY_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.defaultProvider, "anthropic");
    assert.equal(config.defaultModel, "claude-sonnet");
    assert.equal(config.defaultThinkingLevel, "low");
    assert.equal(config.defaultBaseUrl, "http://localhost:11434/v1");

    const detailed = loadPinchyRuntimeConfigDetails(cwd);
    assert.equal(detailed.sources.defaultProvider, "workspace");
    assert.equal(detailed.sources.defaultModel, "workspace");
    assert.equal(detailed.sources.defaultThinkingLevel, "workspace");
    assert.equal(detailed.sources.defaultBaseUrl, "workspace");
  });
});

test("loadPinchyRuntimeConfig ignores invalid thinking level values", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "turbo",
    }));

    const config = loadPinchyRuntimeConfig(cwd, { globalSettingsPath: join(cwd, "missing-global-settings.json") });
    assert.equal(config.defaultProvider, "openai");
    assert.equal(config.defaultModel, "gpt-5.4");
    assert.equal(config.defaultThinkingLevel, undefined);
  });
});

test("loadPinchyRuntimeConfig falls back to env defaults before Pi agent defaults when workspace overrides are absent", () => {
  withTempDir((cwd) => {
    const globalSettingsPath = join(cwd, "pi-agent-settings.json");
    writeFileSync(globalSettingsPath, JSON.stringify({
      defaultProvider: "openai-codex",
      defaultModel: "gpt-5.4",
      defaultThinkingLevel: "medium",
    }));

    process.env.PINCHY_DEFAULT_PROVIDER = "openai-compatible";
    process.env.PINCHY_DEFAULT_MODEL = "qwen3-coder";
    process.env.PINCHY_DEFAULT_THINKING_LEVEL = "high";
    process.env.PINCHY_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";

    const config = loadPinchyRuntimeConfig(cwd, { globalSettingsPath });
    assert.equal(config.defaultProvider, "openai-compatible");
    assert.equal(config.defaultModel, "qwen3-coder");
    assert.equal(config.defaultThinkingLevel, "high");
    assert.equal(config.defaultBaseUrl, "http://127.0.0.1:1234/v1");

    const detailed = loadPinchyRuntimeConfigDetails(cwd, { globalSettingsPath });
    assert.equal(detailed.defaultProvider, "openai-compatible");
    assert.equal(detailed.defaultModel, "qwen3-coder");
    assert.equal(detailed.defaultThinkingLevel, "high");
    assert.equal(detailed.defaultBaseUrl, "http://127.0.0.1:1234/v1");
    assert.equal(detailed.sources.defaultProvider, "env");
    assert.equal(detailed.sources.defaultModel, "env");
    assert.equal(detailed.sources.defaultThinkingLevel, "env");
    assert.equal(detailed.sources.defaultBaseUrl, "env");
    assert.equal(detailed.sources.autoDeleteEnabled, "unset");
    assert.equal(detailed.sources.autoDeleteDays, "unset");
    assert.equal(detailed.sources.toolRetryWarningThreshold, "unset");
    assert.equal(detailed.sources.toolRetryHardStopThreshold, "unset");
  });
});

test("loadPinchyRuntimeConfig reads saved model configs and normalized model options", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      defaultProvider: "openai-compatible",
      defaultModel: "qwen3-coder",
      modelOptions: {
        temperature: 0.2,
        topP: 0.9,
        topK: 40,
        maxTokens: 1200,
        seed: 7,
        stop: ["</tool>", "\nObservation:"],
        repeatPenalty: 1.05,
        presencePenalty: 0.1,
        frequencyPenalty: 0.2,
        contextWindow: 8192,
      },
      savedModelConfigs: [
        {
          id: "local-qwen",
          name: "Local Qwen coder",
          provider: "openai-compatible",
          model: "qwen3-coder",
          baseUrl: "http://127.0.0.1:1234/v1",
          thinkingLevel: "high",
          modelOptions: {
            temperature: 0.1,
            topK: 30,
            maxTokens: 1600,
            stop: ["DONE"],
          },
        },
      ],
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.deepEqual(config.modelOptions, {
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      maxTokens: 1200,
      seed: 7,
      stop: ["</tool>", "\nObservation:"],
      repeatPenalty: 1.05,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      contextWindow: 8192,
    });
    assert.deepEqual(config.savedModelConfigs, [
      {
        id: "local-qwen",
        name: "Local Qwen coder",
        provider: "openai-compatible",
        model: "qwen3-coder",
        baseUrl: "http://127.0.0.1:1234/v1",
        thinkingLevel: "high",
        modelOptions: {
          temperature: 0.1,
          topK: 30,
          maxTokens: 1600,
          stop: ["DONE"],
        },
      },
    ]);
  });
});

test("loadPinchyRuntimeConfig reads tool retry penalty thresholds and reports their sources", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      toolRetryWarningThreshold: 7,
      toolRetryHardStopThreshold: 13,
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.toolRetryWarningThreshold, 7);
    assert.equal(config.toolRetryHardStopThreshold, 13);

    const detailed = loadPinchyRuntimeConfigDetails(cwd);
    assert.equal(detailed.sources.toolRetryWarningThreshold, "workspace");
    assert.equal(detailed.sources.toolRetryHardStopThreshold, "workspace");
  });
});

test("loadPinchyRuntimeConfig ignores invalid tool retry penalty thresholds", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      toolRetryWarningThreshold: 0,
      toolRetryHardStopThreshold: -1,
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.equal(config.toolRetryWarningThreshold, undefined);
    assert.equal(config.toolRetryHardStopThreshold, undefined);
  });
});

test("loadPinchyRuntimeConfig ignores invalid saved model config values", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      modelOptions: {
        temperature: "hot",
        topK: -1,
        stop: ["ok", 123],
      },
      savedModelConfigs: [
        {
          id: "",
          name: "",
          modelOptions: {
            topP: "bad",
          },
        },
        {
          id: "valid",
          name: "Valid",
          modelOptions: {
            topP: 0.95,
            stop: ["END", ""],
          },
        },
      ],
    }));

    const config = loadPinchyRuntimeConfig(cwd);
    assert.deepEqual(config.modelOptions, {
      stop: ["ok"],
    });
    assert.deepEqual(config.savedModelConfigs, [
      {
        id: "valid",
        name: "Valid",
        modelOptions: {
          topP: 0.95,
          stop: ["END"],
        },
      },
    ]);
  });
});
