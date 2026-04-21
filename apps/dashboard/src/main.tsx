import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import type {
  Conversation,
  DashboardArtifact as Artifact,
  DashboardState,
  Message,
  NotificationDeliveryStatus,
  QuestionStatus,
  Run,
  RunStatus,
  SavedMemory,
} from "../../../packages/shared/src/contracts.js";
import {
  appendConversationMessage,
  cancelRun,
  createConversation,
  createMemory,
  createRun,
  deleteConversation,
  deleteMemory,
  deleteWorkspace,
  fetchConversationState,
  fetchConversations,
  fetchSettings,
  discoverLocalServerModel,
  registerWorkspace,
  replyToQuestion,
  setActiveWorkspace,
  submitPromptToConversation,
  submitTaskDelegationPlan,
  updateMemory,
  updateSettings,
  type ConversationState,
  type DashboardSettings,
  type LocalServerModelDiscovery,
} from "./control-plane-client.js";
import {
  DASHBOARD_PAGES,
  buildMemoryDraftFromMessage,
  buildAgentChatChromeState,
  buildChatWorkbenchState,
  buildChatWorkspacePanelState,
  buildConversationComposerState,
  buildConversationListEntryPresentation,
  buildSettingsConfigurationState,
  buildSettingsDraftFromSettings,
  buildConversationOnboardingPresets,
  buildConversationOrchestrationState,
  buildConversationShellHeaderState,
  buildConversationTranscriptState,
  decideTranscriptFollowUp,
  buildDashboardSidebarState,
  buildDashboardUtilityRailState,
  buildGlobalPromptState,
  parseDelegationPlanDraft,
  buildMemoryDraftFromQuestion,
  buildRunHeadline,
  buildTranscriptMessagePresentation,
  filterDashboardArtifacts,
  filterSavedMemories,
  resolveDashboardLandingPage,
  resolveWorkspaceConversationSelection,
  summarizeConversationWorkspace,
  summarizeConversationWorkspacePresence,
  summarizeDashboardState,
  workspaceConversationSelectionStorageKey,
  mergeSettingsDraftWithFetchedSettings,
  type DashboardPage,
  type SettingsDraftState,
} from "./dashboard-model.js";

type GeneratedToolDetail = { ok: true; tool: { path: string; source: string } };
type GeneratedToolDiff = { ok: true; diff: { path: string; diff: string } };
type MemoryDraft = {
  title: string;
  content: string;
  kind: SavedMemory["kind"];
  tags: string;
  pinned: boolean;
};

type WorkspaceDraft = {
  path: string;
  name: string;
};

type DoctorReport = {
  summary: { status: "ok" | "warn" | "fail"; okCount: number; warnCount: number; failCount: number };
  checks: Array<{ name: string; status: "ok" | "warn" | "fail"; message: string; hint?: string }>;
};

type SettingsDraft = SettingsDraftState;

type SettingsStatus = {
  tone: "idle" | "success";
  message: string;
};

type LocalServerDiscoveryStatus = {
  state: "idle" | "loading" | "success" | "error";
  message: string;
  detectedModel?: string;
  models: string[];
};

const EMPTY_SETTINGS_STATUS: SettingsStatus = {
  tone: "idle",
  message: "Workspace-local Pinchy runtime defaults for Pi-backed runs.",
};

const EMPTY_LOCAL_SERVER_DISCOVERY_STATUS: LocalServerDiscoveryStatus = {
  state: "idle",
  message: "Enter a local server endpoint to auto-detect an available model.",
  models: [],
};

const EMPTY_SETTINGS_DRAFT: SettingsDraft = {
  defaultProvider: "",
  defaultModel: "",
  defaultThinkingLevel: "medium",
  defaultBaseUrl: "",
};

const EMPTY_WORKSPACE_DRAFT: WorkspaceDraft = {
  path: "",
  name: "",
};

const EMPTY_MEMORY_DRAFT: MemoryDraft = {
  title: "",
  content: "",
  kind: "note",
  tags: "",
  pinned: false,
};

const DASHBOARD_LAST_PAGE_STORAGE_KEY = "pinchy.dashboard.lastPage";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function badgeStyle(color: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    background: color,
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
  };
}

function buttonStyle(kind: "primary" | "danger" | "success" | "ghost" = "primary"): React.CSSProperties {
  const palette = {
    primary: "#2563eb",
    danger: "#dc2626",
    success: "#059669",
    ghost: "#334155",
  } as const;
  return {
    border: 0,
    borderRadius: 10,
    padding: "8px 12px",
    background: palette[kind],
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  };
}

function inputStyle(multiline = false): React.CSSProperties {
  return {
    borderRadius: 10,
    border: "1px solid #475569",
    background: "#0f172a",
    color: "#e5e7eb",
    padding: 10,
    width: "100%",
    resize: multiline ? "vertical" : undefined,
    boxSizing: "border-box",
  };
}

function cardStyle(): React.CSSProperties {
  return {
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  };
}

function pageButtonStyle(active: boolean): React.CSSProperties {
  return {
    ...buttonStyle(active ? "primary" : "ghost"),
    textTransform: "capitalize",
  };
}

function formatTs(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function toneForRunStatus(status: RunStatus) {
  if (status === "completed") return "#059669";
  if (status === "failed" || status === "cancelled") return "#dc2626";
  if (status === "waiting_for_human" || status === "waiting_for_approval") return "#d97706";
  if (status === "running") return "#2563eb";
  return "#475569";
}

function toneForQuestionStatus(status: QuestionStatus) {
  if (status === "answered") return "#059669";
  if (status === "cancelled" || status === "expired") return "#dc2626";
  if (status === "waiting_for_human") return "#d97706";
  return "#475569";
}

function toneForDeliveryStatus(status: NotificationDeliveryStatus) {
  if (status === "delivered" || status === "sent") return "#059669";
  if (status === "failed") return "#dc2626";
  return "#475569";
}

function parseTags(value: string) {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

function toTestIdSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function ActionRow(props: React.PropsWithChildren<{ title: string; subtitle?: string; actions?: React.ReactNode }>) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap", background: "#0b1220", borderRadius: 10, padding: 10 }}>
      <div style={{ minWidth: 240, flex: "1 1 300px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35, overflowWrap: "anywhere" }}>{props.title}</div>
        {props.subtitle ? <div style={{ color: "#94a3b8", marginTop: 3, fontSize: 12, overflowWrap: "anywhere" }}>{props.subtitle}</div> : null}
        {props.children ? <div style={{ marginTop: 6 }}>{props.children}</div> : null}
      </div>
      {props.actions ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>{props.actions}</div> : null}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ ...cardStyle(), padding: 14, background: "#0b1220" }}>
      <div style={{ color: "#94a3b8", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: tone }}>{value}</div>
    </div>
  );
}

function SectionTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
        {subtitle ? <p style={{ color: "#94a3b8", margin: "4px 0 0", fontSize: 13 }}>{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

function MenuToggleIcon() {
  return (
    <span aria-hidden="true" style={{ display: "grid", gap: 4 }}>
      {[0, 1, 2].map((line) => (
        <span key={line} style={{ display: "block", width: 16, height: 2, borderRadius: 999, background: "currentColor" }} />
      ))}
    </span>
  );
}

function UtilityRailToggleIcon() {
  return (
    <span aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "stretch", gap: 4, width: 18, height: 16 }}>
      <span style={{ display: "grid", gap: 3, alignContent: "center" }}>
        {[0, 1, 2].map((line) => (
          <span key={line} style={{ display: "block", width: 9, height: 2, borderRadius: 999, background: "currentColor", opacity: 0.95 - line * 0.12 }} />
        ))}
      </span>
      <span style={{ display: "block", width: 5, height: "100%", borderRadius: 999, background: "currentColor" }} />
    </span>
  );
}

