import type { DashboardArtifact, DashboardState, Message, PinchyTask, Question, Run, SavedMemory } from "../../../packages/shared/src/contracts.js";
import type { DashboardSettings } from "./control-plane-client.js";

export function buildAgentChatChromeState(input: {
  selectedConversationTitle?: string;
  selectedConversationStatusLabel?: string;
  selectedConversationStatusTone?: "info" | "warning" | "idle";
  latestMessagePreview?: string;
}) {
  const hasSelectedConversation = Boolean(input.selectedConversationTitle);
  return {
    title: input.selectedConversationTitle ?? "New Session",
    eyebrow: hasSelectedConversation ? "Conversation" : "Pinchy",
    statusLabel: input.selectedConversationStatusLabel ?? "idle",
    statusTone: input.selectedConversationStatusTone ?? "idle",
    helper: input.latestMessagePreview
      ? `Latest: ${input.latestMessagePreview}`
      : "Send a message to start the conversation.",
    composerLabel: "Message Pinchy",
  };
}

export function buildTranscriptMessagePresentation<T extends Pick<Message, "role" | "kind">>(message: T) {
  if (message.kind === "orchestration_update") {
    return {
      roleLabel: "Pinchy plan",
      align: "start" as const,
      accentColor: "#c084fc",
      background: "linear-gradient(180deg, #1a1333 0%, #111827 100%)",
      borderColor: "#7c3aed",
      surfaceTone: "orchestration" as const,
      bubbleWidth: "min(760px, 92%)",
      bubblePadding: 12,
      metaGap: 8,
      shadow: "0 12px 26px rgba(88, 28, 135, 0.24)",
    };
  }

  if (message.kind === "orchestration_final") {
    return {
      roleLabel: "Pinchy synthesis",
      align: "start" as const,
      accentColor: "#f59e0b",
      background: "linear-gradient(180deg, #2a1703 0%, #111827 100%)",
      borderColor: "#d97706",
      surfaceTone: "orchestration-final" as const,
      bubbleWidth: "min(760px, 92%)",
      bubblePadding: 12,
      metaGap: 8,
      shadow: "0 12px 26px rgba(180, 83, 9, 0.22)",
    };
  }

  if (message.role === "agent") {
    return {
      roleLabel: "Pinchy",
      align: "start" as const,
      accentColor: "#e5e7eb",
      background: "transparent",
      borderColor: "transparent",
      surfaceTone: "agent-inline" as const,
      bubbleWidth: "min(760px, 88%)",
      bubblePadding: 0,
      metaGap: 6,
      shadow: "none",
    };
  }

  if (message.role === "user") {
    return {
      roleLabel: "You",
      align: "end" as const,
      accentColor: "#ffffff",
      background: "#2563eb",
      borderColor: "#2563eb",
      surfaceTone: "user-pill" as const,
      bubbleWidth: "min(720px, 80%)",
      bubblePadding: 14,
      metaGap: 6,
      shadow: "0 10px 22px rgba(37, 99, 235, 0.22)",
    };
  }

  return {
    roleLabel: "System",
    align: "center" as const,
    accentColor: "#94a3b8",
    background: "#0f172a",
    borderColor: "#334155",
    surfaceTone: "system" as const,
    bubbleWidth: "min(640px, 100%)",
    bubblePadding: 10,
    metaGap: 6,
    shadow: "0 6px 14px rgba(15, 23, 42, 0.14)",
  };
}

export function buildConversationTranscriptState<TMessage extends Pick<Message, "id">, TRun extends Pick<Run, "status">>(input: {
  messages: TMessage[];
  runs: TRun[];
  hasUnreadLatestMessages: boolean;
}) {
  return {
    showTypingIndicator: input.runs.some((run) => run.status === "running"),
    typingLabel: "Pinchy is typing",
    showNewMessagesNotice: input.hasUnreadLatestMessages && input.messages.length > 0,
    newMessagesLabel: "New messages ↓",
  };
}

