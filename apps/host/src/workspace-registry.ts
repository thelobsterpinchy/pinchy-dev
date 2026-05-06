import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { WorkspaceEntry } from "../../../packages/shared/src/contracts.js";

type WorkspaceRegistry = {
  activeWorkspaceId?: string;
  workspaces: WorkspaceEntry[];
};

const FILE = ".pinchy-workspaces.json";

function getRegistryPath(cwd: string) {
  return resolve(cwd, FILE);
}

function createWorkspaceEntry(path: string, name = basename(path) || path): WorkspaceEntry {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    path,
    createdAt: now,
    updatedAt: now,
  };
}

function saveRegistry(cwd: string, registry: WorkspaceRegistry) {
  const path = getRegistryPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(registry, null, 2), "utf8");
}

function loadRegistry(cwd: string): WorkspaceRegistry {
  const path = getRegistryPath(cwd);
  if (!existsSync(path)) {
    const current = createWorkspaceEntry(cwd);
    const seeded = { activeWorkspaceId: current.id, workspaces: [current] } satisfies WorkspaceRegistry;
    saveRegistry(cwd, seeded);
    return seeded;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<WorkspaceRegistry>;
    const workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces.filter((entry): entry is WorkspaceEntry => Boolean(entry?.id && entry?.name && entry?.path && entry?.createdAt && entry?.updatedAt)) : [];
    if (workspaces.length === 0) {
      const current = createWorkspaceEntry(cwd);
      const seeded = { activeWorkspaceId: current.id, workspaces: [current] } satisfies WorkspaceRegistry;
      saveRegistry(cwd, seeded);
      return seeded;
    }
    const activeWorkspaceId = workspaces.some((entry) => entry.id === parsed.activeWorkspaceId) ? parsed.activeWorkspaceId : workspaces[0]?.id;
    const normalized = { activeWorkspaceId, workspaces } satisfies WorkspaceRegistry;
    saveRegistry(cwd, normalized);
    return normalized;
  } catch {
    const current = createWorkspaceEntry(cwd);
    const seeded = { activeWorkspaceId: current.id, workspaces: [current] } satisfies WorkspaceRegistry;
    saveRegistry(cwd, seeded);
    return seeded;
  }
}

export function listWorkspaces(cwd: string) {
  return loadRegistry(cwd).workspaces;
}

export function getActiveWorkspace(cwd: string) {
  const registry = loadRegistry(cwd);
  return registry.workspaces.find((entry) => entry.id === registry.activeWorkspaceId) ?? registry.workspaces[0];
}

export function registerWorkspace(cwd: string, input: { path: string; name?: string }) {
  const trimmedPath = input.path.trim();
  if (!trimmedPath) {
    throw new Error("path is required");
  }

  const registry = loadRegistry(cwd);
  const normalizedPath = resolve(cwd, trimmedPath);
  const existing = registry.workspaces.find((entry) => entry.path === normalizedPath);
  if (existing) {
    existing.name = input.name?.trim() || existing.name;
    existing.updatedAt = new Date().toISOString();
    saveRegistry(cwd, registry);
    return existing;
  }

  const entry = createWorkspaceEntry(normalizedPath, input.name?.trim() || basename(normalizedPath) || normalizedPath);
  const next = {
    activeWorkspaceId: registry.activeWorkspaceId ?? entry.id,
    workspaces: [registry.workspaces[0], ...registry.workspaces.slice(1), entry],
  } satisfies WorkspaceRegistry;
  saveRegistry(cwd, next);
  return entry;
}

export function setActiveWorkspace(cwd: string, workspaceId: string) {
  const registry = loadRegistry(cwd);
  const match = registry.workspaces.find((entry) => entry.id === workspaceId);
  if (!match) return undefined;
  registry.activeWorkspaceId = workspaceId;
  saveRegistry(cwd, registry);
  return match;
}

export function deleteWorkspace(cwd: string, workspaceId: string) {
  const registry = loadRegistry(cwd);
  if (registry.workspaces.length <= 1) return undefined;

  const index = registry.workspaces.findIndex((entry) => entry.id === workspaceId);
  if (index < 0) return undefined;

  const [deleted] = registry.workspaces.splice(index, 1);
  if (registry.activeWorkspaceId === workspaceId) {
    registry.activeWorkspaceId = registry.workspaces[0]?.id;
  }
  saveRegistry(cwd, registry);
  return deleted;
}