function ConversationMessages({
  messages,
  onSaveMemory,
  isBusy,
  transcriptState,
  scrollContainerRef,
  onScroll,
  onJumpToLatest,
}: {
  messages: Message[];
  onSaveMemory?: (message: Message) => void;
  isBusy?: boolean;
  transcriptState?: ReturnType<typeof buildConversationTranscriptState>;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  onJumpToLatest?: () => void;
}) {
  const agentPresentation = buildTranscriptMessagePresentation({ role: "agent" });

  return (
    <div style={{ position: "relative" }}>
      <style>{`@keyframes pinchyTypingWave { 0%, 60%, 100% { transform: translateY(0); opacity: 0.38; } 30% { transform: translateY(-4px); opacity: 1; } }`}</style>
      <div ref={scrollContainerRef} onScroll={onScroll} style={{ display: "grid", gap: 10, maxHeight: 560, overflow: "auto", paddingRight: 4, paddingBottom: 56 }}>
        {messages.length === 0 ? <p style={{ color: "#94a3b8" }}>No messages yet.</p> : messages.map((message) => {
          const presentation = buildTranscriptMessagePresentation(message);
          const justifyContent = presentation.align === "end" ? "flex-end" : presentation.align === "center" ? "center" : "flex-start";
          return (
            <div key={message.id} style={{ display: "flex", justifyContent }}>
              <div
                data-testid={`message-row-${message.id}`}
                style={{
                  width: presentation.bubbleWidth,
                  borderRadius: presentation.surfaceTone === "system" ? 12 : 16,
                  border: `1px solid ${presentation.borderColor}`,
                  background: presentation.background,
                  boxShadow: presentation.shadow,
                  padding: presentation.bubblePadding,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: presentation.metaGap, marginBottom: presentation.metaGap, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <strong style={{ color: presentation.accentColor, letterSpacing: 0.2, fontSize: 13 }}>{presentation.roleLabel}</strong>
                      {message.runId ? <span style={{ ...badgeStyle("#334155"), padding: "3px 7px", fontSize: 11, fontWeight: 600 }}>run</span> : null}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 3 }}>{formatTs(message.createdAt)}</div>
                  </div>
                  {onSaveMemory ? <button data-testid={`message-save-memory-${message.id}`} style={{ ...buttonStyle("ghost"), padding: "6px 10px", fontSize: 12 }} disabled={isBusy} onClick={() => onSaveMemory(message)}>Save</button> : null}
                </div>
                <div style={{ whiteSpace: "pre-wrap", color: "#e5e7eb", lineHeight: 1.55, fontSize: 14, overflowWrap: "anywhere" }}>{message.content}</div>
              </div>
            </div>
          );
        })}
        {transcriptState?.showTypingIndicator ? (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              data-testid="conversation-typing-indicator"
              style={{
                width: "fit-content",
                borderRadius: 16,
                border: `1px solid ${agentPresentation.borderColor}`,
                background: agentPresentation.background,
                boxShadow: agentPresentation.shadow,
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <strong style={{ color: agentPresentation.accentColor, letterSpacing: 0.2, fontSize: 13 }}>Pinchy</strong>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>{transcriptState.typingLabel}</span>
              </div>
              <div aria-label={transcriptState.typingLabel} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: "#93c5fd",
                      animation: `pinchyTypingWave 1.1s ease-in-out ${dot * 0.14}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {transcriptState?.showNewMessagesNotice && onJumpToLatest ? (
        <div style={{ position: "absolute", right: 18, bottom: 14 }}>
          <button data-testid="conversation-new-messages" style={{ ...buttonStyle("primary"), borderRadius: 999, boxShadow: "0 10px 22px rgba(37, 99, 235, 0.28)" }} onClick={onJumpToLatest}>
            {transcriptState.newMessagesLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function toneForWorkspaceSummary(tone: "info" | "warning" | "idle") {
  if (tone === "info") return "#2563eb";
  if (tone === "warning") return "#d97706";
  return "#475569";
}

function isTranscriptScrolledNearBottom(element: HTMLDivElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 40;
}

function App() {
  const [page, setPage] = useState<DashboardPage>(() => {
    if (typeof window === "undefined") return resolveDashboardLandingPage();
    const storedPage = window.localStorage.getItem(DASHBOARD_LAST_PAGE_STORAGE_KEY);
    return resolveDashboardLandingPage(DASHBOARD_PAGES.includes(storedPage as DashboardPage) ? storedPage as DashboardPage : undefined);
  });
  const [state, setState] = useState<DashboardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artifactQuery, setArtifactQuery] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedToolSource, setSelectedToolSource] = useState<string>("");
  const [selectedToolDiff, setSelectedToolDiff] = useState<string>("");
  const [queueTaskTitle, setQueueTaskTitle] = useState("");
  const [queueTaskPrompt, setQueueTaskPrompt] = useState("");
  const [newConversationTitle, setNewConversationTitle] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [memoryDraft, setMemoryDraft] = useState<MemoryDraft>(EMPTY_MEMORY_DRAFT);
  const [delegationPlanDraft, setDelegationPlanDraft] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraft>(EMPTY_WORKSPACE_DRAFT);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(undefined);
  const [selectedConversationState, setSelectedConversationState] = useState<ConversationState | null>(null);
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null);
  const [fetchedSettings, setFetchedSettings] = useState<DashboardSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(EMPTY_SETTINGS_DRAFT);
  const [settingsStatus, setSettingsStatus] = useState<SettingsStatus>(EMPTY_SETTINGS_STATUS);
  const [localServerDiscovery, setLocalServerDiscovery] = useState<LocalServerDiscoveryStatus>(EMPTY_LOCAL_SERVER_DISCOVERY_STATUS);
  const detectedModelRef = useRef<string | undefined>(undefined);
  const [chatToolsExpanded, setChatToolsExpanded] = useState(false);
  const [chatWorkflowsExpanded, setChatWorkflowsExpanded] = useState(false);
  const [conversationSidebarOpen, setConversationSidebarOpen] = useState(false);
  const [conversationUtilityRailOpen, setConversationUtilityRailOpen] = useState(false);
  const [hasUnreadLatestMessages, setHasUnreadLatestMessages] = useState(false);
  const [isTranscriptNearBottom, setIsTranscriptNearBottom] = useState(true);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const transcriptSnapshotRef = useRef<{ conversationId?: string; messageCount: number; latestMessageId?: string; latestMessageContent?: string }>({ conversationId: undefined, messageCount: 0, latestMessageId: undefined, latestMessageContent: undefined });

  const load = async (options?: { preserveUnsavedSettingsDraft?: boolean }) => {
    try {
      const [nextState, nextDoctorReport, nextSettings] = await Promise.all([
        fetchJson<DashboardState>("/api/state"),
        fetchJson<DoctorReport>("/api/doctor"),
        fetchSettings(),
      ]);
      setState(nextState);
      setDoctorReport(nextDoctorReport);
      setFetchedSettings((current) => {
        setSettingsDraft((draft) => mergeSettingsDraftWithFetchedSettings({
          currentDraft: draft,
          previousFetchedSettings: current ?? undefined,
          incomingSettings: nextSettings,
          preserveUnsavedChanges: options?.preserveUnsavedSettingsDraft ?? true,
        }));
        return nextSettings;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadConversations = async () => {
    try {
      const nextConversations = await fetchConversations();
      const workspaceStorageKey = state?.activeWorkspaceId ? workspaceConversationSelectionStorageKey(state.activeWorkspaceId) : undefined;
      const storedConversationId = workspaceStorageKey && typeof window !== "undefined"
        ? window.localStorage.getItem(workspaceStorageKey) ?? undefined
        : undefined;
      setConversations(nextConversations);
      setSelectedConversationId((current) => resolveWorkspaceConversationSelection(nextConversations, current, storedConversationId));
      setOperatorError(null);
    } catch (err) {
      setOperatorError(err instanceof Error ? err.message : String(err));
    }
  };

  const loadConversationState = async (conversationId: string) => {
    try {
      const nextState = await fetchConversationState(conversationId);
      setSelectedConversationState(nextState);
      setOperatorError(null);
    } catch (err) {
      setOperatorError(err instanceof Error ? err.message : String(err));
    }
  };

  const scrollTranscriptToBottom = (behavior: ScrollBehavior = "smooth") => {
    const element = transcriptScrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    setHasUnreadLatestMessages(false);
    setIsTranscriptNearBottom(true);
  };

  const handleTranscriptScroll: React.UIEventHandler<HTMLDivElement> = (event) => {
    const nextNearBottom = isTranscriptScrolledNearBottom(event.currentTarget);
    setIsTranscriptNearBottom(nextNearBottom);
    if (nextNearBottom) {
      setHasUnreadLatestMessages(false);
    }
  };

  useEffect(() => {
    void load();
    void loadConversations();
    const source = new EventSource("/api/events");
    source.addEventListener("state", (event) => {
      const message = event as MessageEvent<string>;
      setState(JSON.parse(message.data) as DashboardState);
      setError(null);
      void loadConversations();
      if (selectedConversationId) {
        void loadConversationState(selectedConversationId);
      }
    });
    source.onerror = () => {
      setError((current) => current ?? "Live updates disconnected; retrying.");
    };
    return () => source.close();
  }, [selectedConversationId]);

  useEffect(() => {
    const operatorRefresh = window.setInterval(() => {
      void loadConversations();
      void load();
      if (selectedConversationId) {
        void loadConversationState(selectedConversationId);
      }
    }, 5000);
    return () => window.clearInterval(operatorRefresh);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      setSelectedConversationState(null);
      transcriptSnapshotRef.current = { conversationId: undefined, messageCount: 0, latestMessageId: undefined, latestMessageContent: undefined };
      setHasUnreadLatestMessages(false);
      setIsTranscriptNearBottom(true);
      return;
    }
    void loadConversationState(selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    if (page !== "conversations") return;
    const frame = window.requestAnimationFrame(() => scrollTranscriptToBottom("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [page, selectedConversationId]);

  useEffect(() => {
    const latestMessage = selectedConversationState?.messages.at(-1);
    const latestMessageId = latestMessage?.id;
    const latestMessageContent = latestMessage?.content;
    const nextMessageCount = selectedConversationState?.messages.length ?? 0;
    const previous = transcriptSnapshotRef.current;
    const changedConversation = previous.conversationId !== selectedConversationId;
    const messageCountChanged = !changedConversation && nextMessageCount !== previous.messageCount;
    const latestMessageChanged = !changedConversation && (
      latestMessageId !== previous.latestMessageId || latestMessageContent !== previous.latestMessageContent
    );
    const followUp = decideTranscriptFollowUp({
      changedConversation,
      messageCountChanged,
      latestMessageChanged,
      isNearBottom: isTranscriptNearBottom,
    });

    transcriptSnapshotRef.current = {
      conversationId: selectedConversationId,
      messageCount: nextMessageCount,
      latestMessageId,
      latestMessageContent,
    };

    if (page !== "conversations") return;
    if (!followUp.shouldScrollToBottom && !followUp.shouldMarkUnread) return;

    const frame = window.requestAnimationFrame(() => {
      if (followUp.shouldScrollToBottom) {
        scrollTranscriptToBottom("smooth");
        return;
      }
      if (followUp.shouldMarkUnread) {
        setHasUnreadLatestMessages(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isTranscriptNearBottom, page, selectedConversationId, selectedConversationState?.messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DASHBOARD_LAST_PAGE_STORAGE_KEY, page);
  }, [page]);

  useEffect(() => {
    if (typeof window === "undefined" || !state?.activeWorkspaceId) return;
    const storageKey = workspaceConversationSelectionStorageKey(state.activeWorkspaceId);
    if (selectedConversationId) {
      window.localStorage.setItem(storageKey, selectedConversationId);
      return;
    }
    window.localStorage.removeItem(storageKey);
  }, [selectedConversationId, state?.activeWorkspaceId]);

  useEffect(() => {
    const trimmedBaseUrl = settingsDraft.defaultBaseUrl.trim();
    if (!trimmedBaseUrl) {
      detectedModelRef.current = undefined;
      setLocalServerDiscovery(EMPTY_LOCAL_SERVER_DISCOVERY_STATUS);
      return;
    }

    const timeout = window.setTimeout(() => {
      setLocalServerDiscovery({
        state: "loading",
        message: "Detecting a model from the local server…",
        models: [],
      });
      void discoverLocalServerModel(trimmedBaseUrl)
        .then((result: LocalServerModelDiscovery) => {
          const previousDetectedModel = detectedModelRef.current;
          detectedModelRef.current = result.detectedModel;
          setLocalServerDiscovery({
            state: "success",
            message: result.detectedModel
              ? `Detected model: ${result.detectedModel}`
              : "No models were returned by this local server.",
            detectedModel: result.detectedModel,
            models: result.models,
          });
          if (!result.detectedModel) return;
          setSettingsDraft((current) => {
            const shouldAdoptDetectedModel = !current.defaultModel.trim() || current.defaultModel === previousDetectedModel;
            if (!shouldAdoptDetectedModel) {
              return current;
            }
            return {
              ...current,
              defaultModel: result.detectedModel,
            };
          });
        })
        .catch((error) => {
          detectedModelRef.current = undefined;
          setLocalServerDiscovery({
            state: "error",
            message: error instanceof Error ? error.message : String(error),
            models: [],
          });
        });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [settingsDraft.defaultBaseUrl]);

  useEffect(() => {
    if (!state?.activeWorkspaceId) return;
    const storageKey = typeof window !== "undefined"
      ? window.localStorage.getItem(workspaceConversationSelectionStorageKey(state.activeWorkspaceId)) ?? undefined
      : undefined;
    setSelectedConversationId((current) => resolveWorkspaceConversationSelection(conversations, current, storageKey));
  }, [conversations, state?.activeWorkspaceId]);

  useEffect(() => {
    if (!selectedTool) return;
    void fetchJson<GeneratedToolDetail>(`/api/generated-tools/${encodeURIComponent(selectedTool)}`).then((payload) => {
      setSelectedToolSource(payload.tool.source);
    }).catch((err) => {
      setSelectedToolSource(`Unable to load generated tool: ${err instanceof Error ? err.message : String(err)}`);
    });
    void fetchJson<GeneratedToolDiff>(`/api/generated-tools/${encodeURIComponent(selectedTool)}/diff`).then((payload) => {
      setSelectedToolDiff(payload.diff.diff);
    }).catch((err) => {
      setSelectedToolDiff(`Unable to load git diff: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, [selectedTool]);

  const performAction = async (action: string, payload: Record<string, unknown>) => {
    setIsBusy(true);
    try {
      await fetchJson<{ ok: boolean }>(`/api/actions/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      if (selectedConversationId) await loadConversationState(selectedConversationId);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReplySubmit = async (questionId: string) => {
    if (!selectedConversationId) return;
    const content = replyDrafts[questionId]?.trim();
    if (!content) return;
    setIsBusy(true);
    try {
      await replyToQuestion({ questionId, conversationId: selectedConversationId, content });
      setReplyDrafts((current) => ({ ...current, [questionId]: "" }));
      await loadConversationState(selectedConversationId);
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleRunCancel = async (runId: string) => {
    setIsBusy(true);
    try {
      await cancelRun(runId);
      if (selectedConversationId) {
        await loadConversationState(selectedConversationId);
      }
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateConversation = async () => {
    const title = newConversationTitle.trim();
    if (!title) return;
    setIsBusy(true);
    try {
      const conversation = await createConversation(title);
      setSelectedConversationId(conversation.id);
      setNewConversationTitle("");
      await loadConversations();
      await loadConversationState(conversation.id);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitSpecificPrompt = async (prompt: string) => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;
    setIsBusy(true);
    try {
      let conversationId = selectedConversationId;
      if (!conversationId) {
        const conversation = await createConversation(normalizedPrompt.slice(0, 80));
        conversationId = conversation.id;
        setSelectedConversationId(conversation.id);
      }
      await submitPromptToConversation({ conversationId, prompt: normalizedPrompt, kind: "user_prompt" });
      setPromptDraft("");
      await loadConversations();
      await loadConversationState(conversationId);
      await load();
      setPage("conversations");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitPrompt = async () => {
    await handleSubmitSpecificPrompt(promptDraft);
  };

  const handleStartRunFromDraft = async () => {
    const prompt = promptDraft.trim();
    if (!prompt || !selectedConversationId) return;
    setIsBusy(true);
    try {
      await appendConversationMessage({ conversationId: selectedConversationId, role: "user", content: prompt });
      await createRun({ conversationId: selectedConversationId, goal: prompt, kind: "user_prompt" });
      setPromptDraft("");
      await loadConversationState(selectedConversationId);
      await load();
      setPage("conversations");
    } finally {
      setIsBusy(false);
    }
  };

  const handleMemorySubmit = async () => {
    const title = memoryDraft.title.trim();
    const content = memoryDraft.content.trim();
    if (!title || !content) return;
    setIsBusy(true);
    try {
      const payload = {
        title,
        content,
        kind: memoryDraft.kind,
        tags: parseTags(memoryDraft.tags),
        pinned: memoryDraft.pinned,
      };
      if (editingMemoryId) {
        await updateMemory(editingMemoryId, payload);
      } else {
        await createMemory(payload);
      }
      setEditingMemoryId(null);
      setMemoryDraft(EMPTY_MEMORY_DRAFT);
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleMemoryEdit = (memory: SavedMemory) => {
    setEditingMemoryId(memory.id);
    setMemoryDraft({
      title: memory.title,
      content: memory.content,
      kind: memory.kind,
      tags: memory.tags.join(", "),
      pinned: memory.pinned,
    });
    setPage("memory");
  };

  const handleSaveMessageToMemory = async (message: Message) => {
    setIsBusy(true);
    try {
      await createMemory(buildMemoryDraftFromMessage(message));
      await load();
      setPage("memory");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveQuestionToMemory = async (question: ConversationState["questions"][number]) => {
    setIsBusy(true);
    try {
      await createMemory(buildMemoryDraftFromQuestion(question));
      await load();
      setPage("memory");
    } finally {
      setIsBusy(false);
    }
  };

  const handleMemoryDelete = async (memoryId: string) => {
    setIsBusy(true);
    try {
      await deleteMemory(memoryId);
      if (editingMemoryId === memoryId) {
        setEditingMemoryId(null);
        setMemoryDraft(EMPTY_MEMORY_DRAFT);
      }
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveRunToMemory = async (run: Run) => {
    const content = [run.summary, run.goal].filter(Boolean).join("\n\n").trim();
    if (!content) return;
    setIsBusy(true);
    try {
      await createMemory({
        title: run.summary ? `Run summary: ${run.goal}` : run.goal,
        content,
        kind: run.summary ? "summary" : "note",
        tags: [run.kind, run.status],
        sourceConversationId: run.conversationId,
        sourceRunId: run.id,
      });
      await load();
      setPage("memory");
    } finally {
      setIsBusy(false);
    }
  };

  const filteredArtifacts = useMemo(() => state ? filterDashboardArtifacts(state.artifacts, artifactQuery) : [], [artifactQuery, state]);
  const filteredMemories = useMemo(() => state ? filterSavedMemories(state.memories, memoryQuery) : [], [memoryQuery, state]);
  const activeWorkspace = useMemo(() => state?.workspaces.find((entry) => entry.id === state.activeWorkspaceId), [state]);
  const conversationWorkspace = useMemo(() => selectedConversationState ? summarizeConversationWorkspace({
    messages: selectedConversationState.messages,
    runs: selectedConversationState.runs,
    questions: selectedConversationState.questions,
  }) : undefined, [selectedConversationState]);
  const onboardingPresets = useMemo(() => buildConversationOnboardingPresets(activeWorkspace?.name), [activeWorkspace?.name]);
  const globalPromptState = useMemo(() => buildGlobalPromptState({
    selectedConversationTitle: selectedConversationState?.conversation.title,
    selectedConversationStatus: conversationWorkspace?.statusLabel,
  }), [conversationWorkspace?.statusLabel, selectedConversationState?.conversation.title]);
  const conversationWorkspacePresence = useMemo(() => summarizeConversationWorkspacePresence({
    activeWorkspaceName: activeWorkspace?.name,
    activeWorkspacePath: activeWorkspace?.path,
    conversationCount: conversations.length,
    selectedConversationTitle: selectedConversationState?.conversation.title,
  }), [activeWorkspace?.name, activeWorkspace?.path, conversations.length, selectedConversationState?.conversation.title]);
  const conversationComposerState = useMemo(() => buildConversationComposerState({
    activeWorkspaceName: activeWorkspace?.name,
    conversationCount: conversations.length,
    selectedConversationTitle: selectedConversationState?.conversation.title,
    selectedConversationStatus: conversationWorkspace?.statusLabel,
    selectedConversationSummary: conversationWorkspace,
  }), [activeWorkspace?.name, conversationWorkspace, conversations.length, selectedConversationState?.conversation.title]);
  const agentChatChrome = useMemo(() => buildAgentChatChromeState({
    selectedConversationTitle: selectedConversationState?.conversation.title,
    selectedConversationStatusLabel: conversationWorkspace?.statusLabel,
    selectedConversationStatusTone: conversationWorkspace?.statusTone,
    latestMessagePreview: conversationWorkspace?.latestMessagePreview,
  }), [conversationWorkspace?.latestMessagePreview, conversationWorkspace?.statusLabel, conversationWorkspace?.statusTone, selectedConversationState?.conversation.title]);
  const conversationTranscriptState = useMemo(() => buildConversationTranscriptState({
    messages: selectedConversationState?.messages ?? [],
    runs: selectedConversationState?.runs ?? [],
    hasUnreadLatestMessages,
  }), [hasUnreadLatestMessages, selectedConversationState?.messages, selectedConversationState?.runs]);
  const parsedDelegationTasks = useMemo(() => parseDelegationPlanDraft(delegationPlanDraft), [delegationPlanDraft]);

  useEffect(() => {
    setChatToolsExpanded(false);
  }, [selectedConversationId]);

  const handlePromptDraftKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    if (selectedConversationId) {
      void handleStartRunFromDraft();
      return;
    }
    void handleSubmitPrompt();
  };

  const handleSpawnBackgroundTask = async () => {
    const title = queueTaskTitle.trim();
    const prompt = queueTaskPrompt.trim();
    if (!title || !prompt || !selectedConversationId) return;
    setIsBusy(true);
    try {
      await performAction("queue-task", {
        title,
        prompt,
        conversationId: selectedConversationId,
        runId: selectedConversationState?.conversation.latestRunId,
        source: "user",
      });
      setQueueTaskTitle("");
      setQueueTaskPrompt("");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelegatePlan = async () => {
    if (!selectedConversationId || parsedDelegationTasks.length === 0) return;
    setIsBusy(true);
    try {
      await submitTaskDelegationPlan({
        conversationId: selectedConversationId,
        runId: selectedConversationState?.conversation.latestRunId,
        tasks: parsedDelegationTasks,
      });
      setDelegationPlanDraft("");
      await loadConversationState(selectedConversationId);
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleSettingsSave = async () => {
    setIsBusy(true);
    try {
      const updated = await updateSettings({
        defaultProvider: settingsDraft.defaultProvider,
        defaultModel: settingsDraft.defaultModel,
        defaultThinkingLevel: settingsDraft.defaultThinkingLevel,
        defaultBaseUrl: settingsDraft.defaultBaseUrl,
      });
      setFetchedSettings(updated);
      setSettingsDraft(buildSettingsDraftFromSettings(updated));
      setSettingsStatus({ tone: "success", message: "Saved workspace runtime settings." });
    } finally {
      setIsBusy(false);
    }
  };

  const handleWorkspaceRegister = async () => {
    const path = workspaceDraft.path.trim();
    if (!path) return;
    setIsBusy(true);
    try {
      await registerWorkspace({
        path,
        name: workspaceDraft.name.trim() || undefined,
      });
      setWorkspaceDraft(EMPTY_WORKSPACE_DRAFT);
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleConversationDelete = async (conversationId: string) => {
    setIsBusy(true);
    try {
      await deleteConversation(conversationId);
      setReplyDrafts((current) => {
        const next = { ...current };
        return next;
      });
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(undefined);
        setSelectedConversationState(null);
      }
      await loadConversations();
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  const handleWorkspaceActivate = async (workspaceId: string) => {
    if (workspaceId === state?.activeWorkspaceId) return;
    setIsBusy(true);
    setSelectedConversationId(undefined);
    setSelectedConversationState(null);
    setReplyDrafts({});
    setOperatorError(null);
    try {
      await setActiveWorkspace(workspaceId);
      setSettingsStatus(EMPTY_SETTINGS_STATUS);
      await Promise.all([load({ preserveUnsavedSettingsDraft: false }), loadConversations()]);
    } finally {
      setIsBusy(false);
    }
  };

  const handleWorkspaceDelete = async (workspaceId: string) => {
    setIsBusy(true);
    if (workspaceId === state?.activeWorkspaceId) {
      setSelectedConversationId(undefined);
      setSelectedConversationState(null);
      setReplyDrafts({});
      setOperatorError(null);
    }
    try {
      await deleteWorkspace(workspaceId);
      setSettingsStatus(EMPTY_SETTINGS_STATUS);
      await Promise.all([load({ preserveUnsavedSettingsDraft: false }), loadConversations()]);
    } finally {
      setIsBusy(false);
    }
  };

  const conversationOrchestration = buildConversationOrchestrationState({
    conversationId: selectedConversationId,
    tasks: state?.tasks ?? [],
  });
  const chatWorkspacePanels = buildChatWorkspacePanelState({
    hasSelectedConversation: Boolean(selectedConversationId),
    linkedTaskCounts: conversationOrchestration.counts,
    queuedTaskCount: queueTaskTitle.trim() ? 1 : 0,
    delegationTaskCount: parsedDelegationTasks.length,
  });

  useEffect(() => {
    setChatWorkflowsExpanded(chatWorkspacePanels.workflows.defaultExpanded);
  }, [chatWorkspacePanels.workflows.defaultExpanded, selectedConversationId]);

  if (error && !state) return <div style={{ padding: 24, color: "#fff", background: "#111" }}>Error: {error}</div>;
  if (!state) return <div style={{ padding: 24, color: "#fff", background: "#111" }}>Loading…</div>;

  const pendingApprovals = state.approvals.filter((entry) => entry.status === "pending");
  const daemonTone = state.daemonHealth?.status === "error" ? "#dc2626" : state.daemonHealth?.status === "running" ? "#2563eb" : state.daemonHealth?.status === "idle" ? "#059669" : "#475569";
  const visibleQuestions = selectedConversationState?.questions.filter((question) => question.status === "pending_delivery" || question.status === "waiting_for_human") ?? [];
  const visibleRuns = selectedConversationState?.runs ?? [];
  const visibleReplies = selectedConversationState?.replies ?? [];
  const visibleDeliveries = selectedConversationState?.deliveries ?? [];
  const summary = summarizeDashboardState(state);
  const chatWorkbench = buildChatWorkbenchState({
    pendingTasks: summary.pendingTasks,
    pendingApprovals: summary.pendingApprovals,
    recentRuns: summary.recentRuns,
    hasActiveConversationRun: conversationWorkspace?.hasActiveRun ?? false,
  });
  const settingsConfiguration = buildSettingsConfigurationState({
    defaultProvider: settingsDraft.defaultProvider || undefined,
    defaultModel: settingsDraft.defaultModel || undefined,
    defaultThinkingLevel: settingsDraft.defaultThinkingLevel,
    defaultBaseUrl: settingsDraft.defaultBaseUrl || undefined,
    workspaceDefaults: {
      defaultProvider: fetchedSettings?.workspaceDefaults?.defaultProvider,
      defaultModel: fetchedSettings?.workspaceDefaults?.defaultModel,
      defaultThinkingLevel: fetchedSettings?.workspaceDefaults?.defaultThinkingLevel,
      defaultBaseUrl: fetchedSettings?.workspaceDefaults?.defaultBaseUrl,
    },
    sources: fetchedSettings?.sources,
  });
  const dashboardSidebar = buildDashboardSidebarState({
    isOpen: conversationSidebarOpen,
    page,
  });
  const dashboardUtilityRail = buildDashboardUtilityRailState({
    isOpen: conversationUtilityRailOpen,
    page,
  });
  const conversationShellHeader = buildConversationShellHeaderState({
    page,
    utilityRailToggleLabel: dashboardUtilityRail.toggleLabel,
  });

  return (
    <div style={{ padding: 20, fontFamily: "Inter, system-ui, sans-serif", background: "#0f172a", color: "#e5e7eb", minHeight: "100vh" }}>
      <div style={{ display: "grid", gridTemplateColumns: `${dashboardSidebar.width}px minmax(0, 1fr)`, gap: dashboardSidebar.isOpen ? 16 : 0, alignItems: "start" }}>
        <aside
          style={{
            width: dashboardSidebar.width,
            overflow: "hidden",
            opacity: dashboardSidebar.isOpen ? 1 : 0,
            pointerEvents: dashboardSidebar.isOpen ? "auto" : "none",
            transition: "width 180ms ease, opacity 140ms ease",
          }}
        >
          <section style={{ ...cardStyle(), padding: 14, position: "sticky", top: 20, maxHeight: "calc(100vh - 40px)", overflow: "auto" }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{dashboardSidebar.title}</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{dashboardSidebar.subtitle}</div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {DASHBOARD_PAGES.map((entry) => (
                  <button data-testid={`nav-page-${entry}`} key={entry} style={{ ...pageButtonStyle(page === entry), width: "100%", textAlign: "left" }} onClick={() => setPage(entry)}>{entry}</button>
                ))}
              </div>

              <ActionRow
                title={conversationWorkspacePresence.workspaceLabel}
                subtitle={conversationWorkspacePresence.inventoryLabel}
                actions={activeWorkspace ? <span style={badgeStyle("#2563eb")}>active</span> : undefined}
              >
                <div style={{ color: "#cbd5e1", fontSize: 12 }}>{conversationWorkspacePresence.selectionLabel}</div>
              </ActionRow>

              <div style={{ display: "grid", gap: 8 }}>
                <select
                  data-testid="workspace-select"
                  value={state.activeWorkspaceId ?? ""}
                  onChange={(event) => void handleWorkspaceActivate(event.target.value)}
                  style={inputStyle()}
                  disabled={isBusy || state.workspaces.length === 0}
                >
                  {state.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
                <button data-testid="workspace-refresh" style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void Promise.all([load(), loadConversations()])}>Refresh workspace</button>
              </div>

              <div style={{ display: "grid", gap: 8, paddingTop: 4, borderTop: "1px solid #1e293b" }}>
                <input data-testid="conversation-title-input" value={newConversationTitle} onChange={(event) => setNewConversationTitle(event.target.value)} placeholder="New conversation title" style={inputStyle()} />
                <button data-testid="conversation-create" style={buttonStyle("primary")} disabled={isBusy || !newConversationTitle.trim()} onClick={() => void handleCreateConversation()}>Create conversation</button>
              </div>

              {operatorError ? <p style={{ color: "#fbbf24", margin: 0 }}>{operatorError}</p> : null}

              <div style={{ display: "grid", gap: 10 }}>
                {conversations.length === 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <p style={{ color: "#94a3b8", margin: 0 }}>No conversations in this workspace yet. Create the first thread for this repo.</p>
                    <div style={{ display: "grid", gap: 8 }}>
                      {onboardingPresets.map((preset) => (
                        <button
                          data-testid={`onboarding-preset-${toTestIdSegment(preset.title)}`}
                          key={preset.title}
                          style={{ ...buttonStyle("ghost"), textAlign: "left" }}
                          disabled={isBusy}
                          onClick={() => void handleSubmitSpecificPrompt(preset.prompt)}
                        >
                          <div style={{ fontWeight: 700 }}>{preset.title}</div>
                          <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4, whiteSpace: "normal" }}>{preset.prompt}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : conversations.map((conversation) => {
                  const entry = buildConversationListEntryPresentation({
                    title: conversation.title,
                    status: conversation.status,
                    updatedAtLabel: formatTs(conversation.updatedAt),
                    hasLatestRun: Boolean(conversation.latestRunId),
                    isSelected: selectedConversationId === conversation.id,
                  });

                  return (
                    <div
                      key={conversation.id}
                      style={{
                        background: entry.containerTone === "selected" ? "#172033" : "#111827",
                        border: `1px solid ${entry.containerTone === "selected" ? "#2563eb" : "#334155"}`,
                        borderRadius: 14,
                        padding: 10,
                        boxShadow: entry.containerTone === "selected" ? "0 10px 24px rgba(37, 99, 235, 0.10)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <button
                          data-testid={`conversation-row-${conversation.id}`}
                          onClick={() => setSelectedConversationId(conversation.id)}
                          style={{ border: 0, background: "transparent", color: "inherit", padding: 0, textAlign: "left", cursor: "pointer", flex: 1, minWidth: 0 }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35, overflowWrap: "anywhere" }}>{entry.title}</div>
                          <div style={{ color: "#94a3b8", marginTop: 3, fontSize: 12 }}>{entry.metaLabel}</div>
                          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {entry.badges.map((badge) => (
                              <span key={badge.label} style={{ ...badgeStyle(badge.tone === "accent" ? "#2563eb" : "#475569"), padding: "3px 7px", fontSize: 11, fontWeight: 600 }}>{badge.label}</span>
                            ))}
                          </div>
                        </button>
                        <button
                          data-testid={`conversation-delete-${conversation.id}`}
                          title={entry.deleteLabel}
                          style={{
                            border: "1px solid #7f1d1d",
                            borderRadius: 10,
                            padding: "6px 8px",
                            background: "transparent",
                            color: "#fca5a5",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                            lineHeight: 1,
                          }}
                          disabled={isBusy}
                          onClick={() => void handleConversationDelete(conversation.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </aside>

        <div style={{ minWidth: 0, display: "grid", gap: 16 }}>
          <section style={{ ...cardStyle(), background: "linear-gradient(180deg, #08111f 0%, #0b1220 100%)", borderColor: "#1e293b", padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 420px" }}>
                <button
                  data-testid="conversation-shell-sidebar-toggle"
                  style={{ ...buttonStyle("ghost"), width: 42, height: 42, padding: 0, fontSize: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  disabled={isBusy}
                  onClick={() => setConversationSidebarOpen((current) => !current)}
                  aria-label={dashboardSidebar.toggleLabel}
                  title={dashboardSidebar.toggleLabel}
                >
                  <MenuToggleIcon />
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{dashboardSidebar.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{dashboardSidebar.subtitle}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", flex: "1 1 360px" }}>
                <span style={badgeStyle(daemonTone)}>daemon: {state.daemonHealth?.status ?? "unknown"}</span>
                <span style={badgeStyle("#2563eb")}>{summary.pendingTasks} tasks</span>
                <span style={badgeStyle(summary.pendingApprovals ? "#d97706" : "#059669")}>{summary.pendingApprovals} approvals</span>
                {activeWorkspace ? <span style={badgeStyle("#334155")}>{activeWorkspace.name}</span> : null}
                {error ? <span style={{ color: "#fbbf24", fontSize: 12 }}>{error}</span> : <span style={{ color: "#10b981", fontSize: 12 }}>Live updates connected.</span>}
                {conversationShellHeader.utilityRailToggle ? (
                  <button
                    data-testid="conversation-shell-utility-toggle"
                    style={{ ...buttonStyle("ghost"), width: 42, height: 42, padding: 0, fontSize: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                    disabled={isBusy}
                    onClick={() => setConversationUtilityRailOpen((current) => !current)}
                    aria-label={dashboardUtilityRail.toggleLabel}
                    title={dashboardUtilityRail.toggleLabel}
                  >
                    <UtilityRailToggleIcon />
                  </button>
                ) : null}
              </div>
            </div>
            <div style={{ color: "#cbd5e1", marginTop: 10, fontSize: 13, display: "grid", gap: 4 }}>
              <div>Workspace: {activeWorkspace ? activeWorkspace.path : "none"}</div>
              <div>Run: {state.runContext ? `${state.runContext.currentRunLabel} (${state.runContext.currentRunId})` : "none"}</div>
            </div>
          </section>

          {page === "conversations" ? null : <section style={{ ...cardStyle(), padding: 14 }}>
            <SectionTitle title="Quick prompt" subtitle="Reach the coding agent from anywhere in the dashboard" />
            <div style={{ display: "grid", gap: 10 }}>
              <ActionRow
                title={globalPromptState.targetLabel}
                subtitle={globalPromptState.helperText}
                actions={<span style={badgeStyle(selectedConversationId ? "#2563eb" : "#475569")}>{globalPromptState.targetStatus}</span>}
              />
              <textarea
                data-testid="quick-prompt-input"
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                onKeyDown={handlePromptDraftKeyDown}
                placeholder={selectedConversationId ? (conversationWorkspace?.composerPlaceholder ?? "Send the next message to Pinchy") : "Describe the next thing Pinchy should do"}
                rows={5}
                style={inputStyle(true)}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button data-testid="quick-prompt-submit" style={buttonStyle("primary")} disabled={isBusy || !promptDraft.trim()} onClick={() => void (selectedConversationId ? handleStartRunFromDraft() : handleSubmitPrompt())}>
                  {globalPromptState.primaryActionLabel}
                </button>
                <button data-testid="quick-prompt-new-thread" style={buttonStyle("ghost")} disabled={isBusy || !promptDraft.trim() || !selectedConversationId} onClick={() => void handleSubmitPrompt()}>
                  {globalPromptState.secondaryActionLabel}
                </button>
                {selectedConversationId ? <button data-testid="quick-prompt-open-conversation" style={buttonStyle("ghost")} disabled={isBusy} onClick={() => setPage("conversations")}>Open conversation</button> : null}
                <button data-testid="dashboard-refresh" style={buttonStyle("ghost")} onClick={() => void load()}>Refresh</button>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>Tip: press ⌘/Ctrl + Enter to send</span>
              </div>
            </div>
          </section>}

      {page === "overview" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <MetricCard label="Pending tasks" value={String(summary.pendingTasks)} tone="#60a5fa" />
            <MetricCard label="Pending approvals" value={String(summary.pendingApprovals)} tone="#f59e0b" />
            <MetricCard label="Saved memories" value={String(summary.savedMemories)} tone="#a78bfa" />
            <MetricCard label="Workspaces" value={String(state.workspaces.length)} tone="#22c55e" />
            <MetricCard label="Pinned memories" value={String(summary.pinnedMemories)} tone="#34d399" />
            <MetricCard label="Recent runs" value={String(summary.recentRuns)} tone="#f472b6" />
            <MetricCard label="Reload requests" value={String(summary.pendingReloads)} tone="#94a3b8" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(320px, 1fr)", gap: 16 }}>
            <section style={cardStyle()}>
              <SectionTitle title="Environment health" subtitle="Workspace readiness and setup status" actions={<button style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void load()}>Refresh health</button>} />
              {!doctorReport ? <p style={{ color: "#94a3b8" }}>Loading doctor report…</p> : (
                <div style={{ display: "grid", gap: 10 }}>
                  <ActionRow title={`doctor: ${doctorReport.summary.status}`} subtitle={`ok=${doctorReport.summary.okCount} warn=${doctorReport.summary.warnCount} fail=${doctorReport.summary.failCount}`} actions={<span style={badgeStyle(doctorReport.summary.status === "ok" ? "#059669" : doctorReport.summary.status === "warn" ? "#d97706" : "#dc2626")}>{doctorReport.summary.status}</span>}>
                    <div style={{ color: "#cbd5e1", display: "grid", gap: 6 }}>
                      {doctorReport.checks.slice(0, 5).map((check) => <div key={check.name}>{check.name}: {check.status}</div>)}
                    </div>
                  </ActionRow>
                  <div style={{ color: "#94a3b8", fontSize: 13 }}>Recommended flow: pinchy setup → pinchy doctor → pinchy up → pinchy agent</div>
                </div>
              )}
            </section>
            <section style={cardStyle()}>
              <SectionTitle title="Selected conversation" subtitle="Use this like an operator cockpit for one thread" />
              {!selectedConversationState ? <p style={{ color: "#94a3b8" }}>Select a conversation from the Conversations page.</p> : (
                <div style={{ display: "grid", gap: 10 }}>
                  <ActionRow title={selectedConversationState.conversation.title} subtitle={selectedConversationState.conversation.id} actions={<span style={badgeStyle("#475569")}>{selectedConversationState.conversation.status}</span>}>
                    <div style={{ color: "#cbd5e1", display: "grid", gap: 4 }}>
                      <div>{selectedConversationState.messages.length} messages</div>
                      <div>{selectedConversationState.runs.length} runs</div>
                      <div>{visibleQuestions.length} blocked questions</div>
                    </div>
                  </ActionRow>
                  <ConversationMessages messages={selectedConversationState.messages.slice(0, 6)} onSaveMemory={handleSaveMessageToMemory} isBusy={isBusy} />
                </div>
              )}
            </section>
            <section style={cardStyle()}>
              <SectionTitle title="Daemon health" subtitle="Current automation posture" actions={<button data-testid="reload-runtime" style={buttonStyle("primary")} disabled={isBusy} onClick={() => void performAction("reload-runtime", {})}>Reload Runtime</button>} />
              <ActionRow title={`status: ${state.daemonHealth?.status ?? "unknown"}`} subtitle={`heartbeat: ${formatTs(state.daemonHealth?.heartbeatAt)}`} actions={<span style={badgeStyle(daemonTone)}>{state.daemonHealth?.status ?? "unknown"}</span>}>
                <div style={{ color: "#cbd5e1", display: "grid", gap: 4 }}>
                  <div>pid: {state.daemonHealth?.pid ?? "—"}</div>
                  <div>started: {formatTs(state.daemonHealth?.startedAt)}</div>
                  <div>activity: {state.daemonHealth?.currentActivity ?? "idle"}</div>
                  <div>last completed: {formatTs(state.daemonHealth?.lastCompletedAt)}</div>
                  {state.daemonHealth?.lastError ? <div style={{ color: "#fca5a5" }}>last error: {state.daemonHealth.lastError}</div> : null}
                </div>
              </ActionRow>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                {state.memories.slice(0, 3).map((memory) => (
                  <ActionRow key={memory.id} title={memory.title} subtitle={`${memory.kind} • ${memory.tags.join(", ") || "untagged"}`} actions={memory.pinned ? <span style={badgeStyle("#7c3aed")}>pinned</span> : null}>
                    <div style={{ color: "#cbd5e1", whiteSpace: "pre-wrap" }}>{memory.content}</div>
                  </ActionRow>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {page === "conversations" ? (
        <div style={{ display: "grid", gridTemplateColumns: `minmax(0, 1.35fr) ${dashboardUtilityRail.width}px`, gap: dashboardUtilityRail.isOpen ? 16 : 0, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 16 }}>
            <section style={{ ...cardStyle(), background: "linear-gradient(180deg, #08111f 0%, #0b1220 100%)", borderColor: "#1e293b", padding: 14 }}>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ border: "1px solid #1e3a8a", borderRadius: 16, padding: 12, background: "linear-gradient(180deg, rgba(30, 64, 175, 0.08) 0%, rgba(15, 23, 42, 0.12) 100%)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{agentChatChrome.eyebrow}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{agentChatChrome.title}</div>
                      <div style={{ color: "#cbd5e1", marginTop: 8, fontSize: 14 }}>{agentChatChrome.helper}</div>
                    </div>
                    <span style={badgeStyle(toneForWorkspaceSummary(agentChatChrome.statusTone))}>{agentChatChrome.statusLabel}</span>
                  </div>
                </div>

                <section style={{ ...cardStyle(), background: "linear-gradient(180deg, #0b1220 0%, #0f172a 100%)", borderColor: "#1e293b", padding: 14, minHeight: 500 }}>
                  <SectionTitle title="Conversation transcript" subtitle="A calmer, chat-first thread between you and Pinchy" />
                  {!selectedConversationState ? <p style={{ color: "#94a3b8" }}>Select a conversation to inspect the transcript.</p> : <ConversationMessages messages={selectedConversationState.messages} onSaveMemory={handleSaveMessageToMemory} isBusy={isBusy} transcriptState={conversationTranscriptState} scrollContainerRef={transcriptScrollRef} onScroll={handleTranscriptScroll} onJumpToLatest={() => scrollTranscriptToBottom("smooth")} />}
                </section>

                <div style={{ border: "1px solid #334155", borderRadius: 18, background: "#020617", padding: 14, boxShadow: "inset 0 1px 0 rgba(148, 163, 184, 0.08)" }}>
                  <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{agentChatChrome.composerLabel}</div>
                  <textarea
                    data-testid="conversation-composer-input"
                    value={promptDraft}
                    onChange={(event) => setPromptDraft(event.target.value)}
                    onKeyDown={handlePromptDraftKeyDown}
                    placeholder={conversationComposerState.placeholder}
                    rows={4}
                    style={{ ...inputStyle(true), border: "none", background: "transparent", padding: 0, boxShadow: "none", minHeight: 96 }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                    <button data-testid="conversation-composer-submit" style={buttonStyle("primary")} disabled={isBusy || !promptDraft.trim()} onClick={() => void (selectedConversationId ? handleStartRunFromDraft() : handleSubmitPrompt())}>{conversationComposerState.primaryActionLabel}</button>
                    {selectedConversationId ? <button data-testid="conversation-composer-new-thread" style={buttonStyle("ghost")} disabled={isBusy || !promptDraft.trim()} onClick={() => void handleSubmitPrompt()}>Start new thread</button> : null}
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>{conversationComposerState.subtitle}</span>
                    <span style={{ color: "#64748b", fontSize: 12 }}>⌘/Ctrl + Enter to send</span>
                  </div>
                  {!selectedConversationId && conversations.length === 0 ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      <div style={{ color: "#94a3b8", fontSize: 12 }}>Or start from a preset:</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {onboardingPresets.map((preset) => (
                          <button data-testid={`composer-preset-${toTestIdSegment(preset.title)}`} key={preset.title} style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void handleSubmitSpecificPrompt(preset.prompt)}>{preset.title}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <div style={{ width: dashboardUtilityRail.width, overflow: "hidden", opacity: dashboardUtilityRail.isOpen ? 1 : 0, pointerEvents: dashboardUtilityRail.isOpen ? "auto" : "none", transition: "width 180ms ease, opacity 140ms ease", display: "grid", gap: 16 }}>
            <section style={{ ...cardStyle(), background: "linear-gradient(180deg, #0b1220 0%, #111827 100%)", borderColor: "#1e293b", padding: 14 }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{chatWorkspacePanels.tools.title}</div>
                    <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>{chatWorkspacePanels.tools.summary}</div>
                  </div>
                  <button data-testid="chat-tools-toggle" style={buttonStyle("ghost")} disabled={isBusy} onClick={() => setChatToolsExpanded((current) => !current)}>{chatToolsExpanded ? "Hide tools" : chatWorkspacePanels.tools.toggleLabel}</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {chatWorkbench.badges.map((badge) => (
                    <span key={badge.label} style={badgeStyle(toneForWorkspaceSummary(badge.tone))}>{badge.label}</span>
                  ))}
                </div>
                {chatToolsExpanded ? (
                  <div style={{ display: "grid", gap: 12, borderTop: "1px solid #1e293b", paddingTop: 12 }}>
                    <div style={{ display: "grid", gap: 8 }}>
                      <input data-testid="chat-task-title-input" value={queueTaskTitle} onChange={(event) => setQueueTaskTitle(event.target.value)} placeholder="Background task title" style={inputStyle()} />
                      <textarea data-testid="chat-task-prompt-input" value={queueTaskPrompt} onChange={(event) => setQueueTaskPrompt(event.target.value)} placeholder="Queue a focused task for parallel execution while you keep chatting here" rows={4} style={inputStyle(true)} />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button data-testid="chat-task-submit" style={buttonStyle("ghost")} disabled={isBusy || !queueTaskTitle.trim() || !queueTaskPrompt.trim() || !selectedConversationId} onClick={() => void handleSpawnBackgroundTask()}>Spawn bounded task</button>
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>{selectedConversationId ? "Use this to spin off parallel work without leaving the thread." : "Select a conversation first so Pinchy can orchestrate subtasks from the active thread."}</span>
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12, display: "grid", gap: 8 }}>
                      <div style={{ color: "#93c5fd", fontSize: 12, fontWeight: 700 }}>Delegate a multi-task plan</div>
                      <textarea data-testid="chat-delegation-plan-input" value={delegationPlanDraft} onChange={(event) => setDelegationPlanDraft(event.target.value)} placeholder={`Audit worker logs :: Inspect the worker logs and summarize failures.
Review dashboard smoke :: Run the dashboard smoke checks and report actionable issues.`} rows={5} style={inputStyle(true)} />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button data-testid="chat-delegation-submit" style={buttonStyle("primary")} disabled={isBusy || !selectedConversationId || parsedDelegationTasks.length === 0} onClick={() => void handleDelegatePlan()}>Delegate plan</button>
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>
                          {selectedConversationId
                            ? `${parsedDelegationTasks.length} bounded task${parsedDelegationTasks.length === 1 ? "" : "s"} ready. Format each line as Title :: Prompt.`
                            : "Select a conversation first, then add one subtask per line as Title :: Prompt."}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : <div style={{ color: "#64748b", fontSize: 12 }}>{chatWorkbench.helper}</div>}
              </div>
            </section>

            <section style={{ ...cardStyle(), padding: 12 }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{chatWorkspacePanels.workflows.title}</div>
                    <div style={{ color: "#94a3b8", fontSize: 13, marginTop: 4 }}>{chatWorkspacePanels.workflows.summary}</div>
                  </div>
                  <button data-testid="chat-workflows-toggle" style={buttonStyle("ghost")} disabled={isBusy || !selectedConversationId} onClick={() => setChatWorkflowsExpanded((current) => !current)}>{chatWorkflowsExpanded ? "Hide workflows" : chatWorkspacePanels.workflows.toggleLabel}</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={badgeStyle("#2563eb")}>{conversationOrchestration.counts.running} running</span>
                  <span style={badgeStyle("#475569")}>{conversationOrchestration.counts.pending} pending</span>
                  <span style={badgeStyle("#d97706")}>{conversationOrchestration.counts.blocked} blocked</span>
                  <span style={badgeStyle("#059669")}>{conversationOrchestration.counts.done} done</span>
                </div>
                {!selectedConversationId ? <p style={{ color: "#94a3b8", margin: 0 }}>Select a conversation to see linked parallel workflows.</p> : chatWorkflowsExpanded ? (conversationOrchestration.linkedTasks.length === 0 ? <p style={{ color: "#94a3b8", margin: 0 }}>{conversationOrchestration.helper}</p> : (
                  <div style={{ display: "grid", gap: 10, maxHeight: 260, overflow: "auto" }}>
                    {conversationOrchestration.linkedTasks.map((task) => (
                      <ActionRow key={task.id} title={task.title} subtitle={`${task.source ?? "task"} • ${task.id}`} actions={<span style={badgeStyle(task.status === "running" ? "#2563eb" : task.status === "blocked" ? "#d97706" : task.status === "done" ? "#059669" : "#475569")}>{task.status}</span>}>
                        <div style={{ color: "#cbd5e1", display: "grid", gap: 4, fontSize: 13 }}>
                          <div>{task.prompt}</div>
                          {task.runId ? <div>linked run: {task.runId}</div> : null}
                          <div>updated: {formatTs(task.updatedAt)}</div>
                        </div>
                      </ActionRow>
                    ))}
                  </div>
                )) : <div style={{ color: "#64748b", fontSize: 12 }}>Open this panel only when you want the detailed workflow rail.</div>}
              </div>
            </section>

            <section style={{ ...cardStyle(), padding: 12 }}>
              <SectionTitle title="Runs" subtitle="Queue, status, and save-to-memory actions" />
              {!selectedConversationState ? <p style={{ color: "#94a3b8" }}>Select a conversation to inspect runs.</p> : (
                <div style={{ display: "grid", gap: 10, maxHeight: 320, overflow: "auto" }}>
                  {visibleRuns.length === 0 ? <p style={{ color: "#94a3b8" }}>No runs yet.</p> : visibleRuns.map((run) => (
                    <ActionRow key={run.id} title={buildRunHeadline(run, 84)} subtitle={`${run.kind} • ${run.id}`} actions={<><span style={{ ...badgeStyle(toneForRunStatus(run.status)), padding: "3px 7px", fontSize: 11, fontWeight: 600 }}>{run.status}</span><button data-testid={`run-save-memory-${run.id}`} style={{ ...buttonStyle("ghost"), padding: "6px 10px", fontSize: 12 }} disabled={isBusy || !(run.summary || run.goal)} onClick={() => void handleSaveRunToMemory(run)}>Save</button>{run.status === "completed" || run.status === "failed" || run.status === "cancelled" ? null : <button data-testid={`run-cancel-${run.id}`} style={{ ...buttonStyle("danger"), padding: "6px 10px", fontSize: 12 }} disabled={isBusy} onClick={() => void handleRunCancel(run.id)}>Cancel</button>}</>}>
                      <div style={{ color: "#cbd5e1", display: "grid", gap: 4, fontSize: 13 }}>
                        <div>created: {formatTs(run.createdAt)}</div>
                        <div>updated: {formatTs(run.updatedAt)}</div>
                        {run.blockedReason ? <div>blocked: {run.blockedReason}</div> : null}
                        {run.summary ? <div>summary: {run.summary}</div> : null}
                      </div>
                    </ActionRow>
                  ))}
                </div>
              )}
            </section>

            <section style={{ ...cardStyle(), padding: 12 }}>
              <SectionTitle title="Question inbox" subtitle="Reply when the agent is blocked and waiting" />
              {!selectedConversationState ? <p style={{ color: "#94a3b8" }}>Select a conversation to review blocked questions.</p> : visibleQuestions.length === 0 ? <p style={{ color: "#94a3b8" }}>No pending or waiting questions for this conversation.</p> : (
                <div style={{ display: "grid", gap: 10, maxHeight: 320, overflow: "auto" }}>
                  {visibleQuestions.map((question) => (
                    <ActionRow key={question.id} title={question.prompt} subtitle={`priority: ${question.priority} • ${question.id}`} actions={<span style={badgeStyle(toneForQuestionStatus(question.status))}>{question.status}</span>}>
                      <div style={{ color: "#cbd5e1", fontSize: 13, display: "grid", gap: 8 }}>
                        <div>created: {formatTs(question.createdAt)}</div>
                        {question.channelHints?.length ? <div>channels: {question.channelHints.join(", ")}</div> : null}
                        <textarea data-testid={`question-reply-input-${question.id}`} rows={3} value={replyDrafts[question.id] ?? ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Send a dashboard reply to resume this run" style={inputStyle(true)} />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button data-testid={`question-reply-submit-${question.id}`} style={buttonStyle("success")} disabled={isBusy || !(replyDrafts[question.id] ?? "").trim()} onClick={() => void handleReplySubmit(question.id)}>Reply</button>
                          <button data-testid={`question-save-memory-${question.id}`} style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void handleSaveQuestionToMemory(question)}>Save memory</button>
                        </div>
                      </div>
                    </ActionRow>
                  ))}
                </div>
              )}
            </section>

            <section style={cardStyle()}>
              <SectionTitle title="Replies & deliveries" subtitle="Async messaging state for the selected conversation" />
              {!selectedConversationState ? <p style={{ color: "#94a3b8" }}>Select a conversation to inspect async state.</p> : (
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <h3 style={{ marginTop: 0 }}>Replies</h3>
                    <div style={{ display: "grid", gap: 10, maxHeight: 140, overflow: "auto" }}>
                      {visibleReplies.length === 0 ? <p style={{ color: "#94a3b8" }}>No replies yet.</p> : visibleReplies.map((reply) => (
                        <ActionRow key={reply.id} title={reply.content} subtitle={`${reply.channel} • ${formatTs(reply.receivedAt)}`}>
                          <div style={{ color: "#94a3b8", fontSize: 13 }}>question: {reply.questionId}</div>
                        </ActionRow>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 style={{ marginTop: 0 }}>Deliveries</h3>
                    <div style={{ display: "grid", gap: 10, maxHeight: 140, overflow: "auto" }}>
                      {visibleDeliveries.length === 0 ? <p style={{ color: "#94a3b8" }}>No deliveries yet.</p> : visibleDeliveries.map((delivery) => (
                        <ActionRow key={delivery.id} title={`${delivery.channel} delivery`} subtitle={`question: ${delivery.questionId ?? "—"} • run: ${delivery.runId ?? "—"}`} actions={<span style={badgeStyle(toneForDeliveryStatus(delivery.status))}>{delivery.status}</span>}>
                          <div style={{ color: "#cbd5e1", display: "grid", gap: 4, fontSize: 13 }}>
                            <div>sent: {formatTs(delivery.sentAt)}</div>
                            <div>delivered: {formatTs(delivery.deliveredAt)}</div>
                            <div>failed: {formatTs(delivery.failedAt)}</div>
                            {delivery.error ? <div>error: {delivery.error}</div> : null}
                          </div>
                        </ActionRow>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {page === "memory" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 16 }}>
          <section style={cardStyle()}>
            <SectionTitle title={editingMemoryId ? "Edit memory" : "Create memory"} subtitle="Pinchy-native saved memory inspired by OpenClaw’s first-class memory surface" />
            <div style={{ display: "grid", gap: 8 }}>
              <input data-testid="memory-title-input" value={memoryDraft.title} onChange={(event) => setMemoryDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Memory title" style={inputStyle()} />
              <select data-testid="memory-kind-select" value={memoryDraft.kind} onChange={(event) => setMemoryDraft((current) => ({ ...current, kind: event.target.value as SavedMemory["kind"] }))} style={inputStyle()}>
                <option value="note">note</option>
                <option value="decision">decision</option>
                <option value="fact">fact</option>
                <option value="summary">summary</option>
              </select>
              <input data-testid="memory-tags-input" value={memoryDraft.tags} onChange={(event) => setMemoryDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="tags, comma, separated" style={inputStyle()} />
              <textarea data-testid="memory-content-input" value={memoryDraft.content} onChange={(event) => setMemoryDraft((current) => ({ ...current, content: event.target.value }))} placeholder="Saved memory content" rows={8} style={inputStyle(true)} />
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input data-testid="memory-pinned-input" type="checkbox" checked={memoryDraft.pinned} onChange={(event) => setMemoryDraft((current) => ({ ...current, pinned: event.target.checked }))} />
                Pin this memory
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button data-testid="memory-submit" style={buttonStyle("primary")} disabled={isBusy || !memoryDraft.title.trim() || !memoryDraft.content.trim()} onClick={() => void handleMemorySubmit()}>{editingMemoryId ? "Update memory" : "Save memory"}</button>
                <button data-testid="memory-clear" style={buttonStyle("ghost")} onClick={() => { setEditingMemoryId(null); setMemoryDraft(EMPTY_MEMORY_DRAFT); }}>Clear</button>
              </div>
            </div>
          </section>
          <section style={cardStyle()}>
            <SectionTitle title="Saved memories" subtitle="Searchable local memory entries" actions={<input data-testid="memory-search" value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)} placeholder="Search memories" style={{ ...inputStyle(), width: 220 }} />} />
            <div style={{ display: "grid", gap: 10, maxHeight: 720, overflow: "auto" }}>
              {filteredMemories.length === 0 ? <p style={{ color: "#94a3b8" }}>No memories saved yet.</p> : filteredMemories.map((memory) => (
                <ActionRow
                  key={memory.id}
                  title={memory.title}
                  subtitle={`${memory.kind} • ${memory.tags.join(", ") || "untagged"}`}
                  actions={
                    <>
                      {memory.pinned ? <span style={badgeStyle("#7c3aed")}>pinned</span> : null}
                      <button data-testid={`memory-edit-${memory.id}`} style={buttonStyle("ghost")} onClick={() => handleMemoryEdit(memory)}>Edit</button>
                      <button data-testid={`memory-delete-${memory.id}`} style={buttonStyle("danger")} disabled={isBusy} onClick={() => void handleMemoryDelete(memory.id)}>Delete</button>
                    </>
                  }
                >
                  <div style={{ color: "#cbd5e1", whiteSpace: "pre-wrap" }}>{memory.content}</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>
                    updated {formatTs(memory.updatedAt)}
                    {memory.sourceConversationId ? ` • conversation ${memory.sourceConversationId}` : ""}
                    {memory.sourceRunId ? ` • run ${memory.sourceRunId}` : ""}
                  </div>
                </ActionRow>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {page === "operations" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
          <section style={cardStyle()}>
            <SectionTitle title="Workspaces" subtitle="Track repos and choose the active Pinchy workspace" />
            <div style={{ display: "grid", gap: 12 }}>
              <ActionRow
                title={activeWorkspace ? activeWorkspace.name : "No active workspace"}
                subtitle={activeWorkspace ? activeWorkspace.path : "Register a repo path below."}
                actions={activeWorkspace ? <span style={badgeStyle("#2563eb")}>active workspace</span> : undefined}
              >
                <div style={{ color: "#94a3b8", fontSize: 13 }}>This selection now drives dashboard conversation, run, question, memory, and control-plane routing for the active workspace.</div>
              </ActionRow>
              <div style={{ display: "grid", gap: 8 }}>
                <input data-testid="workspace-path-input" value={workspaceDraft.path} onChange={(event) => setWorkspaceDraft((current) => ({ ...current, path: event.target.value }))} placeholder="/absolute/path/to/repo" style={inputStyle()} />
                <input data-testid="workspace-name-input" value={workspaceDraft.name} onChange={(event) => setWorkspaceDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Optional workspace name" style={inputStyle()} />
                <button data-testid="workspace-add" style={buttonStyle("primary")} disabled={isBusy || !workspaceDraft.path.trim()} onClick={() => void handleWorkspaceRegister()}>Add workspace</button>
              </div>
              <div style={{ display: "grid", gap: 10, maxHeight: 240, overflow: "auto" }}>
                {state.workspaces.map((workspace) => (
                  <ActionRow
                    key={workspace.id}
                    title={workspace.name}
                    subtitle={workspace.path}
                    actions={
                      <>
                        {workspace.id === state.activeWorkspaceId ? <span style={badgeStyle("#2563eb")}>active</span> : <button data-testid={`workspace-activate-${workspace.id}`} style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void handleWorkspaceActivate(workspace.id)}>Activate</button>}
                        <button data-testid={`workspace-delete-${workspace.id}`} style={buttonStyle("danger")} disabled={isBusy || state.workspaces.length <= 1} onClick={() => void handleWorkspaceDelete(workspace.id)}>Delete</button>
                      </>
                    }
                  >
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>updated {formatTs(workspace.updatedAt)}</div>
                  </ActionRow>
                ))}
              </div>
            </div>
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Queue task" subtitle="Inject a manual daemon task" />
            <div style={{ display: "grid", gap: 8 }}>
              <input data-testid="queue-task-title-input" value={queueTaskTitle} onChange={(event) => setQueueTaskTitle(event.target.value)} placeholder="Task title" style={inputStyle()} />
              <textarea data-testid="queue-task-prompt-input" value={queueTaskPrompt} onChange={(event) => setQueueTaskPrompt(event.target.value)} placeholder="Task prompt" rows={5} style={inputStyle(true)} />
              <button
                data-testid="queue-task-submit"
                style={buttonStyle("primary")}
                disabled={isBusy || !queueTaskTitle.trim() || !queueTaskPrompt.trim()}
                onClick={() => void performAction("queue-task", { title: queueTaskTitle, prompt: queueTaskPrompt }).then(() => {
                  setQueueTaskTitle("");
                  setQueueTaskPrompt("");
                })}
              >
                Queue task
              </button>
            </div>
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Approvals" subtitle="Resolve pending guarded actions" />
            <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
              {pendingApprovals.length === 0 ? <p style={{ color: "#94a3b8" }}>No pending approvals.</p> : pendingApprovals.map((approval) => (
                <ActionRow
                  key={approval.id}
                  title={approval.toolName}
                  subtitle={approval.reason}
                  actions={
                    <>
                      <button data-testid={`approval-approve-${approval.id}`} style={buttonStyle("success")} disabled={isBusy} onClick={() => void performAction("approval", { id: approval.id, status: "approved" })}>Approve</button>
                      <button data-testid={`approval-deny-${approval.id}`} style={buttonStyle("danger")} disabled={isBusy} onClick={() => void performAction("approval", { id: approval.id, status: "denied" })}>Deny</button>
                    </>
                  }
                >
                  {approval.payload ? <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", borderRadius: 10, padding: 10 }}>{JSON.stringify(approval.payload, null, 2)}</pre> : null}
                </ActionRow>
              ))}
            </div>
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Tasks" subtitle="Local queue state" />
            <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
              {state.tasks.length === 0 ? <p style={{ color: "#94a3b8" }}>No tasks yet.</p> : state.tasks.map((task) => (
                <ActionRow
                  key={task.id}
                  title={task.title}
                  subtitle={`status: ${task.status}`}
                  actions={
                    <>
                      <button data-testid={`task-done-${task.id}`} style={buttonStyle("success")} disabled={isBusy} onClick={() => void performAction("task", { id: task.id, status: "done" })}>Done</button>
                      <button data-testid={`task-block-${task.id}`} style={buttonStyle("danger")} disabled={isBusy} onClick={() => void performAction("task", { id: task.id, status: "blocked" })}>Block</button>
                    </>
                  }
                >
                  {task.prompt ? <div style={{ color: "#cbd5e1", fontSize: 13, whiteSpace: "pre-wrap" }}>{task.prompt}</div> : null}
                </ActionRow>
              ))}
            </div>
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Run timeline" subtitle="Recent daemon/task events" />
            <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
              {state.runHistory.length === 0 ? <p style={{ color: "#94a3b8" }}>No run history yet.</p> : state.runHistory.map((entry) => (
                <ActionRow key={entry.id} title={`${entry.kind}: ${entry.label}`} subtitle={`${entry.status} • ${formatTs(entry.ts)}`}>
                  {entry.details ? <div style={{ color: "#cbd5e1", fontSize: 13, whiteSpace: "pre-wrap" }}>{entry.details}</div> : null}
                </ActionRow>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {page === "tools" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
          <section style={cardStyle()}>
            <SectionTitle title="Pi agent resources" subtitle="Synced resource inventory for the current Pinchy + Pi runtime" />
            <div style={{ display: "grid", gap: 12 }}>
              <ActionRow title="Skills" subtitle="Loaded slash-command and explicit skill resources available to Pinchy and Pi.">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {state.agentResources.filter((entry) => entry.type === "skill").map((entry, index) => (
                    <span key={`${entry.scope}-${entry.type}-${entry.name}`} data-testid={index === 0 ? "tools-agent-resource-skill" : undefined} style={badgeStyle(entry.scope === "workspace" ? "#2563eb" : "#475569")}>{entry.name}</span>
                  ))}
                </div>
              </ActionRow>
              <ActionRow title="Extensions" subtitle="Pi extension/tool surfaces currently available in this workspace and user agent scope.">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {state.agentResources.filter((entry) => entry.type === "extension").map((entry) => (
                    <span key={`${entry.scope}-${entry.type}-${entry.name}`} style={badgeStyle(entry.scope === "workspace" ? "#059669" : "#475569")}>{entry.name}</span>
                  ))}
                </div>
              </ActionRow>
              <ActionRow title="Prompt templates" subtitle="Prompt shortcuts and reusable Pi prompt resources.">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {state.agentResources.filter((entry) => entry.type === "prompt").map((entry) => (
                    <span key={`${entry.scope}-${entry.type}-${entry.name}`} style={badgeStyle(entry.scope === "workspace" ? "#7c3aed" : "#475569")}>{entry.name}</span>
                  ))}
                </div>
              </ActionRow>
            </div>
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Generated tools" subtitle="Review source + diff before reload" />
            {state.generatedTools.length === 0 ? <p style={{ color: "#94a3b8" }}>No generated tools yet.</p> : state.generatedTools.map((tool) => (
              <ActionRow
                key={tool}
                title={tool}
                actions={
                  <>
                    <button data-testid={`generated-tool-review-${toTestIdSegment(tool)}`} style={buttonStyle("ghost")} onClick={() => setSelectedTool(tool)}>Review</button>
                    <button data-testid={`generated-tool-reload-${toTestIdSegment(tool)}`} style={buttonStyle("primary")} disabled={isBusy} onClick={() => void performAction("generated-tool-reload", { name: tool })}>Reload now</button>
                  </>
                }
              />
            ))}
            <div style={{ marginTop: 12, background: "#020617", borderRadius: 12, padding: 12, display: "grid", gap: 12 }}>
              <div style={{ fontWeight: 700 }}>{selectedTool ? `Review: ${selectedTool}` : "Select a generated tool"}</div>
              <div>
                <div style={{ color: "#94a3b8", marginBottom: 6 }}>Source</div>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{selectedToolSource || "Generated tool source will appear here."}</pre>
              </div>
              <div>
                <div style={{ color: "#94a3b8", marginBottom: 6 }}>Git Diff</div>
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{selectedToolDiff || "Generated tool diff will appear here."}</pre>
              </div>
            </div>
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Artifacts" subtitle="Filter by name, tool, note, or tag" actions={<input data-testid="artifact-search" value={artifactQuery} onChange={(event) => setArtifactQuery(event.target.value)} placeholder="Filter artifacts" style={{ ...inputStyle(), width: 220 }} />} />
            <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
              {filteredArtifacts.map((artifact) => (
                <ActionRow
                  key={artifact.name}
                  title={artifact.name}
                  subtitle={`${artifact.size} bytes${artifact.toolName ? ` • ${artifact.toolName}` : ""}`}
                  actions={<button data-testid={`artifact-view-${toTestIdSegment(artifact.name)}`} style={buttonStyle("ghost")} onClick={() => setSelectedArtifact(artifact)}>View</button>}
                >
                  {artifact.tags?.length ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{artifact.tags.map((tag) => <span key={tag} style={badgeStyle("#475569")}>{tag}</span>)}</div> : null}
                  {artifact.note ? <div style={{ color: "#cbd5e1", marginTop: 6 }}>{artifact.note}</div> : null}
                </ActionRow>
              ))}
            </div>
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Routines" subtitle="Saved reusable workflows" />
            {state.routines.length === 0 ? <p style={{ color: "#94a3b8" }}>No routines saved.</p> : state.routines.map((routine) => (
              <ActionRow
                key={routine.name}
                title={routine.name}
                subtitle={`${routine.steps.length} step(s)`}
                actions={<button data-testid={`routine-run-${toTestIdSegment(routine.name)}`} style={buttonStyle("primary")} disabled={isBusy} onClick={() => void performAction("routine-run", { name: routine.name })}>Queue run</button>}
              >
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", borderRadius: 10, padding: 10 }}>{JSON.stringify(routine.steps, null, 2)}</pre>
              </ActionRow>
            ))}
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Audit tail" subtitle="Latest structured worker output" />
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#020617", borderRadius: 10, padding: 12, overflow: "auto", maxHeight: 320 }}>{state.auditTail || "No audit entries yet."}</pre>
          </section>
        </div>
      ) : null}

      {selectedArtifact ? (
        <div data-testid="artifact-modal-overlay" onClick={() => setSelectedArtifact(null)} style={{ position: "fixed", inset: 0, background: "rgba(2, 6, 23, 0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div data-testid="artifact-modal" onClick={(event) => event.stopPropagation()} style={{ width: "min(1000px, 100%)", maxHeight: "90vh", overflow: "auto", ...cardStyle() }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>{selectedArtifact.name}</h2>
                <p style={{ color: "#94a3b8" }}>{selectedArtifact.toolName ?? "artifact"} • {selectedArtifact.size} bytes</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a data-testid="artifact-modal-open" href={`/artifact/${encodeURIComponent(selectedArtifact.name)}`} target="_blank" rel="noreferrer" style={{ ...buttonStyle("primary"), textDecoration: "none" }}>Open</a>
                <button data-testid="artifact-modal-close" style={buttonStyle("ghost")} onClick={() => setSelectedArtifact(null)}>Close</button>
              </div>
            </div>
            {/\.(png|jpg|jpeg|gif|webp)$/i.test(selectedArtifact.name) ? (
              <img src={`/artifact/${encodeURIComponent(selectedArtifact.name)}`} alt={selectedArtifact.name} style={{ width: "100%", borderRadius: 12, marginTop: 12, background: "#020617" }} />
            ) : (
              <iframe title={selectedArtifact.name} src={`/artifact/${encodeURIComponent(selectedArtifact.name)}`} style={{ width: "100%", height: "70vh", border: 0, borderRadius: 12, marginTop: 12, background: "#fff" }} />
            )}
          </div>
        </div>
      ) : null}

      {page === "settings" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 420px) minmax(0, 1fr)", gap: 16 }}>
          <section style={cardStyle()}>
            <SectionTitle title={settingsConfiguration.title} subtitle={settingsConfiguration.subtitle} />
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ color: "#94a3b8", fontSize: 12 }}>Provider presets</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {settingsConfiguration.providerPresets.map((preset) => (
                    <button
                      key={preset.id}
                      data-testid={`settings-preset-${preset.id}`}
                      style={buttonStyle("ghost")}
                      disabled={isBusy}
                      onClick={() => {
                        setSettingsDraft((current) => ({
                          ...current,
                          defaultProvider: preset.provider,
                          defaultModel: current.defaultModel.trim() ? current.defaultModel : preset.suggestedModel,
                        }));
                        setSettingsStatus({ tone: "idle", message: preset.helper });
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>Provider</div>
                <input
                  data-testid="settings-provider-input"
                  value={settingsDraft.defaultProvider}
                  onChange={(event) => {
                    setSettingsDraft((current) => ({ ...current, defaultProvider: event.target.value }));
                    setSettingsStatus(EMPTY_SETTINGS_STATUS);
                  }}
                  placeholder="openai-compatible"
                  style={inputStyle()}
                />
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>Model</div>
                <input
                  data-testid="settings-model-input"
                  value={settingsDraft.defaultModel}
                  onChange={(event) => {
                    setSettingsDraft((current) => ({ ...current, defaultModel: event.target.value }));
                    setSettingsStatus(EMPTY_SETTINGS_STATUS);
                  }}
                  placeholder="Auto-detected from the local server"
                  style={inputStyle()}
                />
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>Endpoint / base URL</div>
                <input
                  data-testid="settings-base-url-input"
                  value={settingsDraft.defaultBaseUrl}
                  onChange={(event) => {
                    setSettingsDraft((current) => ({ ...current, defaultBaseUrl: event.target.value }));
                    setSettingsStatus(EMPTY_SETTINGS_STATUS);
                  }}
                  placeholder="http://127.0.0.1:11434/v1"
                  style={inputStyle()}
                />
                <div data-testid="settings-detected-model" style={{ color: localServerDiscovery.state === "error" ? "#fca5a5" : localServerDiscovery.state === "success" ? "#93c5fd" : "#94a3b8", fontSize: 12, marginTop: 6 }}>
                  {localServerDiscovery.message}
                  {localServerDiscovery.models.length > 1 ? ` (${localServerDiscovery.models.length} models found)` : ""}
                </div>
              </div>
              <div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>Thinking level</div>
                <select
                  data-testid="settings-thinking-select"
                  value={settingsDraft.defaultThinkingLevel}
                  onChange={(event) => {
                    setSettingsDraft((current) => ({ ...current, defaultThinkingLevel: event.target.value as SettingsDraft["defaultThinkingLevel"] }));
                    setSettingsStatus(EMPTY_SETTINGS_STATUS);
                  }}
                  style={inputStyle()}
                >
                  <option value="off">off</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button data-testid="settings-save" style={buttonStyle("primary")} disabled={isBusy} onClick={() => void handleSettingsSave()}>Save settings</button>
                <button data-testid="settings-refresh" style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void load({ preserveUnsavedSettingsDraft: false })}>Reload</button>
                <span style={{ color: settingsStatus.tone === "success" ? "#34d399" : "#94a3b8", fontSize: 12 }}>{settingsStatus.message}</span>
              </div>
            </div>
          </section>

          <section style={cardStyle()}>
            <SectionTitle title="Configuration guidance" subtitle="Keep Pinchy as the shell and Pi as the execution substrate" />
            <div style={{ display: "grid", gap: 10 }}>
              <ActionRow title="Workspace-local runtime config" subtitle={settingsConfiguration.guidance[0]}>
                <div style={{ color: "#cbd5e1", fontSize: 13, display: "grid", gap: 4 }}>
                  <div>Use this page to steer the default provider/model/endpoint/thinking level without editing files manually.</div>
                  <div style={{ color: "#94a3b8" }}>{settingsConfiguration.workspaceOverrideSummary}</div>
                </div>
              </ActionRow>
              <ActionRow title="Recommended local-model flow" subtitle={settingsConfiguration.guidance[1]}>
                <div style={{ color: "#cbd5e1", fontSize: 13, display: "grid", gap: 4 }}>
                  <div>1. provider: ollama</div>
                  <div>2. model: your preferred coding model</div>
                  <div>3. endpoint: set this when using a non-default local server URL</div>
                  <div>4. thinking: medium or high for harder code tasks</div>
                </div>
              </ActionRow>
              <ActionRow title="Current effective defaults" subtitle={settingsConfiguration.guidance[3]}>
                <div style={{ color: "#cbd5e1", fontSize: 13, display: "grid", gap: 8 }}>
                  {settingsConfiguration.summaryRows.map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <span>{row.label}: {row.value}</span>
                      <span style={{ color: "#94a3b8" }}>{row.sourceLabel}</span>
                    </div>
                  ))}
                </div>
              </ActionRow>
            </div>
          </section>
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
