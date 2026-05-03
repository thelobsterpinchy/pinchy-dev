import test from "node:test";
import assert from "node:assert/strict";
import { buildRunExecutionPrompt } from "../services/agent-worker/src/run-orchestration-prompt.js";

test("buildRunExecutionPrompt keeps strictly conversational user prompts inline and non-delegating", () => {
  const prompt = buildRunExecutionPrompt({
    kind: "user_prompt",
    goal: "great! how was your day?",
  });

  assert.match(prompt, /User request:/i);
  assert.match(prompt, /great! how was your day\?/i);
  assert.match(prompt, /This request is strictly conversational/i);
  assert.match(prompt, /Reply directly in the main thread/i);
  assert.match(prompt, /Do not call delegate_task_plan or queue_task for this request\./i);
  assert.doesNotMatch(prompt, /- Respond first in the main thread with a short orchestration acknowledgement/i);
  assert.doesNotMatch(prompt, /- Use delegate_task_plan to create bounded subtasks/i);
});

test("buildRunExecutionPrompt keeps delegation guidance for coding-oriented user prompts", () => {
  const prompt = buildRunExecutionPrompt({
    kind: "user_prompt",
    goal: "Investigate the dashboard bug and implement the smallest safe fix.",
  });

  assert.match(prompt, /Execution policy:/i);
  assert.match(prompt, /delegate_task_plan/i);
  assert.match(prompt, /queue_task/i);
  assert.match(prompt, /Investigate the dashboard bug and implement the smallest safe fix\./i);
});

test("buildRunExecutionPrompt passes through non-user prompts unchanged", () => {
  const prompt = buildRunExecutionPrompt({
    kind: "queued_task",
    goal: "Do background work",
  });

  assert.equal(prompt, "Do background work");
});
