import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { AuthStorage } from "@mariozechner/pi-coding-agent";
import { PINCHY_PROVIDER_CATALOG, findPinchyProvider } from "../../../packages/shared/src/pi-provider-catalog.js";

export function buildStoredProviderCredentials(agentDir: string) {
  const authStorage = AuthStorage.create(resolve(agentDir, "auth.json"));
  const entries = PINCHY_PROVIDER_CATALOG
    .filter((provider) => provider.authStorageKey)
    .flatMap((provider) => provider.authStorageKey && authStorage.has(provider.authStorageKey) ? [[provider.id, true]] as const : []);
  return Object.fromEntries(entries);
}

export function storeProviderApiKey(args: { agentDir: string; providerId: string; apiKey: string }) {
  const provider = findPinchyProvider(args.providerId);
  const trimmedKey = args.apiKey.trim();
  if (!provider) {
    throw new Error(`Unknown provider: ${args.providerId}`);
  }
  if (!trimmedKey) {
    return;
  }
  if (provider.authKind !== "api-key" && provider.authKind !== "optional-api-key") {
    throw new Error(`Provider does not accept API keys in Pinchy settings: ${provider.id}`);
  }
  if (!provider.authStorageKey) {
    throw new Error(`Provider does not map to a Pi auth.json key: ${provider.id}`);
  }

  mkdirSync(args.agentDir, { recursive: true });
  const authStorage = AuthStorage.create(resolve(args.agentDir, "auth.json"));
  authStorage.set(provider.authStorageKey, {
    type: "api_key",
    key: trimmedKey,
  });
}
