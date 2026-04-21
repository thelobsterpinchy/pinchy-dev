import test from "node:test";
import assert from "node:assert/strict";
import type { DashboardState, SavedMemory } from "../packages/shared/src/contracts.js";
import { buildConversationComposerState, buildConversationOnboardingPresets, buildGlobalPromptState, buildMemoryDraftFromMessage, buildMemoryDraftFromQuestion, buildRunHeadline, filterDashboardArtifacts, filterSavedMemories, resolveDashboardLandingPage, resolveWorkspaceConversationSelection, summarizeConversationWorkspace, summarizeConversationWorkspacePresence, summarizeDashboardState, workspaceConversationSelectionStorageKey } from "../apps/dashboard/src/dashboard-model.js";

test("filterSavedMemories matches title, content, and tags", () => {
  const memories: SavedMemory[] = [
    { id: "memory-1", title: "Architecture", content: "Pinchy wraps Pi.", kind: "decision", tags: ["pi", "architecture"], createdAt: "", updatedAt: "", pinned: true },
    { id: "memory-2", title: "UI", content: "Use focused pages.", kind: "note", tags: ["dashboard"], createdAt: "", updatedAt: "", pinned: false },
  ];

  assert.equal(filterSavedMemories(memories, "pi").length, 1);
  assert.equal(filterSavedMemories(memories, "focused pages").length, 1);
  assert.equal(filterSavedMemories(memories, "dashboard").length, 1);
  assert.equal(filterSavedMemories(memories, "missing").length, 0);
});

test("filterDashboardArtifacts matches artifact fields", () => {
  const artifacts = [
    { name: "run.png", size: 1, mtimeMs: 1, toolName: "browser_debug_scan", note: "before", tags: ["qa"] },
    { name: "diff.html", size: 1, mtimeMs: 1, toolName: "browser_compare_artifacts", note: "after", tags: ["regression"] },
  ];

  assert.equal(filterDashboardArtifacts(artifacts, "browser").length, 2);
  assert.equal(filterDashboardArtifacts(artifacts, "regression").length, 1);
  assert.equal(filterDashboardArtifacts(artifacts, "missing").length, 0);
});

test("buildMemoryDraftFromMessage creates a reusable saved-memory draft from a conversation message", () => {
  const draft = buildMemoryDraftFromMessage({
    id: "message-1",
    conversationId: "conversation-1",
    role: "agent",
    content: "Persist the daemon task flow and keep run transitions explicit.",
    createdAt: "2026-04-20T00:00:00.000Z",
    runId: "run-1",
  });

  assert.deepEqual(draft, {
    title: "agent message",
    content: "Persist the daemon task flow and keep run transitions explicit.",
    kind: "note",
    tags: ["conversation", "agent"],
    sourceConversationId: "conversation-1",
    sourceRunId: "run-1",
  });
});

test("buildMemoryDraftFromQuestion creates a reusable saved-memory draft from a blocked question", () => {
  const draft = buildMemoryDraftFromQuestion({
    id: "question-1",
    conversationId: "conversation-1",
    runId: "run-1",
    prompt: "Should the daemon mark the task done when the persistent run is queued?",
    status: "waiting_for_human",
    priority: "high",
    createdAt: "2026-04-20T00:00:00.000Z",
    channelHints: ["dashboard"],
  });

  assert.deepEqual(draft, {
    title: "Blocked question",
    content: "Should the daemon mark the task done when the persistent run is queued?",
    kind: "decision",
    tags: ["question", "high"],
    sourceConversationId: "conversation-1",
    sourceRunId: "run-1",
  });
});

