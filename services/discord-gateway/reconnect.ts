export type DiscordReconnectPolicy = {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
};

export const DEFAULT_DISCORD_RECONNECT_POLICY: DiscordReconnectPolicy = {
  initialDelayMs: 1_000,
  maxDelayMs: 60_000,
  multiplier: 2,
};

export function resolveDiscordReconnectDelay(attempt: number, policy: DiscordReconnectPolicy = DEFAULT_DISCORD_RECONNECT_POLICY) {
  const exponent = Math.max(0, attempt - 1);
  const delay = Math.floor(policy.initialDelayMs * (policy.multiplier ** exponent));
  return Math.min(policy.maxDelayMs, delay);
}
