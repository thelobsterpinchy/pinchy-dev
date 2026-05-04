export const TASK_STATUSES = ["pending", "running", "done", "blocked"] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const RUN_HISTORY_KINDS = ["task", "iteration", "goal", "watch", "reload"] as const;
export type RunHistoryKind = typeof RUN_HISTORY_KINDS[number];

export const RUN_HISTORY_STATUSES = ["started", "completed", "failed"] as const;
export type RunHistoryStatus = typeof RUN_HISTORY_STATUSES[number];

export const DAEMON_HEALTH_STATUSES = ["starting", "idle", "running", "error", "stopped"] as const;
export type DaemonHealthStatus = typeof DAEMON_HEALTH_STATUSES[number];

export const RELOAD_REQUEST_STATUSES = ["pending", "processed"] as const;
export type ReloadRequestStatus = typeof RELOAD_REQUEST_STATUSES[number];

export const RUN_KINDS = ["user_prompt", "qa_cycle", "watch_followup", "self_improvement", "resume_reply", "autonomous_goal", "queued_task"] as const;
export type RunKind = typeof RUN_KINDS[number];

export const RUN_STATUSES = ["queued", "planning", "running", "waiting_for_human", "waiting_for_approval", "cancelling", "completed", "failed", "cancelled"] as const;
export type RunStatus = typeof RUN_STATUSES[number];

export const QUESTION_STATUSES = ["pending_delivery", "waiting_for_human", "answered", "expired", "cancelled"] as const;
export type QuestionStatus = typeof QUESTION_STATUSES[number];

export const AGENT_GUIDANCE_STATUSES = ["pending", "applied", "cancelled"] as const;
export type AgentGuidanceStatus = typeof AGENT_GUIDANCE_STATUSES[number];

export const AGENT_RUN_STATUSES = ["queued", "starting", "running", "blocked", "cancelling", "completed", "failed", "cancelled"] as const;
export type AgentRunStatus = typeof AGENT_RUN_STATUSES[number];

export const ORCHESTRATION_EVENT_TYPES = ["RunCreated", "RunPlanned", "TaskReady", "AgentSpawnRequested", "AgentStarted", "AgentProgressReported", "AgentBlockedWithQuestion", "HumanReplyReceived", "GuidanceQueued", "AgentCompleted", "AgentFailed", "TaskCompleted", "RunReadyForSynthesis", "RunSummarized", "CancellationRequested", "RunCancelled"] as const;
export type OrchestrationEventType = typeof ORCHESTRATION_EVENT_TYPES[number];

function includesValue<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

export function isTaskStatus(value: string): value is TaskStatus {
  return includesValue(TASK_STATUSES, value);
}

export function isRunHistoryKind(value: string): value is RunHistoryKind {
  return includesValue(RUN_HISTORY_KINDS, value);
}

export function isRunHistoryStatus(value: string): value is RunHistoryStatus {
  return includesValue(RUN_HISTORY_STATUSES, value);
}

export function isDaemonHealthStatus(value: string): value is DaemonHealthStatus {
  return includesValue(DAEMON_HEALTH_STATUSES, value);
}

export function isReloadRequestStatus(value: string): value is ReloadRequestStatus {
  return includesValue(RELOAD_REQUEST_STATUSES, value);
}

export function isRunKind(value: string): value is RunKind {
  return includesValue(RUN_KINDS, value);
}

export function isRunStatus(value: string): value is RunStatus {
  return includesValue(RUN_STATUSES, value);
}

export function isQuestionStatus(value: string): value is QuestionStatus {
  return includesValue(QUESTION_STATUSES, value);
}

export function isAgentGuidanceStatus(value: string): value is AgentGuidanceStatus {
  return includesValue(AGENT_GUIDANCE_STATUSES, value);
}

export function isAgentRunStatus(value: string): value is AgentRunStatus {
  return includesValue(AGENT_RUN_STATUSES, value);
}

export function isOrchestrationEventType(value: string): value is OrchestrationEventType {
  return includesValue(ORCHESTRATION_EVENT_TYPES, value);
}

export function isMemoryKind(value: string): value is MemoryKind {
  return includesValue(MEMORY_KINDS, value);
}

