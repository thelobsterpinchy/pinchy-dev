import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type RegisteredModel = {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
};

function parseModels(raw: string | undefined, fallback: RegisteredModel[]): RegisteredModel[] {
  if (!raw?.trim()) return fallback;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((id) => ({
      id,
      name: id,
      reasoning: /reason|r1|thinking/i.test(id),
      contextWindow: 128_000,
      maxTokens: 16_384,
    }));
}

function registerOpenAiCompatibleProvider(
  pi: ExtensionAPI,
  name: string,
  baseUrl: string,
  models: RegisteredModel[],
) {
  pi.registerProvider(name, {
    baseUrl,
    api: "openai-completions",
    apiKey: `${name}-local-key`,
    authHeader: false,
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: model.reasoning ?? false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    })),
  });
}

export default function localModels(pi: ExtensionAPI) {
  const ollamaEnabled = process.env.PINCHY_OLLAMA_ENABLED === "1";
  const lmStudioEnabled = process.env.PINCHY_LMSTUDIO_ENABLED === "1";

  if (ollamaEnabled) {
    registerOpenAiCompatibleProvider(
      pi,
      "pinchy-ollama",
      process.env.PINCHY_OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      parseModels(process.env.PINCHY_OLLAMA_MODELS, [
        { id: "qwen2.5-coder:32b", name: "Qwen 2.5 Coder 32B", contextWindow: 128_000, maxTokens: 16_384 },
      ]),
    );
  }

  if (lmStudioEnabled) {
    registerOpenAiCompatibleProvider(
      pi,
      "pinchy-lmstudio",
      process.env.PINCHY_LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1",
      parseModels(process.env.PINCHY_LMSTUDIO_MODELS, [
        { id: "qwen2.5-coder-32b-instruct", name: "Qwen 2.5 Coder 32B Instruct", contextWindow: 128_000, maxTokens: 16_384 },
      ]),
    );
  }
}