export function buildConversationDetailsProgressState<TRun extends Pick<Run, "id" | "goal" | "status" | "summary" | "updatedAt" | "createdAt">, TMessage extends Pick<Message, "role" | "content" | "createdAt">, TQuestion extends Pick<Question, "status">>(input: {
  runs: TRun[];
  messages: TMessage[];
  questions: TQuestion[];
}) {
  const activeRun = [...input.runs]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .find((run) => run.status === "running" || run.status === "queued" || run.status === "waiting_for_human" || run.status === "waiting_for_approval");
  const latestAgentUpdate = [...input.messages]
    .reverse()
    .find((message) => message.role === "agent")?.content;

  return {
    activeRun: activeRun ? {
      id: activeRun.id,
      goal: activeRun.goal,
      status: activeRun.status,
      summary: activeRun.summary,
    } : undefined,
    latestAgentUpdate,
    pendingQuestionCount: input.questions.filter((question) => question.status === "pending_delivery" || question.status === "waiting_for_human").length,
  };
}

export function buildConversationAgentListState<
  TTask extends Pick<PinchyTask, "id" | "title" | "status" | "conversationId" | "runId" | "dependsOnTaskIds" | "updatedAt">,
  TMessage extends Pick<Message, "role" | "content" | "runId" | "createdAt">
>(input: {
  conversationId: string;
  tasks: TTask[];
  messages: TMessage[];
}) {
  const agents = input.tasks
    .filter((task) => task.conversationId === input.conversationId)
    .sort((left, right) => {
      const leftActive = left.status === "running" || left.status === "pending" || left.status === "blocked";
      const rightActive = right.status === "running" || right.status === "pending" || right.status === "blocked";
      if (leftActive !== rightActive) {
        return leftActive ? -1 : 1;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      runId: task.runId,
      latestUpdate: task.runId
        ? [...input.messages].reverse().find((message) => message.role === "agent" && message.runId === task.runId)?.content
        : undefined,
      dependencyCount: task.dependsOnTaskIds?.length ?? 0,
      isActive: task.status === "running" || task.status === "pending" || task.status === "blocked",
    }));

  return { agents };
}

export function buildAgentSessionState<
  TTask extends Pick<PinchyTask, "id" | "title" | "prompt" | "status" | "conversationId" | "runId">,
  TMessage extends Pick<Message, "id" | "conversationId" | "role" | "content" | "createdAt" | "runId">
>(input: {
  conversationId: string;
  selectedTaskId?: string;
  tasks: TTask[];
  messages: TMessage[];
}) {
  const task = input.tasks.find((entry) => entry.id === input.selectedTaskId && entry.conversationId === input.conversationId);
  if (!task) {
    return {
      mode: "conversation" as const,
      backLabel: "Back to Pinchy conversation",
      agent: undefined,
    };
  }

  const transcript = task.runId
    ? input.messages.filter((message) => message.runId === task.runId)
    : [];
  const latestUpdate = [...transcript].reverse().find((message) => message.role === "agent")?.content;

  return {
    mode: "agent" as const,
    backLabel: "Back to Pinchy conversation",
    agent: {
      id: task.id,
      title: task.title,
      prompt: task.prompt,
      status: task.status,
      runId: task.runId,
      latestUpdate,
      transcript,
    },
  };
}

export function decideTranscriptFollowUp(input: {
  changedConversation: boolean;
  messageCountChanged: boolean;
  latestMessageChanged: boolean;
  isNearBottom: boolean;
}) {
  const hasTranscriptUpdate = input.messageCountChanged || input.latestMessageChanged;
  if (input.changedConversation || !hasTranscriptUpdate) {
    return {
      shouldScrollToBottom: false,
      shouldMarkUnread: false,
    };
  }

  if (input.isNearBottom) {
    return {
      shouldScrollToBottom: true,
      shouldMarkUnread: false,
    };
  }

  return {
    shouldScrollToBottom: false,
    shouldMarkUnread: true,
  };
}

