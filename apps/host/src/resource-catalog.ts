import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export type WorkspaceResourceType = "skill" | "prompt" | "knowledge";

export type WorkspaceResourceEntry = {
  type: WorkspaceResourceType;
  name: string;
  path: string;
  relativePath: string;
  preview: string;
};

export type WorkspaceResourceSnapshot = {
  resources: WorkspaceResourceEntry[];
};

export interface ResourceCatalog {
  listResources(cwd: string): WorkspaceResourceSnapshot;
}

type ResourceCatalogOptions = {
  previewCharacters?: number;
};

function readPreview(path: string, previewCharacters: number) {
  const text = readFileSync(path, "utf8").replace(/\s+/g, " ").trim();
  return text.slice(0, previewCharacters);
}

function stripMarkdownExtension(name: string) {
  return name.replace(/\.md$/, "");
}

function buildEntry(cwd: string, type: WorkspaceResourceType, name: string, path: string, previewCharacters: number): WorkspaceResourceEntry {
  return {
    type,
    name,
    path,
    relativePath: relative(cwd, path),
    preview: readPreview(path, previewCharacters),
  };
}

function listSkillResources(cwd: string, previewCharacters: number) {
  const root = resolve(cwd, ".pi/skills");
  if (!existsSync(root)) return [] as WorkspaceResourceEntry[];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: join(root, entry.name, "SKILL.md"),
    }))
    .filter((entry) => existsSync(entry.path))
    .map((entry) => buildEntry(cwd, "skill", entry.name, entry.path, previewCharacters));
}

function listPromptResources(cwd: string, previewCharacters: number) {
  const root = resolve(cwd, ".pi/prompts");
  if (!existsSync(root)) return [] as WorkspaceResourceEntry[];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const path = join(root, entry.name);
      return buildEntry(cwd, "prompt", stripMarkdownExtension(entry.name), path, previewCharacters);
    });
}

function listMarkdownFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(path);
      return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
    });
}

function listKnowledgeResources(cwd: string, previewCharacters: number) {
  const root = resolve(cwd, ".pi/knowledge");
  return listMarkdownFiles(root).map((path) => {
    const name = stripMarkdownExtension(relative(root, path));
    return buildEntry(cwd, "knowledge", name, path, previewCharacters);
  });
}

export function createWorkspaceResourceCatalog(options: ResourceCatalogOptions = {}): ResourceCatalog {
  const previewCharacters = Math.max(40, Math.min(options.previewCharacters ?? 400, 2000));
  return {
    listResources(cwd: string): WorkspaceResourceSnapshot {
      const resources = [
        ...listSkillResources(cwd, previewCharacters),
        ...listPromptResources(cwd, previewCharacters),
        ...listKnowledgeResources(cwd, previewCharacters),
      ].sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name));
      return { resources };
    },
  };
}

export function hasResource(snapshot: Pick<WorkspaceResourceSnapshot, "resources">, type: WorkspaceResourceType, name: string) {
  return snapshot.resources.some((resource) => resource.type === type && resource.name === name);
}
