import { appendMessage, createQuestion, getRunById, hasConversation, updateRunStatus } from "../../../apps/host/src/agent-state-store.js";
import type { Run } from "../../../packages/shared/src/contracts.js";
import type { RunOutcome } from "./run-outcomes.js";

type ApplyRunOutcomeArgs = {
  cwd: string;
  run: Run;
  outcome: RunOutcome;
};

export function applyRunOutcome({ cwd, run, outcome }: ApplyRunOutcomeArgs) {
  if (!hasConversation(cwd, run.conversationId) || !getRunById(cwd, run.id)) {
    return undefined;
  }

  switch (outcome.kind) {
    case "completed": {
      const completed = updateRunStatus(cwd, run.id, "completed", {
        summary: outcome.summary,
        sessionPath: outcome.sessionPath,
      });
      appendAgentMessage(cwd, run, outcome.message);
      return completed;
    }
    case "waiting_for_human": {
      const waiting = updateRunStatus(cwd, run.id, "waiting_for_human", {
        summary: outcome.summary,
        blockedReason: outcome.blockedReason,
        sessionPath: outcome.sessionPath,
      });
      createQuestion(cwd, {
        conversationId: run.conversationId,
        runId: run.id,
        prompt: outcome.question.prompt,
        priority: outcome.question.priority ?? "normal",
        channelHints: outcome.question.channelHints,
      });
      appendAgentMessage(cwd, run, outcome.message);
      return waiting;
    }
    case "waiting_for_approval": {
      const waiting = updateRunStatus(cwd, run.id, "waiting_for_approval", {
        summary: outcome.summary,
        blockedReason: outcome.blockedReason,
        sessionPath: outcome.sessionPath,
      });
      appendAgentMessage(cwd, run, outcome.message);
      return waiting;
    }
    case "failed": {
      const failed = updateRunStatus(cwd, run.id, "failed", {
        summary: outcome.summary,
        blockedReason: outcome.error,
        sessionPath: outcome.sessionPath,
      });
      appendAgentMessage(cwd, run, outcome.message);
      return failed;
    }
  }
}

function appendAgentMessage(cwd: string, run: Run, message: string) {
  appendMessage(cwd, {
    conversationId: run.conversationId,
    role: "agent",
    content: message,
    runId: run.id,
  });
}