export function buildConversationListEntryPresentation(input: {
  title: string;
  status: string;
  updatedAtLabel: string;
  hasLatestRun: boolean;
  isSelected: boolean;
}) {
  return {
    title: input.title,
    metaLabel: `updated ${input.updatedAtLabel}`,
    badges: [
      { label: input.status, tone: "status" as const },
      ...(input.hasLatestRun ? [{ label: "latest run", tone: "accent" as const }] : []),
    ],
    containerTone: input.isSelected ? "selected" as const : "default" as const,
    deleteLabel: "Delete",
  };
}

export type SettingsDraftState = {
  defaultProvider: string;
  defaultModel: string;
  defaultThinkingLevel: "off" | "low" | "medium" | "high";
  defaultBaseUrl: string;
};

export function buildSettingsDraftFromSettings(settings?: DashboardSettings): SettingsDraftState {
  return {
    defaultProvider: settings?.defaultProvider ?? "",
    defaultModel: settings?.defaultModel ?? "",
    defaultThinkingLevel: settings?.defaultThinkingLevel ?? "medium",
    defaultBaseUrl: settings?.defaultBaseUrl ?? "",
  };
}

export function mergeSettingsDraftWithFetchedSettings(input: {
  currentDraft: SettingsDraftState;
  previousFetchedSettings?: DashboardSettings;
  incomingSettings: DashboardSettings;
  preserveUnsavedChanges: boolean;
}): SettingsDraftState {
  const incomingDraft = buildSettingsDraftFromSettings(input.incomingSettings);
  if (!input.preserveUnsavedChanges) {
    return incomingDraft;
  }

  const previousDraft = buildSettingsDraftFromSettings(input.previousFetchedSettings);
  const hasUnsavedChanges = JSON.stringify(input.currentDraft) !== JSON.stringify(previousDraft);
  return hasUnsavedChanges ? input.currentDraft : incomingDraft;
}

function formatSettingsSourceLabel(source?: "env" | "workspace" | "pi-agent" | "unset") {
  if (source === "env") return "Environment override";
  if (source === "workspace") return "Workspace override";
  if (source === "pi-agent") return "Pi agent default";
  return "Not set";
}

export function buildSettingsConfigurationState(input: {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: "off" | "low" | "medium" | "high";
  defaultBaseUrl?: string;
  workspaceDefaults?: {
    defaultProvider?: string;
    defaultModel?: string;
    defaultThinkingLevel?: "off" | "low" | "medium" | "high";
    defaultBaseUrl?: string;
  };
  sources?: {
    defaultProvider?: "env" | "workspace" | "pi-agent" | "unset";
    defaultModel?: "env" | "workspace" | "pi-agent" | "unset";
    defaultThinkingLevel?: "env" | "workspace" | "pi-agent" | "unset";
    defaultBaseUrl?: "env" | "workspace" | "pi-agent" | "unset";
  };
}) {
  const workspaceOverrideSummary = input.workspaceDefaults?.defaultProvider || input.workspaceDefaults?.defaultModel || input.workspaceDefaults?.defaultThinkingLevel || input.workspaceDefaults?.defaultBaseUrl
    ? "This workspace has saved runtime overrides in .pinchy-runtime.json."
    : "No workspace override is saved yet. Pinchy is inheriting the backend runtime defaults above.";

  return {
    title: "Agent settings",
    subtitle: "OpenClaw-style runtime defaults for how Pinchy launches Pi-backed work in this workspace",
    providerPresets: [
      {
        id: "local-server",
        label: "Local server",
        provider: "openai-compatible",
        suggestedModel: "",
        helper: "Point Pinchy at a local OpenAI-compatible endpoint and auto-detect its model list.",
      },
      {
        id: "codex-cloud",
        label: "Codex cloud",
        provider: "openai-codex",
        suggestedModel: "gpt-5.4",
        helper: "Matches the current Pi agent Codex-style default on this machine.",
      },
      {
        id: "openai-compatible",
        label: "OpenAI-compatible",
        provider: "openai-compatible",
        suggestedModel: "gpt-4.1",
        helper: "Use when routing Pinchy through an OpenAI-compatible endpoint.",
      },
    ],
    summaryRows: [
      { label: "provider", value: input.defaultProvider || "—", sourceLabel: formatSettingsSourceLabel(input.sources?.defaultProvider) },
      { label: "model", value: input.defaultModel || "—", sourceLabel: formatSettingsSourceLabel(input.sources?.defaultModel) },
      { label: "thinking", value: input.defaultThinkingLevel || "medium", sourceLabel: formatSettingsSourceLabel(input.sources?.defaultThinkingLevel) },
      { label: "endpoint", value: input.defaultBaseUrl || "—", sourceLabel: formatSettingsSourceLabel(input.sources?.defaultBaseUrl) },
    ],
    workspaceOverrideSummary,
    guidance: [
      "These values are stored in .pinchy-runtime.json for the active workspace when you save an override.",
      "Use Ollama for the closest OpenClaw-style local-model setup, or keep Codex if you want the current cloud-backed Pi default.",
      "You can point Pinchy at a local OpenAI-compatible server by setting an endpoint/base URL for the active workspace.",
      "Raise thinking level for harder code tasks; lower it for fast iteration.",
    ],
  };
}

