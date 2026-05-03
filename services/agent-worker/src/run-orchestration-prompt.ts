import type { Run } from "../../../packages/shared/src/contracts.js";
import { assessUserRequestTasks } from "../../../apps/host/src/orchestration-policy.js";

export function shouldReuseConversationSessionForRun(run: Pick<Run, "kind" | "goal">) {
  return run.kind === "user_prompt" && assessUserRequestTasks(run.goal).requiresDelegation;
}

export function buildRunExecutionPrompt(run: Pick<Run, "kind" | "goal">) {
  if (run.kind !== "user_prompt") {
    return run.goal;
  }

  const assessment = assessUserRequestTasks(run.goal);

  if (!assessment.requiresDelegation) {
    return [
      "User request:",
      run.goal,
      "Request assessment:",
      `- extracted task count: ${assessment.taskCount}`,
      `- execution shape: ${assessment.executionShape}`,
      "Execution policy:",
      "- This request is strictly conversational or otherwise small enough to keep inline.",
      "- Reply directly in the main thread in a short natural way.",
      "- Do not call delegate_task_plan or queue_task for this request.",
      "- Do not describe delegation unless you actually delegated work.",
    ].join("\n\n");
  }

  return [
    "User request:",
    run.goal,
    "Request assessment:",
    `- extracted task count: ${assessment.taskCount}`,
    `- execution shape: ${assessment.executionShape}`,
    "Execution policy:",
    "- Respond first in the main thread with a short orchestration acknowledgement before doing deeper work.",
    "- Decompose the request into one or more bounded tasks before acting.",
    "- When work can be parallelized, delegate it first instead of doing everything yourself.",
    "- Use delegate_task_plan to create bounded subtasks in one tool call when there are multiple independent workstreams or a dependency chain.",
    "- Use queue_task only for a single bounded follow-up task when a full plan is unnecessary.",
    "- If one task depends on another, encode that dependency in delegate_task_plan and wait to implement downstream work until upstream investigation finishes.",
    "- Keep Pinchy as the orchestrator in the main thread and summarize subtask progress there.",
    "- When a delegated agent finishes or asks a question, wake up in the main thread and relay that completion or question back to the user.",
    "- For coding or implementation changes, delegate to a subagent even when the work is a single non-parallelizable change.",
    "- If the request has multiple tasks, explicitly list them in your acknowledgement and say whether they are parallel, dependency-chained, or mixed.",
    "- Only skip delegation when the request is truly small, non-coding, or strictly conversational; if so, say why briefly before proceeding.",
  ].join("\n\n");
}
