import test from "node:test";
import assert from "node:assert/strict";
import type { DashboardState, PinchyTask, SavedMemory } from "../packages/shared/src/contracts.js";
import { buildAgentChatChromeState, buildAgentSessionState, buildChatWorkbenchState, buildChatWorkspacePanelState, buildConversationAgentListState, buildConversationComposerState, buildConversationDetailsProgressState, buildConversationListEntryPresentation, buildConversationOnboardingPresets, buildConversationOrchestrationState, buildConversationShellHeaderState, buildConversationThinkingState, buildConversationTranscriptState, buildDashboardSidebarState, buildDashboardUtilityRailState, buildGlobalPromptState, buildMemoryDraftFromMessage, buildMemoryDraftFromQuestion, buildRunHeadline, buildSettingsConfigurationState, buildTranscriptMessagePresentation, decideTranscriptFollowUp, filterDashboardArtifacts, filterSavedMemories, mergeSettingsDraftWithFetchedSettings, parseDelegationPlanDraft, resolveConversationRouteAfterRefresh, resolveConversationShellInitialState, resolveDashboardLandingPage, resolveWorkspaceConversationSelection, summarizeConversationWorkspace, summarizeConversationWorkspacePresence, summarizeDashboardState, workspaceConversationSelectionStorageKey } from "../apps/dashboard/src/dashboard-model.js";

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

