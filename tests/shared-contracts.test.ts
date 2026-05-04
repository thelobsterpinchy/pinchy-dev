import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_GUIDANCE_STATUSES,
  AGENT_RUN_STATUSES,
  DAEMON_HEALTH_STATUSES,
  ORCHESTRATION_EVENT_TYPES,
  QUESTION_STATUSES,
  MEMORY_KINDS,
  RELOAD_REQUEST_STATUSES,
  RUN_HISTORY_KINDS,
  RUN_HISTORY_STATUSES,
  RUN_KINDS,
  RUN_STATUSES,
  TASK_STATUSES,
  isAgentGuidanceStatus,
  isAgentRunStatus,
  isDaemonHealthStatus,
  isOrchestrationEventType,
  isQuestionStatus,
  isReloadRequestStatus,
  isRunHistoryKind,
  isRunHistoryStatus,
  isRunKind,
  isRunStatus,
  isTaskStatus,
  type AgentRun,
  type DashboardState,
  type OrchestrationEvent,
  type OrchestrationTask,
} from "../packages/shared/src/contracts.js";

test("shared contracts expose canonical status values and guards", () => {
  assert.deepEqual(TASK_STATUSES, ["pending", "running", "done", "blocked"]);
  assert.deepEqual(RUN_HISTORY_KINDS, ["task", "iteration", "goal", "watch", "reload"]);
  assert.deepEqual(RUN_HISTORY_STATUSES, ["started", "completed", "failed"]);
  assert.deepEqual(DAEMON_HEALTH_STATUSES, ["starting", "idle", "running", "error", "stopped"]);
  assert.deepEqual(MEMORY_KINDS, ["note", "decision", "fact", "summary"]);
  assert.deepEqual(RELOAD_REQUEST_STATUSES, ["pending", "processed"]);
  assert.deepEqual(RUN_KINDS, ["user_prompt", "qa_cycle", "watch_followup", "self_improvement", "resume_reply", "autonomous_goal", "queued_task"]);
  assert.deepEqual(RUN_STATUSES, ["queued", "planning", "running", "waiting_for_human", "waiting_for_approval", "cancelling", "completed", "failed", "cancelled"]);
  assert.deepEqual(QUESTION_STATUSES, ["pending_delivery", "waiting_for_human", "answered", "expired", "cancelled"]);
  assert.deepEqual(AGENT_GUIDANCE_STATUSES, ["pending", "applied", "cancelled"]);
  assert.deepEqual(AGENT_RUN_STATUSES, ["queued", "starting", "running", "blocked", "cancelling", "completed", "failed", "cancelled"]);
  assert.deepEqual(ORCHESTRATION_EVENT_TYPES, ["RunCreated", "RunPlanned", "TaskReady", "AgentSpawnRequested", "AgentStarted", "AgentProgressReported", "AgentBlockedWithQuestion", "HumanReplyReceived", "GuidanceQueued", "AgentCompleted", "AgentFailed", "TaskCompleted", "RunReadyForSynthesis", "RunSummarized", "CancellationRequested", "RunCancelled"]);

  assert.equal(isTaskStatus("pending"), true);
  assert.equal(isTaskStatus("unknown"), false);
  assert.equal(isRunHistoryKind("goal"), true);
  assert.equal(isRunHistoryKind("conversation"), false);
  assert.equal(isRunHistoryStatus("completed"), true);
  assert.equal(isRunHistoryStatus("queued"), false);
  assert.equal(isDaemonHealthStatus("idle"), true);
  assert.equal(isDaemonHealthStatus("paused"), false);
  assert.equal(isReloadRequestStatus("processed"), true);
  assert.equal(isReloadRequestStatus("failed"), false);
  assert.equal(isRunKind("qa_cycle"), true);
  assert.equal(isRunKind("batch_job"), false);
  assert.equal(isRunStatus("waiting_for_human"), true);
  assert.equal(isRunStatus("paused"), false);
  assert.equal(isQuestionStatus("answered"), true);
  assert.equal(isQuestionStatus("open"), false);
  assert.equal(isAgentGuidanceStatus("applied"), true);
  assert.equal(isAgentGuidanceStatus("done"), false);
  assert.equal(isAgentRunStatus("blocked"), true);
  assert.equal(isAgentRunStatus("paused"), false);
  assert.equal(isOrchestrationEventType("AgentCompleted"), true);
  assert.equal(isOrchestrationEventType("AgentPaused"), false);
});