export type RunContext = {
  currentRunId: string;
  currentRunLabel: string;
  currentConversationId?: string;
  updatedAt: string;
};

export type WorkspaceEntry = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type PinchyTaskExecution = {
  queueState: "waiting_for_dependencies" | "ready" | "linked_run";
  blockedByTaskIds?: string[];
  blockedByTaskTitles?: string[];
  linkedRunStatus?: RunStatus;
  sessionPath?: string;
  conversationSessionPath?: string;
  workerPid?: number;
  workerStatus?: "running" | "stopped";
};

export type PinchyTask = {
  id: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  source?: "user" | "agent" | "daemon" | "qa" | "watcher" | "routine";
  conversationId?: string;
  runId?: string;
  executionRunId?: string;
  dependsOnTaskIds?: string[];
  execution?: PinchyTaskExecution;
};

export type ApprovalRecord = {
  id: string;
  ts?: string;
  status: "pending" | "approved" | "denied";
  toolName: string;
  reason: string;
  payload: Record<string, unknown>;
  runId?: string;
};

export type RoutineRecord = {
  name: string;
  steps: Array<unknown>;
};

export type DashboardArtifact = {
  name: string;
  size: number;
  mtimeMs: number;
  note?: string;
  toolName?: string;
  tags?: string[];
};

export type ApprovalPolicy = {
  scopes?: Record<string, boolean>;
};

export type DaemonHealth = {
  pid: number;
  status: DaemonHealthStatus;
  startedAt: string;
  heartbeatAt: string;
  currentActivity?: string;
  lastCompletedAt?: string;
  lastError?: string;
};

export type RunHistoryEntry = {
  id: string;
  kind: RunHistoryKind;
  label: string;
  status: RunHistoryStatus;
  ts: string;
  details?: string;
};

export type ReloadRequest = {
  id: string;
  toolName?: string;
  requestedAt: string;
  status: ReloadRequestStatus;
};

export const MEMORY_KINDS = ["note", "decision", "fact", "summary"] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];

export type SavedMemory = {
  id: string;
  title: string;
  content: string;
  kind: MemoryKind;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  sourceConversationId?: string;
  sourceRunId?: string;
};

export type AgentResourceType = "extension" | "skill" | "prompt";
export type AgentResourceScope = "workspace" | "user";

export type AgentResourceEntry = {
  type: AgentResourceType;
  name: string;
  scope: AgentResourceScope;
  path: string;
};

export type AgentGuidance = {
  id: string;
  conversationId: string;
  taskId: string;
  runId?: string;
  content: string;
  status: AgentGuidanceStatus;
  createdAt: string;
  appliedAt?: string;
};

export type ConversationSessionBinding = {
  conversationId: string;
  sessionPath: string;
  sourceRunId?: string;
  runtimeConfigSignature?: string;
  updatedAt: string;
};

export type RunActivityKind = "tool";
export type RunActivityStatus = "completed" | "failed";

export type RunActivity = {
  id: string;
  conversationId: string;
  runId: string;
  kind: RunActivityKind;
  status: RunActivityStatus;
  label: string;
  toolName?: string;
  details: string[];
  createdAt: string;
};

export type DashboardState = {
  conversationSessions: ConversationSessionBinding[];
  runActivities: RunActivity[];
  runContext?: RunContext;
  workspaces: WorkspaceEntry[];
  activeWorkspaceId?: string;
  tasks: PinchyTask[];
  agentGuidances: AgentGuidance[];
  approvals: ApprovalRecord[];
  generatedTools: string[];
  agentResources: AgentResourceEntry[];
  routines: RoutineRecord[];
  artifacts: DashboardArtifact[];
  memories: SavedMemory[];
  policy: ApprovalPolicy;
  goals: unknown;
  watch: unknown;
  auditTail: string;
  daemonHealth?: DaemonHealth;
  runHistory: RunHistoryEntry[];
  pendingReloadRequests: ReloadRequest[];
};

export type ConversationStatus = "active" | "archived";
export type MessageRole = "user" | "agent" | "system";
export type MessageKind = "default" | "orchestration_update" | "orchestration_final";
export type QuestionPriority = "low" | "normal" | "high" | "urgent";
export type ApprovalStatus = ApprovalRecord["status"];
export type NotificationChannel = "discord" | "imessage" | "pinchy-app" | "dashboard";
export type NotificationDeliveryStatus = "pending" | "sent" | "delivered" | "failed";

