import { appendMessage, createConversation, createRun, listConversations } from "./agent-state-store.js";
import { createRunContext } from "./run-context.js";
import { appendRunHistory } from "./run-history.js";
import type { Conversation, RunHistoryKind, RunKind } from "../../../packages/shared/src/contracts.js";

type EnqueuePersistentRunArgs = {
  conversationTitle: string;
  prompt: string;
  runLabel: string;
  historyKind: RunHistoryKind;
  historyLabel: string;
  runKind: RunKind;
};

function ensureConversation(cwd: string, title: string): Conversation {
  return listConversations(cwd).find((conversation) => conversation.title === title)
    ?? createConversation(cwd, { title });
}

function enqueuePersistentRun(cwd: string, args: EnqueuePersistentRunArgs) {
  const conversation = ensureConversation(cwd, args.conversationTitle);
  appendMessage(cwd, {
    conversationId: conversation.id,
    role: "user",
    content: args.prompt,
  });
  const run = createRun(cwd, {
    conversationId: conversation.id,
    goal: args.prompt,
    kind: args.runKind,
  });
  createRunContext(cwd, args.runLabel);
  appendRunHistory(cwd, {
    kind: args.historyKind,
    label: args.historyLabel,
    status: "started",
    details: `queued run ${run.id}`,
  });
  return { conversation, run };
}

export function enqueueAutonomousGoalRun(cwd: string, input: { cycle: number; goal: string; watcherQueued?: boolean }) {
  const prompt = [
    `Autonomous cycle ${input.cycle}.`,
    input.goal,
    "Stay within this repository unless explicitly instructed otherwise.",
    "Prefer documentation, tests, guardrails, and small refactors over broad rewrites.",
    "When changing behavior, prefer a test-first or regression-test-first workflow.",
    input.watcherQueued ? "Note: watcher-triggered follow-up work may already be queued." : "",
    "If no safe improvement is warranted, explain why and stop for this cycle.",
  ].filter(Boolean).join("\n\n");

  return enqueuePersistentRun(cwd, {
    conversationTitle: "Pinchy autonomous goals",
    prompt,
    runLabel: `goal:${input.cycle}`,
    historyKind: "goal",
    historyLabel: `goal:${input.cycle}`,
    runKind: "autonomous_goal",
  });
}

export function enqueueWatcherFollowUpRun(cwd: string, input: { prompt: string; changedFiles: string[] }) {
  const prompt = [
    input.prompt,
    `Changed files:\n${input.changedFiles.join("\n")}`,
    "Stay within this repository. Prefer documentation, tests, prompts, and guardrail updates before broad code changes.",
    "If no safe improvement is warranted, explain why and stop.",
  ].join("\n\n");

  return enqueuePersistentRun(cwd, {
    conversationTitle: "Pinchy watcher follow-ups",
    prompt,
    runLabel: "watcher follow-up",
    historyKind: "watch",
    historyLabel: "watcher follow-up",
    runKind: "watch_followup",
  });
}

export function enqueueIterationRun(cwd: string, input: { cycle: number; prompt: string; validationCommand: string }) {
  const fullPrompt = [
    input.prompt,
    `Before deeper analysis, run validation if safe using: ${input.validationCommand}.`,
    "Use the run_validation_command tool when appropriate so validation happens during the loop.",
  ].join("\n\n");

  return enqueuePersistentRun(cwd, {
    conversationTitle: "Pinchy continuous iteration",
    prompt: fullPrompt,
    runLabel: `iteration:${input.cycle}`,
    historyKind: "iteration",
    historyLabel: `iteration:${input.cycle}`,
    runKind: "qa_cycle",
  });
}

export function enqueueQueuedTaskRun(cwd: string, input: { title: string; prompt: string }) {
  const fullPrompt = [
    `Queued task: ${input.title}`,
    input.prompt,
    "Stay within this repository unless explicitly instructed otherwise.",
    "Prefer documentation, tests, guardrails, and small refactors over broad rewrites.",
    "When changing behavior, prefer a test-first or regression-test-first workflow.",
  ].join("\n\n");

  return enqueuePersistentRun(cwd, {
    conversationTitle: "Pinchy queued tasks",
    prompt: fullPrompt,
    runLabel: `task:${input.title}`,
    historyKind: "task",
    historyLabel: input.title,
    runKind: "user_prompt",
  });
}
