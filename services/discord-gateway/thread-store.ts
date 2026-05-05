import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type DiscordThreadMapping = {
  id: string;
  guildId: string;
  channelId: string;
  threadId: string;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
};

const DISCORD_THREADS_FILE = ".pinchy/discord-threads.json";

function nowIso() {
  return new Date().toISOString();
}

function createMappingId(input: Pick<DiscordThreadMapping, "guildId" | "channelId" | "threadId">) {
  return `discord-thread:${input.guildId}:${input.channelId}:${input.threadId}`;
}

export function getDiscordThreadMappingPath(cwd: string) {
  return resolve(cwd, DISCORD_THREADS_FILE);
}

export function listDiscordThreadMappings(cwd: string): DiscordThreadMapping[] {
  const path = getDiscordThreadMappingPath(cwd);
  if (!existsSync(path)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isDiscordThreadMapping) : [];
  } catch {
    return [];
  }
}

function isDiscordThreadMapping(value: unknown): value is DiscordThreadMapping {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DiscordThreadMapping>;
  return typeof candidate.id === "string" &&
    typeof candidate.guildId === "string" &&
    typeof candidate.channelId === "string" &&
    typeof candidate.threadId === "string" &&
    typeof candidate.conversationId === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string";
}

function saveDiscordThreadMappings(cwd: string, mappings: DiscordThreadMapping[]) {
  const path = getDiscordThreadMappingPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(mappings, null, 2), "utf8");
}

export function findDiscordThreadMapping(cwd: string, input: { guildId: string; channelId: string; threadId: string }) {
  return listDiscordThreadMappings(cwd).find((mapping) =>
    mapping.guildId === input.guildId &&
    mapping.channelId === input.channelId &&
    mapping.threadId === input.threadId
  );
}

export function upsertDiscordThreadMapping(cwd: string, input: {
  guildId: string;
  channelId: string;
  threadId: string;
  conversationId: string;
}) {
  const mappings = listDiscordThreadMappings(cwd);
  const existing = mappings.find((mapping) =>
    mapping.guildId === input.guildId &&
    mapping.channelId === input.channelId &&
    mapping.threadId === input.threadId
  );
  const now = nowIso();

  if (existing) {
    existing.conversationId = input.conversationId;
    existing.updatedAt = now;
    saveDiscordThreadMappings(cwd, mappings);
    return { ...existing };
  }

  const mapping: DiscordThreadMapping = {
    id: createMappingId(input),
    guildId: input.guildId,
    channelId: input.channelId,
    threadId: input.threadId,
    conversationId: input.conversationId,
    createdAt: now,
    updatedAt: now,
  };
  saveDiscordThreadMappings(cwd, [mapping, ...mappings]);
  return mapping;
}
