import type { DashboardArtifact, DashboardState, Message, Question, Run, SavedMemory } from "../../../packages/shared/src/contracts.js";

type ConversationWorkspaceSummary = ReturnType<typeof summarizeConversationWorkspace>;

export type DashboardPage = "overview" | "conversations" | "memory" | "operations" | "tools";

export const DASHBOARD_PAGES: DashboardPage[] = ["overview", "conversations", "memory", "operations", "tools"];

export function resolveDashboardLandingPage(lastVisitedPage?: DashboardPage) {
  return lastVisitedPage ?? "conversations";
}

export function workspaceConversationSelectionStorageKey(workspaceId: string) {
  return `pinchy.dashboard.workspace.${workspaceId}.selectedConversationId`;
}

export function resolveWorkspaceConversationSelection(
  conversations: Array<{ id: string }>,
  currentConversationId?: string,
  storedConversationId?: string,
) {
  if (currentConversationId && conversations.some((conversation) => conversation.id === currentConversationId)) {
    return currentConversationId;
  }

  if (storedConversationId && conversations.some((conversation) => conversation.id === storedConversationId)) {
    return storedConversationId;
  }

  return conversations[0]?.id;
}

export function buildConversationOnboardingPresets(activeWorkspaceName?: string) {
  const workspaceLabel = activeWorkspaceName ?? "this workspace";
  return [
    {
      title: "Debug current issue",
      prompt: `Inspect the current issue in ${workspaceLabel}, gather evidence first, identify the likely root cause, and propose or apply the smallest safe fix.`,
    },
    {
      title: "Continue the next roadmap slice",
      prompt: `Continue the next bounded roadmap slice in ${workspaceLabel} with TDD where practical, keep changes small, and validate the result before marking progress.`,
    },
    {
      title: "Understand this codebase",
      prompt: `Survey ${workspaceLabel}, summarize the current architecture, key entrypoints, and the safest high-value next improvements.`,
    },
  ];
}

