import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type ToolContent = {
  type: string;
  text?: string;
  [key: string]: unknown;
};

export type ToolExecutionResult = {
  content: ToolContent[];
  details?: unknown;
  isError?: boolean;
  blocked?: boolean;
};

export type ToolExecutionInput = {
  cwd: string;
  toolName: string;
  input: Record<string, unknown>;
  toolCallId?: string;
  runId?: string;
  hasUI?: boolean;
  signal?: AbortSignal;
};

export interface ToolExecutor {
  executeTool(input: ToolExecutionInput): Promise<ToolExecutionResult>;
}

type RegisteredTool = {
  name?: unknown;
  execute?: unknown;
};

type ToolCallListener = (event: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown> | unknown;

type ExtensionEntrypoint = {
  name: string;
  path: string;
};

type ToolRegistry = {
  tools: Map<string, RegisteredTool>;
  listeners: ToolCallListener[];
  errors: Array<{ extensionName: string; path: string; message: string }>;
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

function createUiStub() {
  return {
    notify() {
      // Tool bridge execution may run headlessly from worker/Submarine paths.
    },
  };
}

function createExecutionHarness(registry: ToolRegistry) {
  return {
    registerTool(tool: RegisteredTool) {
      if (typeof tool.name === "string" && tool.name.trim()) {
        registry.tools.set(tool.name, tool);
      }
    },
    registerCommand() {
      // Commands are not executed through the tool bridge.
    },
    registerProvider() {
      // Providers are model configuration, not tool execution.
    },
    on(eventName: string, listener: ToolCallListener) {
      if (eventName === "tool_call") {
        registry.listeners.push(listener);
      }
    },
  };
}

async function loadRegistry(cwd: string): Promise<ToolRegistry> {
  const registry: ToolRegistry = {
    tools: new Map(),
    listeners: [],
    errors: [],
  };

  for (const entrypoint of listWorkspaceExtensionEntrypoints(cwd)) {
    try {
      const loaded = await import(pathToFileURL(entrypoint.path).href);
      if (typeof loaded.default !== "function") {
        registry.errors.push({
          extensionName: entrypoint.name,
          path: entrypoint.path,
          message: "Extension does not export a default registration function.",
        });
        continue;
      }
      loaded.default(createExecutionHarness(registry));
    } catch (error) {
      registry.errors.push({
        extensionName: entrypoint.name,
        path: entrypoint.path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return registry;
}

function normalizeToolResult(value: unknown): ToolExecutionResult {
  if (!value || typeof value !== "object") {
    return {
      content: [{ type: "text", text: value === undefined ? "" : String(value) }],
    };
  }
  const result = value as Partial<ToolExecutionResult>;
  return {
    content: Array.isArray(result.content) ? result.content : [{ type: "text", text: "" }],
    details: result.details,
    isError: result.isError,
    blocked: result.blocked,
  };
}

function blockedResult(reason: string): ToolExecutionResult {
  return {
    content: [{ type: "text", text: reason }],
    details: { blocked: true, reason },
    isError: true,
    blocked: true,
  };
}

async function runToolCallListeners(registry: ToolRegistry, input: ToolExecutionInput) {
  const event = {
    toolName: input.toolName,
    input: input.input,
    runId: input.runId,
  };
  const ctx = {
    cwd: input.cwd,
    hasUI: input.hasUI === true,
    ui: createUiStub(),
  };

  for (const listener of registry.listeners) {
    const result = await listener(event, ctx);
    if (result && typeof result === "object" && (result as { block?: unknown }).block === true) {
      const reason = typeof (result as { reason?: unknown }).reason === "string"
        ? (result as { reason: string }).reason
        : `Tool call blocked: ${input.toolName}`;
      return blockedResult(reason);
    }
  }
  return undefined;
}

export function createExtensionBackedToolExecutor(): ToolExecutor {
  return {
    async executeTool(input: ToolExecutionInput): Promise<ToolExecutionResult> {
      const registry = await loadRegistry(input.cwd);
      const tool = registry.tools.get(input.toolName);
      if (!tool || typeof tool.execute !== "function") {
        const loadErrors = registry.errors.length > 0
          ? ` Loaded with errors: ${registry.errors.map((error) => `${error.extensionName}: ${error.message}`).join("; ")}`
          : "";
        return {
          content: [{ type: "text", text: `Tool not found: ${input.toolName}.${loadErrors}` }],
          details: { toolName: input.toolName, loadErrors: registry.errors },
          isError: true,
        };
      }

      const blocked = await runToolCallListeners(registry, input);
      if (blocked) return blocked;

      const result = await tool.execute(
        input.toolCallId ?? `tool-call-${Date.now()}`,
        input.input,
        input.signal,
        () => undefined,
        {
          cwd: input.cwd,
          hasUI: input.hasUI === true,
          ui: createUiStub(),
        },
      );
      return normalizeToolResult(result);
    },
  };
}
