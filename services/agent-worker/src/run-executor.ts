import type { Run } from "../../../packages/shared/src/contracts.js";
import type { SubagentAdapter } from "./subagent-adapter.js";

export type RunExecutorInput = {
  cwd: string;
  run: Run;
};

export type RunResumeInput = {
  cwd: string;
  run: Run;
  reply: string;
};

export type RunSteerInput = {
  cwd: string;
  run: Run;
  content: string;
};

export type RunFollowUpInput = {
  cwd: string;
  run: Run;
  content: string;
};

type RunExecutorDependencies = {
  adapter?: SubagentAdapter;
};

const throwingAdapter: SubagentAdapter = {
  async executeRun() { throw new Error("No subagent adapter configured. Provide one via dependencies or import PiSubagentAdapter."); },
  async resumeRun() { throw new Error("No subagent adapter configured. Provide one via dependencies or import PiSubagentAdapter."); },
  async steerRun() { throw new Error("No subagent adapter configured. Provide one via dependencies or import PiSubagentAdapter."); },
  async queueFollowUp() { throw new Error("No subagent adapter configured. Provide one via dependencies or import PiSubagentAdapter."); },
};

export function createRunExecutor(dependencies: RunExecutorDependencies = {}) {
  const adapter = dependencies.adapter ?? (throwingAdapter as SubagentAdapter);

  return {
    async executeRun({ cwd, run }: RunExecutorInput) {
      return adapter.executeRun({ cwd, run });
    },

    async resumeRun({ cwd, run, reply }: RunResumeInput) {
      return adapter.resumeRun({ cwd, run, reply });
    },

    async steerRun({ cwd, run, content }: RunSteerInput) {
      return adapter.steerRun({ cwd, run, content });
    },

    async queueFollowUp({ cwd, run, content }: RunFollowUpInput) {
      return adapter.queueFollowUp({ cwd, run, content });
    },
  };
}