export function filterDashboardArtifacts(artifacts: DashboardArtifact[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return artifacts;
  return artifacts.filter((artifact) => [artifact.name, artifact.toolName, artifact.note, ...(artifact.tags ?? [])].filter(Boolean).join(" ").toLowerCase().includes(normalized));
}

export function filterSavedMemories(memories: SavedMemory[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return memories;
  return memories.filter((memory) => [memory.title, memory.content, ...memory.tags].join(" ").toLowerCase().includes(normalized));
}

export function buildMemoryDraftFromMessage(message: Message) {
  return {
    title: `${message.role} message`,
    content: message.content,
    kind: "note" as const,
    tags: ["conversation", message.role],
    sourceConversationId: message.conversationId,
    sourceRunId: message.runId,
  };
}

export function buildMemoryDraftFromQuestion(question: Question) {
  return {
    title: "Blocked question",
    content: question.prompt,
    kind: "decision" as const,
    tags: ["question", question.priority],
    sourceConversationId: question.conversationId,
    sourceRunId: question.runId,
  };
}

export function buildRunHeadline(input: { goal: string; summary?: string }, maxLength = 96) {
  const source = (input.summary?.trim() || input.goal.trim() || "Run").replace(/\s+/g, " ");
  if (source.length <= maxLength) return source;
  const shortened = source.slice(0, Math.max(0, maxLength - 1)).trimEnd();
  const lastWordBoundary = shortened.lastIndexOf(" ");
  const safe = lastWordBoundary >= Math.floor(maxLength * 0.6) ? shortened.slice(0, lastWordBoundary) : shortened;
  return `${safe.trimEnd()}…`;
}

export function summarizeConversationWorkspacePresence(input: {
  activeWorkspaceName?: string;
  activeWorkspacePath?: string;
  conversationCount: number;
  selectedConversationTitle?: string;
}) {
  const workspaceLabel = input.activeWorkspaceName && input.activeWorkspacePath
    ? `${input.activeWorkspaceName} (${input.activeWorkspacePath})`
    : input.activeWorkspacePath ?? input.activeWorkspaceName ?? "No workspace selected";
  const inventoryLabel = input.conversationCount === 0
    ? "No saved conversations in this workspace yet."
    : `${input.conversationCount} conversation${input.conversationCount === 1 ? "" : "s"} available in this workspace.`;
  const selectionLabel = input.selectedConversationTitle
    ? `Current thread: ${input.selectedConversationTitle}`
    : input.conversationCount === 0
      ? "Start the first thread for this repo from here."
      : "Pick a thread or start a new one in this workspace.";

  return {
    workspaceLabel,
    inventoryLabel,
    selectionLabel,
  };
}

export function buildConversationComposerState(input: {
  activeWorkspaceName?: string;
  conversationCount: number;
  selectedConversationTitle?: string;
  selectedConversationStatus?: string;
  selectedConversationSummary?: ConversationWorkspaceSummary;
}) {
  if (input.selectedConversationTitle && input.selectedConversationSummary) {
    return {
      title: input.selectedConversationTitle,
      subtitle: `${input.selectedConversationSummary.messageCount} messages • ${input.selectedConversationSummary.runCount} runs • ${input.selectedConversationSummary.pendingQuestionCount} pending questions`,
      placeholder: input.selectedConversationSummary.composerPlaceholder,
      primaryActionLabel: "Send message to agent",
      statusLabel: input.selectedConversationStatus ?? input.selectedConversationSummary.statusLabel,
      latestMessagePreview: input.selectedConversationSummary.latestMessagePreview,
    };
  }

  const workspaceSuffix = input.activeWorkspaceName ? ` in ${input.activeWorkspaceName}` : "";
  return {
    title: input.conversationCount === 0 ? "Start the first conversation" : "Start a new conversation",
    subtitle: input.conversationCount === 0
      ? "This workspace has no saved conversations yet. Send a prompt to create the first local Pinchy thread here."
      : "No thread is selected right now. Send a prompt to create a fresh conversation in this workspace.",
    placeholder: `Describe the first task for Pinchy${workspaceSuffix}`,
    primaryActionLabel: input.conversationCount === 0 ? "Start first thread" : "Start new thread",
  };
}

export function buildGlobalPromptState(input: { selectedConversationTitle?: string; selectedConversationStatus?: string }) {
  if (input.selectedConversationTitle) {
    return {
      targetLabel: `Talking to: ${input.selectedConversationTitle}`,
      targetStatus: input.selectedConversationStatus ?? "Conversation selected",
      helperText: "Messages will be appended to the selected conversation and queued for the agent.",
      primaryActionLabel: "Send to selected conversation",
      secondaryActionLabel: "Start new thread",
    };
  }

  return {
    targetLabel: "No conversation selected",
    targetStatus: "New conversation",
    helperText: "Send a prompt now to create a fresh conversation and start a new run.",
    primaryActionLabel: "New convo + run",
    secondaryActionLabel: "Select a conversation to keep talking in one thread",
  };
}

export function summarizeConversationWorkspace(input: { messages: Message[]; runs: Run[]; questions: Question[] }) {
  const pendingQuestionCount = input.questions.filter((question) => question.status === "pending_delivery" || question.status === "waiting_for_human").length;
  const activeRun = input.runs.find((run) => run.status === "queued" || run.status === "running" || run.status === "waiting_for_human" || run.status === "waiting_for_approval");
  const latestMessagePreview = input.messages.at(-1)?.content;

  if (activeRun?.status === "waiting_for_human") {
    return {
      messageCount: input.messages.length,
      runCount: input.runs.length,
      pendingQuestionCount,
      statusTone: "warning" as const,
      statusLabel: "Agent needs your reply",
      latestMessagePreview,
      composerPlaceholder: "Reply so the agent can continue this run",
      hasActiveRun: true,
    };
  }

  if (activeRun?.status === "waiting_for_approval") {
    return {
      messageCount: input.messages.length,
      runCount: input.runs.length,
      pendingQuestionCount,
      statusTone: "warning" as const,
      statusLabel: "Agent is waiting for approval",
      latestMessagePreview,
      composerPlaceholder: "Add context while the current run waits for approval",
      hasActiveRun: true,
    };
  }

  if (activeRun?.status === "queued" || activeRun?.status === "running") {
    return {
      messageCount: input.messages.length,
      runCount: input.runs.length,
      pendingQuestionCount,
      statusTone: "info" as const,
      statusLabel: "Agent is working",
      latestMessagePreview,
      composerPlaceholder: "Send the next instruction to the running agent",
      hasActiveRun: true,
    };
  }

  return {
    messageCount: input.messages.length,
    runCount: input.runs.length,
    pendingQuestionCount,
    statusTone: "idle" as const,
    statusLabel: input.messages.length > 0 ? "Conversation ready" : "Start a conversation",
    latestMessagePreview,
    composerPlaceholder: input.messages.length > 0 ? "Send the next message to Pinchy" : "Describe the first task for Pinchy",
    hasActiveRun: false,
  };
}

export function summarizeDashboardState(input: Pick<DashboardState, "tasks" | "approvals" | "runHistory" | "pendingReloadRequests" | "memories">) {
  return {
    pendingTasks: input.tasks.filter((entry) => entry.status === "pending").length,
    pendingApprovals: input.approvals.filter((entry) => entry.status === "pending").length,
    recentRuns: input.runHistory.length,
    pendingReloads: input.pendingReloadRequests.filter((entry) => entry.status === "pending").length,
    savedMemories: input.memories.length,
    pinnedMemories: input.memories.filter((entry) => entry.pinned).length,
  };
}