type ConversationWorkspaceSummary = ReturnType<typeof summarizeConversationWorkspace>;

export type DashboardPage = "overview" | "conversations" | "memory" | "operations" | "tools" | "settings";

export const DASHBOARD_PAGES: DashboardPage[] = ["overview", "conversations", "memory", "operations", "tools", "settings"];

export function resolveDashboardLandingPage(_lastVisitedPage?: DashboardPage): DashboardPage {
  return "conversations";
}

export function buildDashboardSidebarState(input: {
  isOpen: boolean;
  page: DashboardPage;
}) {
  return {
    isOpen: input.isOpen,
    width: input.isOpen ? 288 : 0,
    toggleLabel: input.isOpen ? "Hide menu" : "Show menu",
    title: "Pinchy",
    subtitle: "Control plane",
  };
}

export function buildDashboardUtilityRailState(input: {
  isOpen: boolean;
  page: DashboardPage;
}) {
  const isConversationPage = input.page === "conversations";
  return {
    isOpen: isConversationPage ? input.isOpen : false,
    width: isConversationPage && input.isOpen ? 320 : 0,
    toggleLabel: input.isOpen ? "Hide tools rail" : "Show tools rail",
    title: "Parallel workbench",
    subtitle: "Questions, workflows, runs, and delegation tools stay nearby without taking over the chat.",
  };
}

export function resolveConversationShellInitialState() {
  return {
    sidebarOpen: true,
    utilityRailOpen: true,
  };
}

export function resolveConversationRouteAfterRefresh(input: {
  pathname: string;
  routeConversationId?: string;
  availableConversationIds: string[];
}) {
  if (!input.routeConversationId) {
    return undefined;
  }

  if (input.availableConversationIds.includes(input.routeConversationId)) {
    return input.pathname;
  }

  const fallbackConversationId = input.availableConversationIds[0];
  return fallbackConversationId ? `/c/${fallbackConversationId}` : undefined;
}

export function buildConversationShellHeaderState(input: {
  page: DashboardPage;
  utilityRailToggleLabel: string;
}) {
  return {
    sidebarToggle: {
      icon: "menu" as const,
      align: "left" as const,
      label: "Show menu",
    },
    utilityRailToggle: input.page === "conversations"
      ? {
        icon: "utility-rail" as const,
        align: "right" as const,
        label: input.utilityRailToggleLabel,
      }
      : undefined,
  };
}