export type ConversationAttentionStatus = "needs_reply" | "needs_approval" | "working" | "idle";

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: ConversationStatus;
  latestRunId?: string;
  hasActiveRun?: boolean;
  pendingQuestionCount?: number;
  attentionStatus?: ConversationAttentionStatus;
};

export type ConversationState = {
  conversation: Conversation;
  messages: Message[];
  runs: Run[];
  questions: Question[];
  replies: HumanReply[];
  deliveries: NotificationDelivery[];
  runActivities: RunActivity[];
  sessionBinding?: ConversationSessionBinding;
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  runId?: string;
  kind?: MessageKind;
};

export type Run = {
  id: string;
  conversationId: string;
  goal: string;
  kind: RunKind;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  blockedReason?: string;
  summary?: string;
  sessionPath?: string;
  runtimeConfigSignature?: string;
};

export type OrchestrationTaskStatus = "pending" | "ready" | "running" | "blocked" | "done" | "failed" | "cancelled";

export type OrchestrationTask = {
  id: string;
  parentRunId: string;
  title: string;
  prompt: string;
  status: OrchestrationTaskStatus;
  dependsOnTaskIds: string[];
  assignedAgentRunId?: string;
  outputSummary?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentRun = {
  id: string;
  parentRunId: string;
  conversationId: string;
  taskId: string;
  backend: "pi" | "native" | string;
  backendRunRef: string;
  status: AgentRunStatus;
  goal: string;
  modelProfile: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastProgressAt?: string;
  resultSummary?: string;
  failureReason?: string;
};

export type ProgressUpdate = {
  id: string;
  parentRunId: string;
  agentRunId?: string;
  taskId?: string;
  status: "info" | "milestone" | "warning" | "error";
  message: string;
  percentHint?: number;
  createdAt: string;
};

export type Question = {
  id: string;
  runId: string;
  conversationId: string;
  prompt: string;
  status: QuestionStatus;
  priority: QuestionPriority;
  createdAt: string;
  resolvedAt?: string;
  channelHints?: NotificationChannel[];
  agentRunId?: string;
  taskId?: string;
};

export type OrchestrationEvent =
  | { type: "RunCreated"; runId: string; conversationId: string; at: string }
  | { type: "RunPlanned"; runId: string; taskIds: string[]; at: string }
  | { type: "TaskReady"; runId: string; taskId: string; at: string }
  | { type: "AgentSpawnRequested"; runId: string; taskId: string; backend: string; at: string }
  | { type: "AgentStarted"; runId: string; taskId: string; agentRunId: string; backendRunRef: string; at: string }
  | { type: "AgentProgressReported"; runId: string; taskId: string; agentRunId: string; message: string; at: string }
  | { type: "AgentBlockedWithQuestion"; runId: string; taskId: string; agentRunId: string; questionId: string; at: string }
  | { type: "HumanReplyReceived"; runId: string; questionId: string; replyId: string; at: string }
  | { type: "GuidanceQueued"; runId: string; agentRunId: string; guidanceId: string; at: string }
  | { type: "AgentCompleted"; runId: string; taskId: string; agentRunId: string; at: string }
  | { type: "AgentFailed"; runId: string; taskId: string; agentRunId: string; reason: string; at: string }
  | { type: "TaskCompleted"; runId: string; taskId: string; at: string }
  | { type: "RunReadyForSynthesis"; runId: string; at: string }
  | { type: "RunSummarized"; runId: string; at: string }
  | { type: "CancellationRequested"; runId: string; at: string }
  | { type: "RunCancelled"; runId: string; at: string };

export type HumanReply = {
  id: string;
  questionId: string;
  conversationId: string;
  channel: NotificationChannel;
  content: string;
  receivedAt: string;
  rawPayload?: unknown;
};

export type ArtifactRecord = {
  id: string;
  path: string;
  kind: string;
  createdAt: string;
  runId?: string;
  conversationId?: string;
  toolName?: string;
  note?: string;
  tags: string[];
};

export type NotificationDelivery = {
  id: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  questionId?: string;
  runId?: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  externalId?: string;
  error?: string;
};
