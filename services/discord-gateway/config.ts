export type DiscordGatewayConfig = {
  enabled: boolean;
  botToken?: string;
  apiBaseUrl: string;
  apiToken?: string;
  allowedGuildIds: string[];
  allowedChannelIds: string[];
  allowedUserIds: string[];
  botUserId?: string;
};

function parseCsv(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadDiscordGatewayConfig(env: NodeJS.ProcessEnv = process.env): DiscordGatewayConfig {
  const botToken = env.PINCHY_DISCORD_BOT_TOKEN?.trim();
  return {
    enabled: Boolean(botToken),
    botToken: botToken || undefined,
    apiBaseUrl: env.PINCHY_API_BASE_URL?.trim() || "http://127.0.0.1:4320",
    apiToken: env.PINCHY_API_TOKEN?.trim() || undefined,
    allowedGuildIds: parseCsv(env.PINCHY_DISCORD_ALLOWED_GUILD_IDS),
    allowedChannelIds: parseCsv(env.PINCHY_DISCORD_ALLOWED_CHANNEL_IDS),
    allowedUserIds: parseCsv(env.PINCHY_DISCORD_ALLOWED_USER_IDS),
    botUserId: env.PINCHY_DISCORD_BOT_USER_ID?.trim() || undefined,
  };
}

export function assertDiscordGatewayConfigReady(config: DiscordGatewayConfig) {
  if (!config.botToken) {
    throw new Error("PINCHY_DISCORD_BOT_TOKEN is required to start the Discord gateway.");
  }
  if (!config.apiToken) {
    throw new Error("PINCHY_API_TOKEN is required to start the Discord gateway.");
  }
}