test("buildConversationThinkingState excludes orchestration-only artifacts from the main chat thinking summary", () => {
  assert.deepEqual(buildConversationThinkingState({
    runs: [
      {
        id: "run-1",
        conversationId: "conversation-1",
        goal: "Fix the chat UI",
        kind: "user_prompt",
        status: "running",
        createdAt: "2026-04-25T00:00:00.000Z",
        updatedAt: "2026-04-25T00:00:05.000Z",
      },
    ],
    messages: [
      {
        id: "message-1",
        conversationId: "conversation-1",
        role: "agent",
        runId: "run-1",
        kind: "orchestration_update",
        content: "Delegated agent finished a bounded task.",
        createdAt: "2026-04-25T00:00:02.000Z",
      },
      {
        id: "message-2",
        conversationId: "conversation-1",
        role: "agent",
        runId: "run-1",
        kind: "orchestration_final",
        content: "Final synthesis summary: delegated work is complete.",
        createdAt: "2026-04-25T00:00:03.000Z",
      },
    ],
    now: "2026-04-25T00:00:06.000Z",
  }), {
    visible: true,
    runId: "run-1",
    label: "Pinchy is thinking (6 sec)",
    goal: "Fix the chat UI",
    elapsedSeconds: 6,
    details: ["Goal: Fix the chat UI"],
  });
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

test("resolveDashboardLandingPage always opens the chat workspace first", () => {
  assert.equal(resolveDashboardLandingPage(undefined), "conversations");
  assert.equal(resolveDashboardLandingPage("memory"), "conversations");
  assert.equal(resolveDashboardLandingPage("operations"), "conversations");
});


test("buildDashboardSidebarState follows the mock-style wider-open chat shell and still fully hides when collapsed", () => {
  assert.deepEqual(buildDashboardSidebarState({ isOpen: true, page: "conversations" }), {
    isOpen: true,
    width: 288,
    toggleLabel: "Hide menu",
    title: "Pinchy",
    subtitle: "Control plane",
  });

  assert.deepEqual(buildDashboardSidebarState({ isOpen: false, page: "settings" }), {
    isOpen: false,
    width: 0,
    toggleLabel: "Show menu",
    title: "Pinchy",
    subtitle: "Control plane",
  });
});

test("buildDashboardUtilityRailState uses the mock-style details rail width and only enables it for conversations", () => {
  assert.deepEqual(buildDashboardUtilityRailState({ isOpen: true, page: "conversations" }), {
    isOpen: true,
    width: 320,
    toggleLabel: "Hide tools rail",
    title: "Parallel workbench",
    subtitle: "Questions, workflows, runs, and delegation tools stay nearby without taking over the chat.",
  });

  assert.deepEqual(buildDashboardUtilityRailState({ isOpen: true, page: "overview" }), {
    isOpen: false,
    width: 0,
    toggleLabel: "Hide tools rail",
    title: "Parallel workbench",
    subtitle: "Questions, workflows, runs, and delegation tools stay nearby without taking over the chat.",
  });
});

 test("resolveConversationShellInitialState follows the mock-style open-by-default chat shell", () => {
  assert.deepEqual(resolveConversationShellInitialState(), {
    sidebarOpen: true,
    utilityRailOpen: true,
  });
});

 test("resolveConversationRouteAfterRefresh keeps the root new-chat shell stable during background refreshes", () => {
  assert.equal(resolveConversationRouteAfterRefresh({
    pathname: "/",
    routeConversationId: undefined,
    availableConversationIds: ["conversation-1", "conversation-2"],
  }), undefined);

  assert.equal(resolveConversationRouteAfterRefresh({
    pathname: "/c/conversation-2",
    routeConversationId: "conversation-2",
    availableConversationIds: ["conversation-1", "conversation-2"],
  }), "/c/conversation-2");

  assert.equal(resolveConversationRouteAfterRefresh({
    pathname: "/c/conversation-2/agents/task-1",
    routeConversationId: "conversation-2",
    availableConversationIds: ["conversation-1", "conversation-2"],
  }), "/c/conversation-2/agents/task-1");

  assert.equal(resolveConversationRouteAfterRefresh({
    pathname: "/c/missing",
    routeConversationId: "missing",
    availableConversationIds: ["conversation-1", "conversation-2"],
  }), "/c/conversation-1");
});

test("buildConversationShellHeaderState keeps the utility-rail toggle distinct and right-aligned on conversations", () => {
  assert.deepEqual(buildConversationShellHeaderState({ page: "conversations", utilityRailToggleLabel: "Show tools rail" }), {
    sidebarToggle: {
      icon: "menu",
      align: "left",
      label: "Show menu",
    },
    utilityRailToggle: {
      icon: "utility-rail",
      align: "right",
      label: "Show tools rail",
    },
  });

  assert.deepEqual(buildConversationShellHeaderState({ page: "settings", utilityRailToggleLabel: "Show tools rail" }), {
    sidebarToggle: {
      icon: "menu",
      align: "left",
      label: "Show menu",
    },
    utilityRailToggle: undefined,
  });
});

test("buildChatWorkbenchState keeps background work visible from the chat home", () => {
  assert.deepEqual(buildChatWorkbenchState({
    pendingTasks: 3,
    pendingApprovals: 1,
    recentRuns: 8,
    hasActiveConversationRun: true,
  }), {
    title: "Parallel workbench",
    subtitle: "Chat with Pinchy while tasks, approvals, and background runs continue alongside this thread.",
    badges: [
      { label: "3 queued tasks", tone: "info" },
      { label: "1 approval waiting", tone: "warning" },
      { label: "8 recent runs", tone: "idle" },
      { label: "thread active", tone: "info" },
    ],
    helper: "Queue focused background work here without leaving the main conversation.",
  });
});

test("buildChatWorkspacePanelState keeps chat tools collapsed by default and auto-expands workflows only for active work", () => {
  assert.deepEqual(buildChatWorkspacePanelState({
    hasSelectedConversation: false,
    linkedTaskCounts: {
      pending: 0,
      running: 0,
      blocked: 0,
      done: 0,
    },
    queuedTaskCount: 0,
    delegationTaskCount: 0,
  }), {
    tools: {
      title: "Tools & delegation",
      summary: "Select a conversation to unlock bounded task tools for this thread.",
      defaultExpanded: false,
      toggleLabel: "Show tools",
    },
    workflows: {
      title: "Linked workflows",
      summary: "No linked workflows for this conversation yet.",
      defaultExpanded: false,
      toggleLabel: "Show workflows",
      activeCount: 0,
    },
  });

  assert.deepEqual(buildChatWorkspacePanelState({
    hasSelectedConversation: true,
    linkedTaskCounts: {
      pending: 1,
      running: 1,
      blocked: 0,
      done: 2,
    },
    queuedTaskCount: 1,
    delegationTaskCount: 3,
  }), {
    tools: {
      title: "Tools & delegation",
      summary: "1 queued task draft • 3 delegation tasks ready",
      defaultExpanded: false,
      toggleLabel: "Show tools",
    },
    workflows: {
      title: "Linked workflows",
      summary: "2 active workflows • 2 completed for this thread.",
      defaultExpanded: true,
      toggleLabel: "Show workflows",
      activeCount: 2,
    },
  });
});

test("buildConversationOrchestrationState keeps subtask orchestration scoped to the selected conversation", () => {
  const tasks: PinchyTask[] = [
    { id: "task-1", title: "Audit worker logs", prompt: "Inspect the worker logs.", status: "pending", createdAt: "", updatedAt: "", conversationId: "conversation-1", source: "user" },
    { id: "task-2", title: "Review dashboard smoke", prompt: "Run the smoke checks.", status: "running", createdAt: "", updatedAt: "", conversationId: "conversation-1", runId: "run-2", source: "daemon" },
    { id: "task-3", title: "Unrelated task", prompt: "Other workspace flow.", status: "pending", createdAt: "", updatedAt: "", conversationId: "conversation-2", source: "user" },
  ];

  assert.deepEqual(buildConversationOrchestrationState({
    conversationId: "conversation-1",
    tasks,
  }), {
    title: "Parallel workflows",
    subtitle: "Pinchy can keep orchestrating this thread while bounded tasks run in parallel.",
    helper: "2 linked background tasks for this conversation.",
    linkedTasks: [tasks[1], tasks[0]],
    counts: {
      pending: 1,
      running: 1,
      blocked: 0,
      done: 0,
    },
  });
});

test("parseDelegationPlanDraft extracts bounded subtasks from a compact multi-line draft", () => {
  assert.deepEqual(parseDelegationPlanDraft(`Audit worker logs :: Inspect the worker logs and summarize failures.\nReview dashboard smoke :: Run the dashboard smoke checks and report only actionable issues.\n\nInvalid line`), [
    {
      title: "Audit worker logs",
      prompt: "Inspect the worker logs and summarize failures.",
    },
    {
      title: "Review dashboard smoke",
      prompt: "Run the dashboard smoke checks and report only actionable issues.",
    },
  ]);
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

test("buildAgentChatChromeState summarizes the chat shell like the mock chat workspace", () => {
  assert.deepEqual(buildAgentChatChromeState({
    selectedConversationTitle: "Bug bash thread",
    selectedConversationStatusLabel: "active",
    selectedConversationStatusTone: "info",
    latestMessagePreview: "Checking the worker now.",
  }), {
    title: "Bug bash thread",
    eyebrow: "Conversation",
    statusLabel: "active",
    statusTone: "info",
    helper: "Latest: Checking the worker now.",
    composerLabel: "Message Pinchy",
  });

  assert.deepEqual(buildAgentChatChromeState({}), {
    title: "New Session",
    eyebrow: "Pinchy",
    statusLabel: "idle",
    statusTone: "idle",
    helper: "Send a message to start the conversation.",
    composerLabel: "Message Pinchy",
  });
});

test("buildSettingsConfigurationState provides effective runtime guidance, source labels, and useful provider options", () => {
  const state = buildSettingsConfigurationState({
    defaultProvider: "openai-codex",
    defaultModel: "gpt-5.4",
    defaultThinkingLevel: "medium",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    workspaceDefaults: {},
    sources: {
      defaultProvider: "pi-agent",
      defaultModel: "pi-agent",
      defaultThinkingLevel: "pi-agent",
      defaultBaseUrl: "workspace",
    },
  });

  assert.equal(state.title, "Agent settings");
  assert.equal(state.subtitle, "OpenClaw-style runtime defaults for how Pinchy launches Pi-backed work in this workspace");
  assert.ok(state.providerOptions.some((option) => option.id === "openai-codex" && option.label === "OpenAI Codex"));
  assert.ok(state.providerOptions.some((option) => option.id === "ollama" && option.supportsBaseUrl === true));
  assert.deepEqual(state.summaryRows, [
    { label: "provider", value: "openai-codex", sourceLabel: "Pi agent default" },
    { label: "model", value: "gpt-5.4", sourceLabel: "Pi agent default" },
    { label: "thinking", value: "medium", sourceLabel: "Pi agent default" },
    { label: "endpoint", value: "http://127.0.0.1:11434/v1", sourceLabel: "Workspace override" },
  ]);
  assert.equal(state.workspaceOverrideSummary, "No workspace override is saved yet. Pinchy is inheriting the backend runtime defaults above.");
  assert.deepEqual(state.guidance, [
    "These values are stored in .pinchy-runtime.json for the active workspace when you save an override.",
    "Choose the Pi provider from the dropdown, then set the model and any required credentials or endpoint overrides.",
    "Use OpenAI with a custom base URL or Ollama for local OpenAI-compatible and local-model setups.",
    "Raise thinking level for harder code tasks; lower it for fast iteration.",
  ]);
});

test("mergeSettingsDraftWithFetchedSettings preserves unsaved settings edits during background refreshes", () => {
  const currentDraft = {
    defaultProvider: "ollama",
    defaultModel: "my-local-model",
    defaultThinkingLevel: "medium" as const,
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
  };

  const previousFetchedSettings = {
    defaultProvider: "ollama",
    defaultModel: "qwen3-coder",
    defaultThinkingLevel: "medium" as const,
    defaultBaseUrl: "",
  };

  const incomingSettings = {
    defaultProvider: "ollama",
    defaultModel: "qwen3-coder",
    defaultThinkingLevel: "medium" as const,
    defaultBaseUrl: "",
  };

  assert.deepEqual(mergeSettingsDraftWithFetchedSettings({
    currentDraft,
    previousFetchedSettings,
    incomingSettings,
    preserveUnsavedChanges: true,
  }), currentDraft);

  assert.deepEqual(mergeSettingsDraftWithFetchedSettings({
    currentDraft,
    previousFetchedSettings,
    incomingSettings,
    preserveUnsavedChanges: false,
  }), {
    defaultProvider: "ollama",
    defaultModel: "qwen3-coder",
    defaultThinkingLevel: "medium",
    defaultBaseUrl: "",
  });
});

test("mergeSettingsDraftWithFetchedSettings updates the draft when no unsaved settings edits exist", () => {
  assert.deepEqual(mergeSettingsDraftWithFetchedSettings({
    currentDraft: {
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder",
      defaultThinkingLevel: "medium",
      defaultBaseUrl: "",
    },
    previousFetchedSettings: {
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder",
      defaultThinkingLevel: "medium",
      defaultBaseUrl: "",
    },
    incomingSettings: {
      defaultProvider: "openai-compatible",
      defaultModel: "gpt-4.1",
      defaultThinkingLevel: "high",
      defaultBaseUrl: "http://127.0.0.1:1234/v1",
    },
    preserveUnsavedChanges: true,
  }), {
    defaultProvider: "openai-compatible",
    defaultModel: "gpt-4.1",
    defaultThinkingLevel: "high",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
  });
});

test("buildConversationTranscriptState shows a typing indicator while Pinchy has a running conversation run", () => {
  assert.deepEqual(buildConversationTranscriptState({
    messages: [
      { id: "message-1", conversationId: "conversation-1", role: "user", content: "Investigate the worker.", createdAt: "2026-04-20T00:00:00.000Z" },
    ],
    runs: [
      { id: "run-1", conversationId: "conversation-1", goal: "Investigate the worker.", kind: "user_prompt", status: "running", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:01.000Z" },
    ],
    hasUnreadLatestMessages: false,
  }), {
    showTypingIndicator: true,
    typingLabel: "Pinchy is typing",
    showNewMessagesNotice: false,
    newMessagesLabel: "New messages ↓",
  });
});

test("buildConversationTranscriptState shows a new-message notice only when unseen messages have arrived", () => {
  assert.deepEqual(buildConversationTranscriptState({
    messages: [
      { id: "message-1", conversationId: "conversation-1", role: "agent", content: "First update.", createdAt: "2026-04-20T00:00:00.000Z" },
    ],
    runs: [],
    hasUnreadLatestMessages: true,
  }), {
    showTypingIndicator: false,
    typingLabel: "Pinchy is typing",
    showNewMessagesNotice: true,
    newMessagesLabel: "New messages ↓",
  });
});

test("buildConversationDetailsProgressState surfaces the active run and latest agent progress", () => {
  assert.deepEqual(buildConversationDetailsProgressState({
    runs: [
      { id: "run-1", conversationId: "conversation-1", goal: "First goal", kind: "user_prompt", status: "completed", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:05.000Z" },
      { id: "run-2", conversationId: "conversation-1", goal: "Investigate the worker", kind: "user_prompt", status: "running", createdAt: "2026-04-20T00:01:00.000Z", updatedAt: "2026-04-20T00:01:05.000Z", summary: "Worker inspection in progress" },
    ],
    messages: [
      { id: "message-1", conversationId: "conversation-1", role: "agent", content: "I am inspecting the worker logs now.", createdAt: "2026-04-20T00:01:03.000Z", runId: "run-2" },
    ],
    questions: [],
  }), {
    activeRun: {
      id: "run-2",
      goal: "Investigate the worker",
      status: "running",
      summary: "Worker inspection in progress",
    },
    latestAgentUpdate: "I am inspecting the worker logs now.",
    pendingQuestionCount: 0,
  });
});

test("buildConversationAgentListState surfaces ephemeral conversation agents and their execution-aware latest updates", () => {
  assert.deepEqual(buildConversationAgentListState({
    conversationId: "conversation-1",
    tasks: [
      {
        id: "task-1",
        title: "Inspect polling regression",
        prompt: "Inspect polling regression",
        status: "running",
        conversationId: "conversation-1",
        runId: "run-1",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:04.000Z",
        execution: { queueState: "linked_run", linkedRunStatus: "running", workerStatus: "running", workerPid: 4242, piSessionPath: "/tmp/pi-session-1.json" },
      },
      {
        id: "task-2",
        title: "Verify live browser state",
        prompt: "Verify live browser state",
        status: "pending",
        conversationId: "conversation-1",
        runId: "run-parent",
        createdAt: "2026-04-20T00:00:01.000Z",
        updatedAt: "2026-04-20T00:00:03.000Z",
        dependsOnTaskIds: ["task-1"],
        execution: { queueState: "waiting_for_dependencies", blockedByTaskTitles: ["Inspect polling regression"], workerStatus: "running", workerPid: 4242 },
      },
      { id: "task-3", title: "Ignore other conversation task", prompt: "Ignore", status: "running", conversationId: "conversation-2", createdAt: "2026-04-20T00:00:02.000Z", updatedAt: "2026-04-20T00:00:05.000Z" },
    ] satisfies PinchyTask[],
    messages: [
      { id: "message-1", conversationId: "conversation-1", role: "agent", content: "Comparing route refresh behavior now.", createdAt: "2026-04-20T00:00:04.500Z", runId: "run-1" },
      { id: "message-2", conversationId: "conversation-1", role: "agent", content: "Parent thread summary", createdAt: "2026-04-20T00:00:05.000Z" },
      { id: "message-3", conversationId: "conversation-1", role: "agent", content: "Parent orchestrator is planning the delegation.", createdAt: "2026-04-20T00:00:05.500Z", runId: "run-parent" },
    ],
  }), {
    agents: [
      {
        id: "task-1",
        title: "Inspect polling regression",
        status: "running",
        runId: "run-1",
        latestUpdate: "Comparing route refresh behavior now.",
        dependencyCount: 0,
        isActive: true,
        execution: { queueState: "linked_run", linkedRunStatus: "running", workerStatus: "running", workerPid: 4242, piSessionPath: "/tmp/pi-session-1.json" },
      },
      {
        id: "task-2",
        title: "Verify live browser state",
        status: "pending",
        runId: undefined,
        latestUpdate: undefined,
        dependencyCount: 1,
        isActive: true,
        execution: { queueState: "waiting_for_dependencies", blockedByTaskTitles: ["Inspect polling regression"], workerStatus: "running", workerPid: 4242 },
      },
    ],
  });
});

test("buildAgentSessionState turns the center pane into a selected ephemeral agent thread", () => {
  assert.deepEqual(buildAgentSessionState({
    conversationId: "conversation-1",
    selectedTaskId: "task-1",
    tasks: [
      {
        id: "task-1",
        title: "Inspect polling regression",
        prompt: "Inspect polling regression",
        status: "running",
        conversationId: "conversation-1",
        runId: "run-1",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:04.000Z",
        execution: { queueState: "linked_run", linkedRunStatus: "running" },
      },
    ] satisfies PinchyTask[],
    messages: [
      { id: "message-1", conversationId: "conversation-1", role: "agent", content: "Comparing route refresh behavior now.", createdAt: "2026-04-20T00:00:04.500Z", runId: "run-1" },
      { id: "message-2", conversationId: "conversation-1", role: "user", content: "Focus on the current route only.", createdAt: "2026-04-20T00:00:04.700Z", runId: "run-1" },
      { id: "message-3", conversationId: "conversation-1", role: "agent", content: "Parent thread orchestration summary.", createdAt: "2026-04-20T00:00:05.000Z" },
    ],
  }), {
    mode: "agent",
    backLabel: "Back to Pinchy conversation",
    agent: {
      id: "task-1",
      title: "Inspect polling regression",
      prompt: "Inspect polling regression",
      status: "running",
      runId: "run-1",
      latestUpdate: "Comparing route refresh behavior now.",
      transcript: [
        { id: "message-1", conversationId: "conversation-1", role: "agent", content: "Comparing route refresh behavior now.", createdAt: "2026-04-20T00:00:04.500Z", runId: "run-1" },
        { id: "message-2", conversationId: "conversation-1", role: "user", content: "Focus on the current route only.", createdAt: "2026-04-20T00:00:04.700Z", runId: "run-1" },
      ],
    },
  });

  assert.deepEqual(buildAgentSessionState({
    conversationId: "conversation-1",
    selectedTaskId: "task-child",
    tasks: [
      {
        id: "task-child",
        title: "Inspect child run",
        prompt: "Inspect child run",
        status: "running",
        conversationId: "conversation-1",
        runId: "run-parent",
        executionRunId: "run-child",
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:04.000Z",
        execution: { queueState: "linked_run", linkedRunStatus: "running" },
      },
    ] satisfies PinchyTask[],
    messages: [
      { id: "message-parent", conversationId: "conversation-1", role: "agent", kind: "orchestration_update", content: "Delegated work summary.", createdAt: "2026-04-20T00:00:04.400Z", runId: "run-parent" },
      { id: "message-child-1", conversationId: "conversation-1", role: "agent", content: "Inspecting the child run now.", createdAt: "2026-04-20T00:00:04.500Z", runId: "run-child" },
      { id: "message-child-2", conversationId: "conversation-1", role: "agent", kind: "orchestration_update", content: "Internal orchestration echo.", createdAt: "2026-04-20T00:00:04.600Z", runId: "run-child" },
      { id: "message-child-3", conversationId: "conversation-1", role: "user", content: "Stay scoped.", createdAt: "2026-04-20T00:00:04.700Z", runId: "run-child" },
    ],
  }), {
    mode: "agent",
    backLabel: "Back to Pinchy conversation",
    agent: {
      id: "task-child",
      title: "Inspect child run",
      prompt: "Inspect child run",
      status: "running",
      runId: "run-child",
      latestUpdate: "Inspecting the child run now.",
      transcript: [
        { id: "message-child-1", conversationId: "conversation-1", role: "agent", content: "Inspecting the child run now.", createdAt: "2026-04-20T00:00:04.500Z", runId: "run-child" },
        { id: "message-child-3", conversationId: "conversation-1", role: "user", content: "Stay scoped.", createdAt: "2026-04-20T00:00:04.700Z", runId: "run-child" },
      ],
    },
  });

  assert.deepEqual(buildAgentSessionState({
    conversationId: "conversation-1",
    selectedTaskId: "missing",
    tasks: [],
    messages: [],
  }), {
    mode: "conversation",
    backLabel: "Back to Pinchy conversation",
    agent: undefined,
  });
});

test("decideTranscriptFollowUp keeps auto-scrolling while the viewer is already at the bottom", () => {
  assert.deepEqual(decideTranscriptFollowUp({
    changedConversation: false,
    messageCountChanged: false,
    latestMessageChanged: true,
    isNearBottom: true,
  }), {
    shouldScrollToBottom: true,
    shouldMarkUnread: false,
  });

  assert.deepEqual(decideTranscriptFollowUp({
    changedConversation: false,
    messageCountChanged: true,
    latestMessageChanged: true,
    isNearBottom: true,
  }), {
    shouldScrollToBottom: true,
    shouldMarkUnread: false,
  });
});

test("decideTranscriptFollowUp ignores unchanged transcript polls", () => {
  assert.deepEqual(decideTranscriptFollowUp({
    changedConversation: false,
    messageCountChanged: false,
    latestMessageChanged: false,
    isNearBottom: true,
  }), {
    shouldScrollToBottom: false,
    shouldMarkUnread: false,
  });
});

test("decideTranscriptFollowUp scrolls to the bottom when the first transcript batch arrives for an open conversation", () => {
  assert.deepEqual(decideTranscriptFollowUp({
    changedConversation: false,
    messageCountChanged: true,
    latestMessageChanged: true,
    isNearBottom: false,
    hadMessagesBefore: false,
  }), {
    shouldScrollToBottom: true,
    shouldMarkUnread: false,
  });
});

test("decideTranscriptFollowUp shows an unread indicator when updates arrive while scrolled away from the bottom", () => {
  assert.deepEqual(decideTranscriptFollowUp({
    changedConversation: false,
    messageCountChanged: false,
    latestMessageChanged: true,
    isNearBottom: false,
  }), {
    shouldScrollToBottom: false,
    shouldMarkUnread: true,
  });
});

test("buildConversationListEntryPresentation keeps thread rows compact while preserving key status cues", () => {
  assert.deepEqual(buildConversationListEntryPresentation({
    title: "Bug bash thread",
    status: "running",
    updatedAtLabel: "4/20/2026, 9:41:00 AM",
    hasLatestRun: true,
    isSelected: true,
  }), {
    title: "Bug bash thread",
    metaLabel: "updated 4/20/2026, 9:41:00 AM",
    badges: [
      { label: "running", tone: "status" },
      { label: "latest run", tone: "accent" },
    ],
    containerTone: "selected",
    deleteLabel: "Delete",
  });

  assert.deepEqual(buildConversationListEntryPresentation({
    title: "Old thread",
    status: "idle",
    updatedAtLabel: "4/19/2026, 2:11:00 PM",
    hasLatestRun: false,
    isSelected: false,
  }), {
    title: "Old thread",
    metaLabel: "updated 4/19/2026, 2:11:00 PM",
    badges: [
      { label: "idle", tone: "status" },
    ],
    containerTone: "default",
    deleteLabel: "Delete",
  });
});

test("buildTranscriptMessagePresentation emphasizes agent, orchestration, and user messages differently", () => {
  assert.deepEqual(buildTranscriptMessagePresentation({
    id: "message-1",
    conversationId: "conversation-1",
    role: "agent",
    content: "I found the root cause and applied a narrow fix.",
    createdAt: "2026-04-20T00:00:00.000Z",
  }), {
    roleLabel: "Pinchy",
    align: "start",
    accentColor: "#e5e7eb",
    background: "transparent",
    borderColor: "transparent",
    surfaceTone: "agent-inline",
    bubbleWidth: "min(760px, 88%)",
    bubblePadding: 0,
    metaGap: 6,
    shadow: "none",
  });

  assert.deepEqual(buildTranscriptMessagePresentation({
    id: "message-1b",
    conversationId: "conversation-1",
    role: "agent",
    kind: "orchestration_update",
    content: "Orchestration summary: 2 tasks are running.",
    createdAt: "2026-04-20T00:00:00.500Z",
  }), {
    roleLabel: "Pinchy plan",
    align: "start",
    accentColor: "#c084fc",
    background: "linear-gradient(180deg, #1a1333 0%, #111827 100%)",
    borderColor: "#7c3aed",
    surfaceTone: "orchestration",
    bubbleWidth: "min(760px, 92%)",
    bubblePadding: 12,
    metaGap: 8,
    shadow: "0 12px 26px rgba(88, 28, 135, 0.24)",
  });

  assert.deepEqual(buildTranscriptMessagePresentation({
    id: "message-1c",
    conversationId: "conversation-1",
    role: "agent",
    kind: "orchestration_final",
    content: "Final synthesis summary: all delegated tasks are done.",
    createdAt: "2026-04-20T00:00:00.750Z",
  }), {
    roleLabel: "Pinchy synthesis",
    align: "start",
    accentColor: "#f59e0b",
    background: "linear-gradient(180deg, #2a1703 0%, #111827 100%)",
    borderColor: "#d97706",
    surfaceTone: "orchestration-final",
    bubbleWidth: "min(760px, 92%)",
    bubblePadding: 12,
    metaGap: 8,
    shadow: "0 12px 26px rgba(180, 83, 9, 0.22)",
  });

  assert.deepEqual(buildTranscriptMessagePresentation({
    id: "message-2",
    conversationId: "conversation-1",
    role: "user",
    content: "Please keep going.",
    createdAt: "2026-04-20T00:00:01.000Z",
  }), {
    roleLabel: "You",
    align: "end",
    accentColor: "#ffffff",
    background: "#2563eb",
    borderColor: "#2563eb",
    surfaceTone: "user-pill",
    bubbleWidth: "min(720px, 80%)",
    bubblePadding: 14,
    metaGap: 6,
    shadow: "0 10px 22px rgba(37, 99, 235, 0.22)",
  });

  assert.deepEqual(buildTranscriptMessagePresentation({
    id: "message-3",
    conversationId: "conversation-1",
    role: "system",
    content: "Runtime notice",
    createdAt: "2026-04-20T00:00:02.000Z",
  }), {
    roleLabel: "System",
    align: "center",
    accentColor: "#94a3b8",
    background: "#0f172a",
    borderColor: "#334155",
    surfaceTone: "system",
    bubbleWidth: "min(640px, 100%)",
    bubblePadding: 10,
    metaGap: 6,
    shadow: "0 6px 14px rgba(15, 23, 42, 0.14)",
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
