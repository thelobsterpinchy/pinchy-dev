import type { Run } from "../../../packages/shared/src/contracts.js";

export type SubagentExecutionResult = {
  kind: "completed" | "failed" | "waiting_for_human" | "waiting_for_approval";
  summary: string;
  message?: string;
  error?: string;
  blockedReason?: string;
  question?: {
    id?: string;
    prompt: string;
    answer?: string;
  };
  sessionPath?: string;
};

export type SubagentExecutionInput = {
  cwd: string;
  run: Run;
};

export type SubagentResumeInput = {
  cwd: string;
  run: Run;
  reply: string;
};

export type SubagentSteerInput = {
  cwd: string;
  run: Run;
  content: string;
};

export type SubagentQueueFollowUpInput = {
  cwd: string;
  run: Run;
  content: string;
};

export interface SubagentAdapter {
  executeRun(input: SubagentExecutionInput): Promise<SubagentExecutionResult>;
  resumeRun(input: SubagentResumeInput): Promise<SubagentExecutionResult>;
  steerRun(input: SubagentSteerInput): Promise<void>;
  queueFollowUp(input: SubagentQueueFollowUpInput): Promise<void>;
}
