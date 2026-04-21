import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AgentResourceEntry, AgentResourceScope, AgentResourceType } from "../../../packages/shared/src/contracts.js";

type ResourceInventoryOptions = {
  userAgentDir?: string;
};

function listEntries(root: string, type: AgentResourceType, scope: AgentResourceScope) {
  if (!existsSync(root)) return [] as AgentResourceEntry[];

  const entries = readdirSync(root, { withFileTypes: true });
  if (type === "prompt") {
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => ({
        type,
        scope,
        name: entry.name.replace(/\.md$/, ""),
        path: join(root, entry.name),
      } satisfies AgentResourceEntry));
  }

  const markerFile = type === "extension" ? "index.ts" : "SKILL.md";
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: join(root, entry.name, markerFile) }))
    .filter((entry) => existsSync(entry.path))
    .map((entry) => ({
      type,
      scope,
      name: entry.name,
      path: entry.path,
    } satisfies AgentResourceEntry));
}

export function listPiAgentResources(workspaceCwd: string, options: ResourceInventoryOptions = {}) {
  const userAgentDir = options.userAgentDir ?? resolve(homedir(), ".pi/agent");
  const resources = [
    ...listEntries(resolve(workspaceCwd, ".pi/extensions"), "extension", "workspace"),
    ...listEntries(resolve(workspaceCwd, ".pi/skills"), "skill", "workspace"),
    ...listEntries(resolve(workspaceCwd, ".pi/prompts"), "prompt", "workspace"),
    ...listEntries(resolve(userAgentDir, "extensions"), "extension", "user"),
    ...listEntries(resolve(userAgentDir, "skills"), "skill", "user"),
    ...listEntries(resolve(userAgentDir, "prompts"), "prompt", "user"),
  ];

  return resources.sort((left, right) => {
    if (left.type !== right.type) return left.type.localeCompare(right.type);
    if (left.scope !== right.scope) return left.scope.localeCompare(right.scope);
    return left.name.localeCompare(right.name);
  });
}