test("shared contracts provide orchestration-core entity shapes", () => {
  const task: OrchestrationTask = {
    id: "task-1",
    parentRunId: "run-1",
    title: "Patch queue wakeups",
    prompt: "Implement a minimal wakeup flow",
    status: "ready",
    dependsOnTaskIds: [],
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };
  const agentRun: AgentRun = {
    id: "agent-run-1",
    parentRunId: "run-1",
    conversationId: "conversation-1",
    taskId: task.id,
    backend: "pi",
    backendRunRef: "pi-session-1",
    status: "running",
    goal: task.prompt,
    modelProfile: "coding-default",
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
  };
  const event: OrchestrationEvent = {
    type: "AgentStarted",
    runId: "run-1",
    taskId: task.id,
    agentRunId: agentRun.id,
    backendRunRef: agentRun.backendRunRef,
    at: "2026-04-20T00:00:00.000Z",
  };

  assert.equal(task.status, "ready");
  assert.equal(agentRun.status, "running");
  assert.equal(event.type, "AgentStarted");
});

test("shared contracts provide a reusable dashboard state shape", () => {
  const state: DashboardState = {
    conversationSessions: [{ conversationId: "conversation-1", sessionPath: "/tmp/pi-thread-session.json", sourceRunId: "run-1", updatedAt: "2026-04-20T00:00:01.000Z" }],
    runActivities: [{ id: "activity-1", conversationId: "conversation-1", runId: "run-1", kind: "tool", status: "completed", label: "Tool: read", toolName: "read", details: ["path: README.md"], createdAt: "2026-04-20T00:00:00.000Z" }],
    runContext: {
      currentRunId: "run-1",
      currentRunLabel: "task:demo",
      updatedAt: new Date().toISOString(),
    },
    workspaces: [{ id: "workspace-1", name: "pinchy-dev", path: "/repo", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:00.000Z" }],
    activeWorkspaceId: "workspace-1",
    tasks: [{ id: "task-1", title: "Demo", prompt: "Do work", status: "pending", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:00.000Z" }],
    agentGuidances: [{ id: "guidance-1", conversationId: "conversation-1", taskId: "task-1", runId: "run-1", content: "Focus on tests first", status: "pending", createdAt: "2026-04-20T00:00:00.000Z" }],
    approvals: [{ id: "approval-1", toolName: "desktop_click", reason: "Need approval", status: "pending", payload: {} }],
    generatedTools: ["demo-tool"],
    agentResources: [{ type: "skill", name: "tdd-implementation", scope: "workspace", path: "/repo/.pi/skills/tdd-implementation/SKILL.md" }],
    routines: [{ name: "demo-routine", steps: [] }],
    artifacts: [{ name: "artifact.png", size: 123, mtimeMs: 456, toolName: "browser_debug_scan", note: "demo", tags: ["qa"] }],
    memories: [{ id: "memory-1", title: "Decision", content: "Pinchy wraps Pi", kind: "decision", tags: ["architecture"], pinned: true, createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:00.000Z" }],
    policy: { scopes: { browser: true } },
    goals: { goals: ["demo"] },
    watch: { watch: ["apps"] },
    auditTail: "{}",
    daemonHealth: {
      pid: 123,
      status: "idle",
      startedAt: "2026-04-20T00:00:00.000Z",
      heartbeatAt: "2026-04-20T00:00:01.000Z",
    },
    runHistory: [{ id: "history-1", kind: "goal", label: "goal:1", status: "started", ts: "2026-04-20T00:00:00.000Z" }],
    pendingReloadRequests: [{ id: "reload-1", status: "pending", requestedAt: "2026-04-20T00:00:00.000Z" }],
  };

  assert.equal(state.activeWorkspaceId, "workspace-1");
  assert.equal(state.conversationSessions[0]?.conversationId, "conversation-1");
  assert.equal(state.tasks[0]?.status, "pending");
  assert.equal(state.runHistory[0]?.kind, "goal");
});
