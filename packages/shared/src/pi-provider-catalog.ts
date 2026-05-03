export type PinchyProviderAuthKind = "oauth" | "api-key" | "optional-api-key" | "environment" | "none";

export type PinchyProviderDefinition = {
  id: string;
  label: string;
  authKind: PinchyProviderAuthKind;
  authStorageKey?: string;
  envVar?: string;
  supportsBaseUrl?: boolean;
  baseUrlPlaceholder?: string;
  description: string;
};

export const PINCHY_PROVIDER_CATALOG: PinchyProviderDefinition[] = [
  {
    id: "openai-codex",
    label: "OpenAI Codex",
    authKind: "oauth",
    description: "ChatGPT Plus/Pro subscription via Pi OAuth.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    authKind: "api-key",
    authStorageKey: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    description: "Claude models via Anthropic API key.",
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    authKind: "oauth",
    description: "GitHub Copilot subscription via Pi OAuth.",
  },
  {
    id: "google-gemini-cli",
    label: "Google Gemini CLI",
    authKind: "oauth",
    description: "Gemini CLI / Cloud Code Assist via Pi OAuth.",
  },
  {
    id: "google-antigravity",
    label: "Google Antigravity",
    authKind: "oauth",
    description: "Google Antigravity sandbox via Pi OAuth.",
  },
  {
    id: "openai",
    label: "OpenAI / OpenAI-compatible",
    authKind: "optional-api-key",
    authStorageKey: "openai",
    envVar: "OPENAI_API_KEY",
    supportsBaseUrl: true,
    baseUrlPlaceholder: "https://api.openai.com/v1 or http://127.0.0.1:11434/v1",
    description: "OpenAI models or any OpenAI-compatible endpoint, including many local servers.",
  },
  {
    id: "azure-openai-responses",
    label: "Azure OpenAI Responses",
    authKind: "api-key",
    authStorageKey: "azure-openai-responses",
    envVar: "AZURE_OPENAI_API_KEY",
    supportsBaseUrl: true,
    baseUrlPlaceholder: "https://your-resource.openai.azure.com",
    description: "Azure-hosted OpenAI Responses API.",
  },
  {
    id: "google",
    label: "Google Gemini API",
    authKind: "api-key",
    authStorageKey: "google",
    envVar: "GEMINI_API_KEY",
    description: "Gemini API key access.",
  },
  {
    id: "mistral",
    label: "Mistral",
    authKind: "api-key",
    authStorageKey: "mistral",
    envVar: "MISTRAL_API_KEY",
    description: "Mistral API key access.",
  },
  {
    id: "groq",
    label: "Groq",
    authKind: "api-key",
    authStorageKey: "groq",
    envVar: "GROQ_API_KEY",
    description: "Groq API key access.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    authKind: "api-key",
    authStorageKey: "cerebras",
    envVar: "CEREBRAS_API_KEY",
    description: "Cerebras API key access.",
  },
  {
    id: "xai",
    label: "xAI",
    authKind: "api-key",
    authStorageKey: "xai",
    envVar: "XAI_API_KEY",
    description: "xAI / Grok API key access.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    authKind: "api-key",
    authStorageKey: "openrouter",
    envVar: "OPENROUTER_API_KEY",
    description: "OpenRouter API key access.",
  },
  {
    id: "vercel-ai-gateway",
    label: "Vercel AI Gateway",
    authKind: "api-key",
    authStorageKey: "vercel-ai-gateway",
    envVar: "AI_GATEWAY_API_KEY",
    description: "Vercel AI Gateway API key access.",
  },
  {
    id: "zai",
    label: "ZAI",
    authKind: "api-key",
    authStorageKey: "zai",
    envVar: "ZAI_API_KEY",
    description: "ZAI API key access.",
  },
  {
    id: "opencode",
    label: "OpenCode Zen",
    authKind: "api-key",
    authStorageKey: "opencode",
    envVar: "OPENCODE_API_KEY",
    description: "OpenCode Zen API key access.",
  },
  {
    id: "opencode-go",
    label: "OpenCode Go",
    authKind: "api-key",
    authStorageKey: "opencode-go",
    envVar: "OPENCODE_API_KEY",
    description: "OpenCode Go API key access.",
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    authKind: "api-key",
    authStorageKey: "huggingface",
    envVar: "HF_TOKEN",
    description: "Hugging Face token access.",
  },
  {
    id: "kimi-coding",
    label: "Kimi for Coding",
    authKind: "api-key",
    authStorageKey: "kimi-coding",
    envVar: "KIMI_API_KEY",
    description: "Kimi for Coding API key access.",
  },
  {
    id: "minimax",
    label: "MiniMax",
    authKind: "api-key",
    authStorageKey: "minimax",
    envVar: "MINIMAX_API_KEY",
    description: "MiniMax API key access.",
  },
  {
    id: "minimax-cn",
    label: "MiniMax (China)",
    authKind: "api-key",
    authStorageKey: "minimax-cn",
    envVar: "MINIMAX_CN_API_KEY",
    description: "MiniMax China API key access.",
  },
  {
    id: "amazon-bedrock",
    label: "Amazon Bedrock",
    authKind: "environment",
    description: "AWS credentials via environment, profile, or IAM role.",
  },
  {
    id: "google-vertex",
    label: "Google Vertex AI",
    authKind: "environment",
    description: "Google Application Default Credentials / service account.",
  },
  {
    id: "ollama",
    label: "Ollama",
    authKind: "none",
    supportsBaseUrl: true,
    baseUrlPlaceholder: "http://127.0.0.1:11434/v1",
    description: "Local Ollama server. No API key required.",
  },
];

export function findPinchyProvider(providerId: string | undefined) {
  if (!providerId) return undefined;
  return PINCHY_PROVIDER_CATALOG.find((entry) => entry.id === providerId);
}