test("summarizeConversationWorkspace highlights when the agent is actively working", () => {
  const summary = summarizeConversationWorkspace({
    messages: [
      { id: "message-1", conversationId: "conversation-1", role: "user", content: "Please investigate the worker.", createdAt: "2026-04-20T00:00:00.000Z" },
      { id: "message-2", conversationId: "conversation-1", role: "agent", content: "I am checking it now.", createdAt: "2026-04-20T00:00:01.000Z" },
    ],
    runs: [
      { id: "run-1", conversationId: "conversation-1", goal: "Investigate the worker.", kind: "user_prompt", status: "running", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:01.000Z" },
    ],
    questions: [],
  });

  assert.deepEqual(summary, {
    messageCount: 2,
    runCount: 1,
    pendingQuestionCount: 0,
    statusTone: "info",
    statusLabel: "Agent is working",
    latestMessagePreview: "I am checking it now.",
    composerPlaceholder: "Send the next instruction to the running agent",
    hasActiveRun: true,
  });
});

test("summarizeConversationWorkspace highlights when the agent is waiting for a human reply", () => {
  const summary = summarizeConversationWorkspace({
    messages: [
      { id: "message-1", conversationId: "conversation-1", role: "agent", content: "Which deployment target should I use?", createdAt: "2026-04-20T00:00:00.000Z" },
    ],
    runs: [
      { id: "run-1", conversationId: "conversation-1", goal: "Ship it", kind: "user_prompt", status: "waiting_for_human", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:01.000Z" },
    ],
    questions: [
      { id: "question-1", conversationId: "conversation-1", runId: "run-1", prompt: "Which deployment target should I use?", status: "waiting_for_human", priority: "high", createdAt: "2026-04-20T00:00:00.000Z" },
    ],
  });

  assert.equal(summary.statusLabel, "Agent needs your reply");
  assert.equal(summary.statusTone, "warning");
  assert.equal(summary.pendingQuestionCount, 1);
  assert.equal(summary.composerPlaceholder, "Reply so the agent can continue this run");
  assert.equal(summary.hasActiveRun, true);
});

test("summarizeConversationWorkspacePresence explains the active workspace and empty thread state", () => {
  assert.deepEqual(summarizeConversationWorkspacePresence({
    activeWorkspaceName: "Repo A",
    activeWorkspacePath: "/tmp/repo-a",
    conversationCount: 0,
  }), {
    workspaceLabel: "Repo A (/tmp/repo-a)",
    inventoryLabel: "No saved conversations in this workspace yet.",
    selectionLabel: "Start the first thread for this repo from here.",
  });

  assert.deepEqual(summarizeConversationWorkspacePresence({
    activeWorkspaceName: "Repo B",
    activeWorkspacePath: "/tmp/repo-b",
    conversationCount: 3,
    selectedConversationTitle: "Bug bash thread",
  }), {
    workspaceLabel: "Repo B (/tmp/repo-b)",
    inventoryLabel: "3 conversations available in this workspace.",
    selectionLabel: "Current thread: Bug bash thread",
  });
});

test("buildConversationComposerState supports selected and empty-workspace chat flows", () => {
  assert.deepEqual(buildConversationComposerState({
    activeWorkspaceName: "Repo A",
    conversationCount: 0,
  }), {
    title: "Start the first conversation",
    subtitle: "This workspace has no saved conversations yet. Send a prompt to create the first local Pinchy thread here.",
    placeholder: "Describe the first task for Pinchy in Repo A",
    primaryActionLabel: "Start first thread",
  });

  assert.deepEqual(buildConversationComposerState({
    activeWorkspaceName: "Repo B",
    conversationCount: 2,
    selectedConversationTitle: "Bug bash thread",
    selectedConversationStatus: "Agent is working",
    selectedConversationSummary: {
      messageCount: 4,
      runCount: 2,
      pendingQuestionCount: 1,
      statusTone: "info",
      statusLabel: "Agent is working",
      latestMessagePreview: "Checking the worker now.",
      composerPlaceholder: "Send the next instruction to the running agent",
      hasActiveRun: true,
    },
  }), {
    title: "Bug bash thread",
    subtitle: "4 messages • 2 runs • 1 pending questions",
    placeholder: "Send the next instruction to the running agent",
    primaryActionLabel: "Send message to agent",
    statusLabel: "Agent is working",
    latestMessagePreview: "Checking the worker now.",
  });
});

test("workspace conversation selection helpers keep thread selection scoped per workspace", () => {
  assert.equal(workspaceConversationSelectionStorageKey("workspace-1"), "pinchy.dashboard.workspace.workspace-1.selectedConversationId");

  const conversations = [
    { id: "conversation-1", title: "One" },
    { id: "conversation-2", title: "Two" },
  ];

  assert.equal(resolveWorkspaceConversationSelection(conversations, "conversation-2", undefined), "conversation-2");
  assert.equal(resolveWorkspaceConversationSelection(conversations, undefined, "conversation-1"), "conversation-1");
  assert.equal(resolveWorkspaceConversationSelection(conversations, undefined, "missing"), "conversation-1");
  assert.equal(resolveWorkspaceConversationSelection([], undefined, "conversation-1"), undefined);
});

test("buildConversationOnboardingPresets gives empty workspaces one-click starting points", () => {
  assert.deepEqual(buildConversationOnboardingPresets("Repo A"), [
    {
      title: "Debug current issue",
      prompt: "Inspect the current issue in Repo A, gather evidence first, identify the likely root cause, and propose or apply the smallest safe fix.",
    },
    {
      title: "Continue the next roadmap slice",
      prompt: "Continue the next bounded roadmap slice in Repo A with TDD where practical, keep changes small, and validate the result before marking progress.",
    },
    {
      title: "Understand this codebase",
      prompt: "Survey Repo A, summarize the current architecture, key entrypoints, and the safest high-value next improvements.",
    },
  ]);
});

test("resolveDashboardLandingPage prefers the chat workspace by default", () => {
  assert.equal(resolveDashboardLandingPage(undefined), "conversations");
  assert.equal(resolveDashboardLandingPage("memory"), "memory");
  assert.equal(resolveDashboardLandingPage("operations"), "operations");
});

test("buildGlobalPromptState targets the selected conversation when one is active", () => {
  assert.deepEqual(buildGlobalPromptState({
    selectedConversationTitle: "Bug bash thread",
    selectedConversationStatus: "Agent is working",
  }), {
    targetLabel: "Talking to: Bug bash thread",
    targetStatus: "Agent is working",
    helperText: "Messages will be appended to the selected conversation and queued for the agent.",
    primaryActionLabel: "Send to selected conversation",
    secondaryActionLabel: "Start new thread",
  });

  assert.deepEqual(buildGlobalPromptState({}), {
    targetLabel: "No conversation selected",
    targetStatus: "New conversation",
    helperText: "Send a prompt now to create a fresh conversation and start a new run.",
    primaryActionLabel: "New convo + run",
    secondaryActionLabel: "Select a conversation to keep talking in one thread",
  });
});

test("buildRunHeadline keeps short goals unchanged and truncates long watcher goals for side rails", () => {
  assert.equal(buildRunHeadline({ goal: "Investigate the worker.", summary: undefined }, 60), "Investigate the worker.");

  const watcherHeadline = buildRunHeadline({
    goal: "A watched Pinchy file changed. Run a bounded maintenance review for the changed area, prefer tests/docs/guardrails, and stop if no safe improvement is needed.",
    summary: undefined,
  }, 72);
  assert.match(watcherHeadline, /^A watched Pinchy file changed\./);
  assert.match(watcherHeadline, /…$/);
  assert.ok(watcherHeadline.length <= 72);

  const summaryHeadline = buildRunHeadline({
    goal: "Long goal",
    summary: "Completed a targeted dashboard pass and verified the live conversation workspace rendering.",
  }, 64);
  assert.match(summaryHeadline, /^Completed a targeted dashboard pass/);
  assert.match(summaryHeadline, /…$/);
  assert.ok(summaryHeadline.length <= 64);
});

test("summarizeDashboardState exposes headline counts for overview cards", () => {
  const summary = summarizeDashboardState({
    tasks: [
      { id: "task-1", title: "Task", prompt: "Prompt", status: "pending", createdAt: "", updatedAt: "" },
      { id: "task-2", title: "Task", prompt: "Prompt", status: "done", createdAt: "", updatedAt: "" },
    ],
    approvals: [
      { id: "approval-1", toolName: "tool", reason: "Need approval", status: "pending", payload: {} },
      { id: "approval-2", toolName: "tool", reason: "Approved already", status: "approved", payload: {} },
    ],
    runHistory: [{ id: "history-1", kind: "goal", label: "Goal", status: "started", ts: "" }],
    pendingReloadRequests: [
      { id: "reload-1", status: "pending", requestedAt: "" },
      { id: "reload-2", status: "processed", requestedAt: "" },
    ],
    memories: [
      { id: "memory-1", title: "Pinned", content: "A", kind: "note", tags: [], createdAt: "", updatedAt: "", pinned: true },
      { id: "memory-2", title: "Normal", content: "B", kind: "note", tags: [], createdAt: "", updatedAt: "", pinned: false },
    ],
  } satisfies Pick<DashboardState, "tasks" | "approvals" | "runHistory" | "pendingReloadRequests" | "memories">);

  assert.deepEqual(summary, {
    pendingTasks: 1,
    pendingApprovals: 1,
    recentRuns: 1,
    pendingReloads: 1,
    savedMemories: 2,
    pinnedMemories: 1,
  });
});
