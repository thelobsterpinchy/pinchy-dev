import test from "node:test";
import assert from "node:assert/strict";
import {
  DAEMON_HEALTH_STATUSES,
  QUESTION_STATUSES,
  MEMORY_KINDS,
  RELOAD_REQUEST_STATUSES,
  RUN_HISTORY_KINDS,
  RUN_HISTORY_STATUSES,
  RUN_KINDS,
  RUN_STATUSES,
  TASK_STATUSES,
  isDaemonHealthStatus,
  isQuestionStatus,
  isReloadRequestStatus,
  isRunHistoryKind,
  isRunHistoryStatus,
  isRunKind,
  isRunStatus,
  isTaskStatus,
  type DashboardState,
} from "../packages/shared/src/contracts.js";

test("shared contracts expose canonical status values and guards", () => {
  assert.deepEqual(TASK_STATUSES, ["pending", "running", "done", "blocked"]);
  assert.deepEqual(RUN_HISTORY_KINDS, ["task", "iteration", "goal", "watch", "reload"]);
  assert.deepEqual(RUN_HISTORY_STATUSES, ["started", "completed", "failed"]);
  assert.deepEqual(DAEMON_HEALTH_STATUSES, ["starting", "idle", "running", "error", "stopped"]);
  assert.deepEqual(MEMORY_KINDS, ["note", "decision", "fact", "summary"]);
  assert.deepEqual(RELOAD_REQUEST_STATUSES, ["pending", "processed"]);
  assert.deepEqual(RUN_KINDS, ["user_prompt", "qa_cycle", "watch_followup", "self_improvement", "resume_reply", "autonomous_goal"]);
  assert.deepEqual(RUN_STATUSES, ["queued", "running", "waiting_for_human", "waiting_for_approval", "completed", "failed", "cancelled"]);
  assert.deepEqual(QUESTION_STATUSES, ["pending_delivery", "waiting_for_human", "answered", "expired", "cancelled"]);

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
});

test("shared contracts provide a reusable dashboard state shape", () => {
  const state: DashboardState = {
    runContext: {
      currentRunId: "run-1",
      currentRunLabel: "task:demo",
      updatedAt: new Date().toISOString(),
    },
    workspaces: [{ id: "workspace-1", name: "pinchy-dev", path: "/repo", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:00.000Z" }],
    activeWorkspaceId: "workspace-1",
    tasks: [{ id: "task-1", title: "Demo", prompt: "Do work", status: "pending", createdAt: "2026-04-20T00:00:00.000Z", updatedAt: "2026-04-20T00:00:00.000Z" }],
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
  assert.equal(state.tasks[0]?.status, "pending");
  assert.equal(state.runHistory[0]?.kind, "goal");
});
