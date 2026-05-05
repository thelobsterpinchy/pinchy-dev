import { appendMessage, createQuestion, getRunById, hasConversation, updateRunStatus } from "../../../apps/host/src/agent-state-store.js";
import { FileBackedAgentRunRepository, FileBackedEventRecorder, FileBackedTaskRepository } from "../../../apps/host/src/orchestration-core/adapters/file-repositories.js";
import { recordAgentBlockedQuestion } from "../../../apps/host/src/orchestration-core/application/human-interactions.js";
import type { Run } from "../../../packages/shared/src/contracts.js";
import type { RunOutcome } from "./run-outcomes.js";

type ApplyRunOutcomeArgs = {
  cwd: string;
  run: Run;
  outcome: RunOutcome;
};

const systemClock = {
  nowIso() {
    return new Date().toISOString();
  },
};

export async function applyRunOutcome({ cwd, run, outcome }: ApplyRunOutcomeArgs) {
  if (!hasConversation(cwd, run.conversationId) || !getRunById(cwd, run.id)) {
    return undefined;
  }

  const taskRepository = new FileBackedTaskRepository(cwd);
  const agentRunRepository = new FileBackedAgentRunRepository(cwd);
  const eventRecorder = new FileBackedEventRecorder(cwd);

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
      const agentRun = await agentRunRepository.findByBackendRunRef(run.id);
      const question = createQuestion(cwd, {
        conversationId: run.conversationId,
        runId: run.id,
        agentRunId: agentRun?.id,
        taskId: agentRun?.taskId,
        prompt: outcome.question.prompt,
        priority: outcome.question.priority ?? "normal",
        channelHints: outcome.question.channelHints,
      });
      await recordAgentBlockedQuestion({
        taskRepository,
        agentRunRepository,
        eventRecorder,
        clock: systemClock,
        backendRunRef: run.id,
        question,
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