export function buildChatWorkbenchState(input: {
  pendingTasks: number;
  pendingApprovals: number;
  recentRuns: number;
  hasActiveConversationRun: boolean;
}) {
  return {
    title: "Parallel workbench",
    subtitle: "Chat with Pinchy while tasks, approvals, and background runs continue alongside this thread.",
    badges: [
      { label: `${input.pendingTasks} queued task${input.pendingTasks === 1 ? "" : "s"}`, tone: "info" as const },
      { label: `${input.pendingApprovals} approval${input.pendingApprovals === 1 ? " waiting" : "s waiting"}`, tone: input.pendingApprovals > 0 ? "warning" as const : "idle" as const },
      { label: `${input.recentRuns} recent run${input.recentRuns === 1 ? "" : "s"}`, tone: "idle" as const },
      { label: input.hasActiveConversationRun ? "thread active" : "thread idle", tone: input.hasActiveConversationRun ? "info" as const : "idle" as const },
    ],
    helper: "Queue focused background work here without leaving the main conversation.",
  };
}

export function parseDelegationPlanDraft(draft: string) {
  return draft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("::");
      if (separatorIndex < 0) return undefined;
      const title = line.slice(0, separatorIndex).trim();
      const prompt = line.slice(separatorIndex + 2).trim();
      if (!title || !prompt) return undefined;
      return { title, prompt };
    })
    .filter((entry): entry is { title: string; prompt: string } => Boolean(entry));
}

export function buildChatWorkspacePanelState(input: {
  hasSelectedConversation: boolean;
  linkedTaskCounts: {
    pending: number;
    running: number;
    blocked: number;
    done: number;
  };
  queuedTaskCount: number;
  delegationTaskCount: number;
}) {
  const activeWorkflowCount = input.linkedTaskCounts.pending + input.linkedTaskCounts.running + input.linkedTaskCounts.blocked;
  const completedWorkflowCount = input.linkedTaskCounts.done;
  const queuedTaskLabel = `${input.queuedTaskCount} queued task draft${input.queuedTaskCount === 1 ? "" : "s"}`;
  const delegationTaskLabel = `${input.delegationTaskCount} delegation task${input.delegationTaskCount === 1 ? "" : "s"} ready`;

  return {
    tools: {
      title: "Tools & delegation",
      summary: input.hasSelectedConversation
        ? `${queuedTaskLabel} • ${delegationTaskLabel}`
        : "Select a conversation to unlock bounded task tools for this thread.",
      defaultExpanded: false,
      toggleLabel: "Show tools",
    },
    workflows: {
      title: "Linked workflows",
      summary: activeWorkflowCount > 0
        ? `${activeWorkflowCount} active workflow${activeWorkflowCount === 1 ? "" : "s"} • ${completedWorkflowCount} completed for this thread.`
        : "No linked workflows for this conversation yet.",
      defaultExpanded: activeWorkflowCount > 0,
      toggleLabel: "Show workflows",
      activeCount: activeWorkflowCount,
    },
  };
}

export function buildConversationOrchestrationState(input: {
  conversationId?: string;
  tasks: PinchyTask[];
}) {
  const linkedTasks = input.conversationId
    ? input.tasks.filter((task) => task.conversationId === input.conversationId)
      .sort((left, right) => {
        const leftActive = left.status === "running" ? 0 : left.status === "pending" ? 1 : left.status === "blocked" ? 2 : 3;
        const rightActive = right.status === "running" ? 0 : right.status === "pending" ? 1 : right.status === "blocked" ? 2 : 3;
        if (leftActive !== rightActive) return leftActive - rightActive;
        return right.updatedAt.localeCompare(left.updatedAt);
      })
    : [];

  return {
    title: "Parallel workflows",
    subtitle: "Pinchy can keep orchestrating this thread while bounded tasks run in parallel.",
    helper: `${linkedTasks.length} linked background task${linkedTasks.length === 1 ? "" : "s"} for this conversation.`,
    linkedTasks,
    counts: {
      pending: linkedTasks.filter((task) => task.status === "pending").length,
      running: linkedTasks.filter((task) => task.status === "running").length,
      blocked: linkedTasks.filter((task) => task.status === "blocked").length,
      done: linkedTasks.filter((task) => task.status === "done").length,
    },
  };
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
