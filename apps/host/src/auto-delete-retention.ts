import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { deleteConversation, listConversations } from "./agent-state-store.js";
import { loadArtifactIndex, saveArtifactIndex } from "./artifact-index.js";
import { loadPinchyRuntimeConfig } from "./runtime-config.js";

export type AutoDeleteRetentionResult = {
  enabled: boolean;
  deletedConversations: number;
  deletedArtifacts: number;
};

function isExpiredTimestamp(value: string | undefined, cutoffMs: number) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < cutoffMs;
}

function deleteFileIfPresent(path: string) {
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

export function applyAutoDeleteRetention(cwd: string, now = new Date()): AutoDeleteRetentionResult {
  const config = loadPinchyRuntimeConfig(cwd);
  if (!config.autoDeleteEnabled || !config.autoDeleteDays) {
    return { enabled: false, deletedConversations: 0, deletedArtifacts: 0 };
  }

  const cutoffMs = now.getTime() - config.autoDeleteDays * 24 * 60 * 60 * 1000;
  let deletedConversations = 0;
  for (const conversation of listConversations(cwd)) {
    if (!isExpiredTimestamp(conversation.updatedAt, cutoffMs)) continue;
    if (deleteConversation(cwd, conversation.id)) {
      deletedConversations += 1;
    }
  }

  let deletedArtifacts = 0;
  const retainedArtifactRecords = [];
  for (const record of loadArtifactIndex(cwd)) {
    const absolutePath = resolve(cwd, record.path);
    if (isExpiredTimestamp(record.createdAt, cutoffMs)) {
      if (deleteFileIfPresent(absolutePath)) deletedArtifacts += 1;
      continue;
    }
    retainedArtifactRecords.push(record);
  }
  saveArtifactIndex(cwd, retainedArtifactRecords);

  const artifactsDir = resolve(cwd, "artifacts");
  if (existsSync(artifactsDir)) {
    for (const name of readdirSync(artifactsDir)) {
      if (name === "index.json") continue;
      const path = resolve(artifactsDir, name);
      const stat = statSync(path, { throwIfNoEntry: false });
      if (!stat?.isFile()) continue;
      if (stat.mtimeMs < cutoffMs && deleteFileIfPresent(path)) {
        deletedArtifacts += 1;
      }
    }
  }

  return {
    enabled: true,
    deletedConversations,
    deletedArtifacts,
  };
}
