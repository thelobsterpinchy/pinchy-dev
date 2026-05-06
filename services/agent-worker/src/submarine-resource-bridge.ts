import { createWorkspaceResourceCatalog, type ResourceCatalog, type WorkspaceResourceEntry } from "../../../apps/host/src/resource-catalog.js";

export type SubmarineResourceContext = {
  resources: WorkspaceResourceEntry[];
  systemPrompt: string;
};

const PRIORITY_RESOURCES = new Set([
  "design-pattern-review",
  "engineering-excellence",
  "tdd-implementation",
  "website-debugger",
  "playwright-investigation",
  "browser-bug",
  "design-patterns/adapter",
  "design-patterns/facade",
  "design-patterns/hexagonal-architecture",
  "design-patterns/strategy",
  "design-anti-patterns/god-object",
  "design-anti-patterns/big-ball-of-mud",
]);

function sortResourcesForContext(resources: WorkspaceResourceEntry[]) {
  return [...resources]
    .filter((resource) => PRIORITY_RESOURCES.has(resource.name))
    .sort((left, right) => {
      const typeOrder = ["skill", "prompt", "knowledge"];
      return typeOrder.indexOf(left.type) - typeOrder.indexOf(right.type) || left.name.localeCompare(right.name);
    });
}

function formatResourceLine(resource: WorkspaceResourceEntry) {
  const prefix = resource.type === "skill"
    ? `/skill:${resource.name}`
    : resource.name;
  return `- ${resource.type} ${prefix} (${resource.relativePath}): ${resource.preview}`;
}

export function buildSubmarineResourceContext(cwd: string, input: {
  catalog?: ResourceCatalog;
} = {}): SubmarineResourceContext {
  const catalog = input.catalog ?? createWorkspaceResourceCatalog();
  const snapshot = catalog.listResources(cwd);
  const priorityResources = sortResourcesForContext(snapshot.resources);
  const systemPrompt = [
    "Workspace resources available to Submarine:",
    "Use these resources instead of guessing when the user asks for design, TDD, browser debugging, or structural guidance.",
    "Retrieve or route to the relevant resource before making structural changes.",
    ...priorityResources.map(formatResourceLine),
  ].join("\n");

  return {
    resources: snapshot.resources,
    systemPrompt,
  };
}
