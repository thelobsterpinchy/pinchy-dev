import React, { useEffect, useMemo, useState } from "react";
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
  deleteMemory,
  fetchConversationState,
  fetchConversations,
  registerWorkspace,
  replyToQuestion,
  setActiveWorkspace,
  submitPromptToConversation,
  updateMemory,
  type ConversationState,
} from "./control-plane-client.js";
import {
  DASHBOARD_PAGES,
  buildMemoryDraftFromMessage,
  buildConversationComposerState,
  buildConversationOnboardingPresets,
  buildGlobalPromptState,
  buildMemoryDraftFromQuestion,
  buildRunHeadline,
  filterDashboardArtifacts,
  filterSavedMemories,
  resolveDashboardLandingPage,
  resolveWorkspaceConversationSelection,
  summarizeConversationWorkspace,
  summarizeConversationWorkspacePresence,
  summarizeDashboardState,
  workspaceConversationSelectionStorageKey,
  type DashboardPage,
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
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", background: "#0b1220", borderRadius: 12, padding: 12 }}>
      <div style={{ minWidth: 260, flex: "1 1 320px" }}>
        <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{props.title}</div>
        {props.subtitle ? <div style={{ color: "#94a3b8", marginTop: 4, overflowWrap: "anywhere" }}>{props.subtitle}</div> : null}
        {props.children ? <div style={{ marginTop: 8 }}>{props.children}</div> : null}
      </div>
      {props.actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>{props.actions}</div> : null}
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
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {subtitle ? <p style={{ color: "#94a3b8", margin: "6px 0 0" }}>{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

function ConversationMessages({ messages, onSaveMemory, isBusy }: { messages: Message[]; onSaveMemory?: (message: Message) => void; isBusy?: boolean }) {
  if (messages.length === 0) return <p style={{ color: "#94a3b8" }}>No messages yet.</p>;
  return (
    <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
      {messages.map((message) => (
        <div data-testid={`message-row-${message.id}`} key={message.id} style={{ ...cardStyle(), padding: 12, background: message.role === "user" ? "#172554" : "#0b1220" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
            <div>
              <strong style={{ textTransform: "capitalize" }}>{message.role}</strong>
              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{formatTs(message.createdAt)}</div>
            </div>
            {onSaveMemory ? <button data-testid={`message-save-memory-${message.id}`} style={buttonStyle("ghost")} disabled={isBusy} onClick={() => onSaveMemory(message)}>Save memory</button> : null}
          </div>
          <div style={{ whiteSpace: "pre-wrap", color: "#e5e7eb" }}>{message.content}</div>
        </div>
      ))}
    </div>
  );
}

function toneForWorkspaceSummary(tone: "info" | "warning" | "idle") {
  if (tone === "info") return "#2563eb";
  if (tone === "warning") return "#d97706";
  return "#475569";
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
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraft>(EMPTY_WORKSPACE_DRAFT);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(undefined);
  const [selectedConversationState, setSelectedConversationState] = useState<ConversationState | null>(null);
  const [operatorError, setOperatorError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [isBusy, setIsBusy] = useState(false);

  const load = async () => {
    try {
      const nextState = await fetchJson<DashboardState>("/api/state");
      setState(nextState);
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
      return;
    }
    void loadConversationState(selectedConversationId);
  }, [selectedConversationId]);

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

  const handlePromptDraftKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    if (selectedConversationId) {
      void handleStartRunFromDraft();
      return;
    }
    void handleSubmitPrompt();
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

  const handleWorkspaceActivate = async (workspaceId: string) => {
    if (workspaceId === state?.activeWorkspaceId) return;
    setIsBusy(true);
    setSelectedConversationId(undefined);
    setSelectedConversationState(null);
    setReplyDrafts({});
    setOperatorError(null);
    try {
      await setActiveWorkspace(workspaceId);
      await Promise.all([load(), loadConversations()]);
    } finally {
      setIsBusy(false);
    }
  };

  if (error && !state) return <div style={{ padding: 24, color: "#fff", background: "#111" }}>Error: {error}</div>;
  if (!state) return <div style={{ padding: 24, color: "#fff", background: "#111" }}>Loading…</div>;

  const pendingApprovals = state.approvals.filter((entry) => entry.status === "pending");
  const daemonTone = state.daemonHealth?.status === "error" ? "#dc2626" : state.daemonHealth?.status === "running" ? "#2563eb" : state.daemonHealth?.status === "idle" ? "#059669" : "#475569";
  const visibleQuestions = selectedConversationState?.questions.filter((question) => question.status === "pending_delivery" || question.status === "waiting_for_human") ?? [];
  const visibleRuns = selectedConversationState?.runs ?? [];
  const visibleReplies = selectedConversationState?.replies ?? [];
  const visibleDeliveries = selectedConversationState?.deliveries ?? [];
  const summary = summarizeDashboardState(state);

  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif", background: "#0f172a", color: "#e5e7eb", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <section style={{ ...cardStyle(), flex: 2, minWidth: 320, background: "linear-gradient(135deg, #1e293b, #111827)" }}>
          <h1 style={{ marginTop: 0 }}>Pinchy Control UI</h1>
          <p style={{ color: "#94a3b8" }}>An OpenClaw-style local operator console: focused pages, conversation-driven work, saved memory, approvals, artifacts, and daemon visibility.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {DASHBOARD_PAGES.map((entry) => (
              <button data-testid={`nav-page-${entry}`} key={entry} style={pageButtonStyle(page === entry)} onClick={() => setPage(entry)}>{entry}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {page === "conversations" ? null : <span style={badgeStyle("#2563eb")}>{summary.pendingTasks} pending tasks</span>}
            {page === "conversations" ? null : <span style={badgeStyle(summary.pendingApprovals ? "#d97706" : "#059669")}>{summary.pendingApprovals} pending approvals</span>}
            {page === "conversations" ? null : <span style={badgeStyle("#7c3aed")}>{summary.savedMemories} saved memories</span>}
            <span style={badgeStyle(daemonTone)}>daemon: {state.daemonHealth?.status ?? "unknown"}</span>
          </div>
          <p style={{ color: "#cbd5e1", marginTop: 12 }}>Current workspace: {activeWorkspace ? `${activeWorkspace.name} (${activeWorkspace.path})` : "none"}</p>
          <p style={{ color: "#cbd5e1", marginTop: 12 }}>Current run: {state.runContext ? `${state.runContext.currentRunLabel} (${state.runContext.currentRunId})` : "none"}</p>
          {error ? <p style={{ color: "#fbbf24" }}>{error}</p> : <p style={{ color: "#10b981" }}>Live updates connected.</p>}
        </section>

        <section style={{ ...cardStyle(), flex: 1, minWidth: 320 }}>
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
        </section>
      </div>

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
        <div style={{ display: "grid", gap: 16 }}>
          <section style={cardStyle()}>
            <SectionTitle title="Conversation workspace" subtitle="Switch repos here and keep the chat view anchored to the active workspace" />
            <ActionRow
              title={conversationWorkspacePresence.workspaceLabel}
              subtitle={conversationWorkspacePresence.inventoryLabel}
              actions={activeWorkspace ? <span style={badgeStyle("#2563eb")}>active workspace</span> : undefined}
            >
              <div style={{ color: "#cbd5e1", fontSize: 13, display: "grid", gap: 8 }}>
                <div>{conversationWorkspacePresence.selectionLabel}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    data-testid="workspace-select"
                    value={state.activeWorkspaceId ?? ""}
                    onChange={(event) => void handleWorkspaceActivate(event.target.value)}
                    style={{ ...inputStyle(), width: 320 }}
                    disabled={isBusy || state.workspaces.length === 0}
                  >
                    {state.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                  </select>
                  <button data-testid="workspace-refresh" style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void Promise.all([load(), loadConversations()])}>Refresh workspace</button>
                </div>
              </div>
            </ActionRow>
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 16 }}>
            <section style={cardStyle()}>
              <SectionTitle title="Conversations" subtitle="Persistent work threads for the active workspace" actions={<button style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void loadConversations()}>Refresh</button>} />
              <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <input data-testid="conversation-title-input" value={newConversationTitle} onChange={(event) => setNewConversationTitle(event.target.value)} placeholder="New conversation title" style={inputStyle()} />
                <button data-testid="conversation-create" style={buttonStyle("primary")} disabled={isBusy || !newConversationTitle.trim()} onClick={() => void handleCreateConversation()}>Create conversation</button>
              </div>
              {operatorError ? <p style={{ color: "#fbbf24" }}>{operatorError}</p> : null}
              <div style={{ display: "grid", gap: 10, maxHeight: 680, overflow: "auto" }}>
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
                ) : conversations.map((conversation) => (
                  <button
                    data-testid={`conversation-row-${conversation.id}`}
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    style={{
                      ...cardStyle(),
                      padding: 12,
                      textAlign: "left",
                      cursor: "pointer",
                      background: selectedConversationId === conversation.id ? "#1e293b" : "#111827",
                      borderColor: selectedConversationId === conversation.id ? "#2563eb" : "#334155",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{conversation.title}</div>
                    <div style={{ color: "#94a3b8", marginTop: 4, fontSize: 13 }}>updated {formatTs(conversation.updatedAt)}</div>
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={badgeStyle("#475569")}>{conversation.status}</span>
                      {conversation.latestRunId ? <span style={badgeStyle("#2563eb")}>latest run</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <div style={{ display: "grid", gap: 16 }}>
              <section style={cardStyle()}>
                <SectionTitle title="Talk to agent" subtitle="Use the active workspace like a persistent chat surface with Pinchy" />
                <div style={{ display: "grid", gap: 12 }}>
                  <ActionRow
                    title={conversationComposerState.title}
                    subtitle={conversationComposerState.subtitle}
                    actions={conversationComposerState.statusLabel ? <span style={badgeStyle(toneForWorkspaceSummary(conversationWorkspace?.statusTone ?? "idle"))}>{conversationComposerState.statusLabel}</span> : undefined}
                  >
                    <div style={{ color: "#cbd5e1", fontSize: 13, display: "grid", gap: 4 }}>
                      {selectedConversationState ? <div>conversation: {selectedConversationState.conversation.id}</div> : <div>Active workspace: {conversationWorkspacePresence.workspaceLabel}</div>}
                      {conversationComposerState.latestMessagePreview ? <div>latest: {conversationComposerState.latestMessagePreview}</div> : <div>{conversationWorkspacePresence.selectionLabel}</div>}
                    </div>
                  </ActionRow>
                  <textarea
                    data-testid="conversation-composer-input"
                    value={promptDraft}
                    onChange={(event) => setPromptDraft(event.target.value)}
                    onKeyDown={handlePromptDraftKeyDown}
                    placeholder={conversationComposerState.placeholder}
                    rows={4}
                    style={inputStyle(true)}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button data-testid="conversation-composer-submit" style={buttonStyle("primary")} disabled={isBusy || !promptDraft.trim()} onClick={() => void (selectedConversationId ? handleStartRunFromDraft() : handleSubmitPrompt())}>{conversationComposerState.primaryActionLabel}</button>
                    {selectedConversationId ? <button data-testid="conversation-composer-new-thread" style={buttonStyle("ghost")} disabled={isBusy || !promptDraft.trim()} onClick={() => void handleSubmitPrompt()}>Start new thread</button> : null}
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>Tip: press ⌘/Ctrl + Enter to send</span>
                  </div>
                  {!selectedConversationId && conversations.length === 0 ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ color: "#94a3b8", fontSize: 12 }}>Or start from a preset:</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {onboardingPresets.map((preset) => (
                          <button data-testid={`composer-preset-${toTestIdSegment(preset.title)}`} key={preset.title} style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void handleSubmitSpecificPrompt(preset.prompt)}>{preset.title}</button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)", gap: 16 }}>
              <section style={cardStyle()}>
                <SectionTitle title="Conversation transcript" subtitle="Messages between you and Pinchy in this thread" />
                {!selectedConversationState ? <p style={{ color: "#94a3b8" }}>Select a conversation to inspect the transcript.</p> : <ConversationMessages messages={selectedConversationState.messages} onSaveMemory={handleSaveMessageToMemory} isBusy={isBusy} />}
              </section>

              <div style={{ display: "grid", gap: 16 }}>
                <section style={cardStyle()}>
                  <SectionTitle title="Runs" subtitle="Queue, status, and save-to-memory actions" />
                  {!selectedConversationState ? <p style={{ color: "#94a3b8" }}>Select a conversation to inspect runs.</p> : (
                    <div style={{ display: "grid", gap: 10, maxHeight: 320, overflow: "auto" }}>
                      {visibleRuns.length === 0 ? <p style={{ color: "#94a3b8" }}>No runs yet.</p> : visibleRuns.map((run) => (
                        <ActionRow
                          key={run.id}
                          title={buildRunHeadline(run, 84)}
                          subtitle={`${run.kind} • ${run.id}`}
                          actions={
                            <>
                              <span style={badgeStyle(toneForRunStatus(run.status))}>{run.status}</span>
                              <button data-testid={`run-save-memory-${run.id}`} style={buttonStyle("ghost")} disabled={isBusy || !(run.summary || run.goal)} onClick={() => void handleSaveRunToMemory(run)}>Save memory</button>
                              {run.status === "completed" || run.status === "failed" || run.status === "cancelled" ? null : <button data-testid={`run-cancel-${run.id}`} style={buttonStyle("danger")} disabled={isBusy} onClick={() => void handleRunCancel(run.id)}>Cancel</button>}
                            </>
                          }
                        >
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

                <section style={cardStyle()}>
                  <SectionTitle title="Question inbox" subtitle="Reply when the agent is blocked and waiting" />
                  {!selectedConversationState ? <p style={{ color: "#94a3b8" }}>Select a conversation to review blocked questions.</p> : visibleQuestions.length === 0 ? <p style={{ color: "#94a3b8" }}>No pending or waiting questions for this conversation.</p> : (
                    <div style={{ display: "grid", gap: 10, maxHeight: 320, overflow: "auto" }}>
                      {visibleQuestions.map((question) => (
                        <ActionRow
                          key={question.id}
                          title={question.prompt}
                          subtitle={`priority: ${question.priority} • ${question.id}`}
                          actions={<span style={badgeStyle(toneForQuestionStatus(question.status))}>{question.status}</span>}
                        >
                          <div style={{ color: "#cbd5e1", fontSize: 13, display: "grid", gap: 8 }}>
                            <div>created: {formatTs(question.createdAt)}</div>
                            {question.channelHints?.length ? <div>channels: {question.channelHints.join(", ")}</div> : null}
                            <textarea
                              data-testid={`question-reply-input-${question.id}`}
                              rows={3}
                              value={replyDrafts[question.id] ?? ""}
                              onChange={(event) => setReplyDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                              placeholder="Send a dashboard reply to resume this run"
                              style={inputStyle(true)}
                            />
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
                            <ActionRow
                              key={delivery.id}
                              title={`${delivery.channel} delivery`}
                              subtitle={`question: ${delivery.questionId ?? "—"} • run: ${delivery.runId ?? "—"}`}
                              actions={<span style={badgeStyle(toneForDeliveryStatus(delivery.status))}>{delivery.status}</span>}
                            >
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
          </div>
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
                    actions={workspace.id === state.activeWorkspaceId ? <span style={badgeStyle("#2563eb")}>active</span> : <button data-testid={`workspace-activate-${workspace.id}`} style={buttonStyle("ghost")} disabled={isBusy} onClick={() => void handleWorkspaceActivate(workspace.id)}>Activate</button>}
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
