import type { AgentRun } from "../../../../../packages/shared/src/contracts.js";
import type { AgentContext, MemorySnapshot } from "./context-assembler.js";

export type AgentResult = {
  summary: string;
  artifacts?: Array<{ path: string; kind: string }>;
};

export type AgentExecutionRequest = {
  parentRunId: string;
  taskId: string;
  conversationId: string;
  goal: string;
  context: AgentContext;
  modelProfile: string;
  memorySnapshot?: MemorySnapshot;
};

export type AgentExecutionHandle = Pick<AgentRun, "backend" | "backendRunRef">;

export type AgentExecutionStatus =
  | { state: "starting" }
  | { state: "running"; progress?: string }
  | { state: "blocked"; question: { prompt: string; priority?: "low" | "normal" | "high" | "urgent" } }
  | { state: "completed"; result: AgentResult }
  | { state: "failed"; error: string }
  | { state: "cancelled" };

export interface AgentExecutor {
  backend(): AgentRun["backend"];
  start(request: AgentExecutionRequest): Promise<AgentExecutionHandle>;
  poll(backendRunRef: string): Promise<AgentExecutionStatus>;
  sendGuidance(backendRunRef: string, message: string): Promise<void>;
  answerQuestion(backendRunRef: string, answer: string): Promise<void>;
  cancel(backendRunRef: string): Promise<void>;
}
