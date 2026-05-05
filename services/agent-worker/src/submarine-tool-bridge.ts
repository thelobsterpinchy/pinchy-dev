import { createExtensionBackedToolExecutor, type ToolExecutionResult, type ToolExecutor } from "../../../apps/host/src/tool-executor.js";

export type SubmarineToolCallRequest = {
  cwd: string;
  toolName: string;
  input?: Record<string, unknown>;
  toolCallId?: string;
  runId?: string;
};

export type SubmarineToolCallResponse = ToolExecutionResult;

export interface SubmarineToolBridge {
  callTool(request: SubmarineToolCallRequest): Promise<SubmarineToolCallResponse>;
}

export function createSubmarineToolBridge(input: {
  executor?: ToolExecutor;
} = {}): SubmarineToolBridge {
  const executor = input.executor ?? createExtensionBackedToolExecutor();
  return {
    async callTool(request: SubmarineToolCallRequest) {
      return executor.executeTool({
        cwd: request.cwd,
        toolName: request.toolName,
        input: request.input ?? {},
        toolCallId: request.toolCallId,
        runId: request.runId,
      });
    },
  };
}
