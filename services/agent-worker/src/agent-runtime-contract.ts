import type { AgentResourceEntry, Run } from "../../../packages/shared/src/contracts.js";
import type { RunOutcome } from "./run-outcomes.js";

export type AgentRuntimeStrategy = "pi-backed" | "submarine";

export type RuntimeToolDescriptor = {
  name: string;
  label?: string;
  description?: string;
};

export type RuntimeArtifactRecord = {
  path: string;
  toolName?: string;
};

export type RuntimeAuditRecord = {
  type: string;
  runId?: string;
  summary?: string;
};

export type RuntimeCapabilitySnapshot = {
  strategy: AgentRuntimeStrategy;
  tools: RuntimeToolDescriptor[];
  resources: AgentResourceEntry[];
};

export type RuntimeExecutionInput = {
  cwd: string;
  run: Run;
};

export type RuntimeResumeInput = RuntimeExecutionInput & {
  reply: string;
};

export type RuntimeExecutionResult = {
  outcome: RunOutcome;
  artifacts?: RuntimeArtifactRecord[];
  auditEntries?: RuntimeAuditRecord[];
};

export interface AgentRuntimeContract {
  readonly strategy: AgentRuntimeStrategy;
  getCapabilities(cwd: string): Promise<RuntimeCapabilitySnapshot> | RuntimeCapabilitySnapshot;
  executeRun(input: RuntimeExecutionInput): Promise<RuntimeExecutionResult>;
  resumeRun(input: RuntimeResumeInput): Promise<RuntimeExecutionResult>;
}

export const REQUIRED_RUNTIME_TOOL_NAMES = [
  "internet_search",
  "browser_debug_scan",
  "browser_dom_snapshot",
  "browser_run_probe",
  "browser_execute_steps",
  "browser_compare_artifacts",
  "queue_task",
  "delegate_task_plan",
] as const;

export const REQUIRED_RUNTIME_RESOURCE_NAMES = [
  "design-pattern-review",
  "engineering-excellence",
  "tdd-implementation",
  "website-debugger",
  "playwright-investigation",
  "browser-bug",
] as const;

export function hasRuntimeTool(capabilities: Pick<RuntimeCapabilitySnapshot, "tools">, name: string) {
  return capabilities.tools.some((tool) => tool.name === name);
}

export function hasRuntimeResource(capabilities: Pick<RuntimeCapabilitySnapshot, "resources">, name: string) {
  return capabilities.resources.some((resource) => resource.name === name);
}
