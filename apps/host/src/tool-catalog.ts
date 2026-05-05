import { existsSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export type ToolCatalogDescriptor = {
  name: string;
  label?: string;
  description?: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters?: unknown;
  source: {
    extensionName: string;
    path: string;
  };
};

export type ToolCatalogCommandDescriptor = {
  name: string;
  description?: string;
  source: {
    extensionName: string;
    path: string;
  };
};

export type ToolCatalogListenerDescriptor = {
  eventName: string;
  source: {
    extensionName: string;
    path: string;
  };
};

export type ToolCatalogError = {
  extensionName: string;
  path: string;
  message: string;
};

export type ToolCatalogSnapshot = {
  tools: ToolCatalogDescriptor[];
  commands: ToolCatalogCommandDescriptor[];
  listeners: ToolCatalogListenerDescriptor[];
  errors: ToolCatalogError[];
};

export interface ToolCatalog {
  listTools(cwd: string): Promise<ToolCatalogSnapshot>;
}

type ExtensionEntrypoint = {
  name: string;
  path: string;
};

type RegisteredTool = {
  name?: unknown;
  label?: unknown;
  description?: unknown;
  promptSnippet?: unknown;
  promptGuidelines?: unknown;
  parameters?: unknown;
};

type RegisteredCommand = {
  description?: unknown;
};

function listWorkspaceExtensionEntrypoints(cwd: string): ExtensionEntrypoint[] {
  const root = resolve(cwd, ".pi/extensions");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: resolve(root, entry.name, "index.ts"),
    }))
    .filter((entry) => existsSync(entry.path))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return strings.length > 0 ? strings : undefined;
}

function toToolDescriptor(tool: RegisteredTool, source: ToolCatalogDescriptor["source"]) {
  const name = readString(tool.name);
  if (!name) return undefined;
  return {
    name,
    label: readString(tool.label),
    description: readString(tool.description),
    promptSnippet: readString(tool.promptSnippet),
    promptGuidelines: readStringArray(tool.promptGuidelines),
    parameters: tool.parameters,
    source,
  } satisfies ToolCatalogDescriptor;
}

function toCommandDescriptor(name: string, command: RegisteredCommand, source: ToolCatalogCommandDescriptor["source"]) {
  return {
    name,
    description: readString(command.description),
    source,
  } satisfies ToolCatalogCommandDescriptor;
}

function toListenerDescriptor(eventName: string, source: ToolCatalogListenerDescriptor["source"]) {
  return {
    eventName,
    source,
  } satisfies ToolCatalogListenerDescriptor;
}

function createCatalogHarness(source: ToolCatalogDescriptor["source"], snapshot: ToolCatalogSnapshot) {
  return {
    registerTool(tool: RegisteredTool) {
      const descriptor = toToolDescriptor(tool, source);
      if (descriptor) snapshot.tools.push(descriptor);
    },
    registerCommand(name: string, command: RegisteredCommand) {
      snapshot.commands.push(toCommandDescriptor(name, command, source));
    },
    registerProvider() {
      // Providers are runtime model configuration, not callable tools.
    },
    on(eventName: string) {
      snapshot.listeners.push(toListenerDescriptor(eventName, source));
    },
  };
}

async function loadExtension(entrypoint: ExtensionEntrypoint, snapshot: ToolCatalogSnapshot) {
  const source = { extensionName: entrypoint.name, path: entrypoint.path };
  try {
    const moduleUrl = pathToFileURL(entrypoint.path).href;
    const loaded = await import(moduleUrl);
    const register = loaded.default;
    if (typeof register !== "function") {
      snapshot.errors.push({
        ...source,
        message: "Extension does not export a default registration function.",
      });
      return;
    }
    register(createCatalogHarness(source, snapshot));
  } catch (error) {
    snapshot.errors.push({
      ...source,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function createExtensionBackedToolCatalog(): ToolCatalog {
  return {
    async listTools(cwd: string): Promise<ToolCatalogSnapshot> {
      const snapshot: ToolCatalogSnapshot = {
        tools: [],
        commands: [],
        listeners: [],
        errors: [],
      };
      for (const entrypoint of listWorkspaceExtensionEntrypoints(cwd)) {
        await loadExtension(entrypoint, snapshot);
      }
      snapshot.tools.sort((left, right) => left.name.localeCompare(right.name));
      snapshot.commands.sort((left, right) => left.name.localeCompare(right.name));
      snapshot.listeners.sort((left, right) => left.eventName.localeCompare(right.eventName) || left.source.extensionName.localeCompare(right.source.extensionName));
      snapshot.errors.sort((left, right) => left.extensionName.localeCompare(right.extensionName));
      return snapshot;
    },
  };
}

export function hasCatalogTool(snapshot: Pick<ToolCatalogSnapshot, "tools">, name: string) {
  return snapshot.tools.some((tool) => tool.name === name);
}
