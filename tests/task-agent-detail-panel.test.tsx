import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskAgentDetailPanel } from "../apps/dashboard/src/app/components/TaskAgentDetailPanel.js";

test("TaskAgentDetailPanel shows transcript, diagnostics, and live steering controls when a linked run exists", () => {
  const html = renderToStaticMarkup(
    <TaskAgentDetailPanel
      conversationState={{
        conversation: { id: "conversation-1", title: "Worker thread", createdAt: "", updatedAt: "", status: "active" },
        messages: [
          { id: "message-1", conversationId: "conversation-1", role: "agent", content: "Inspecting logs now.", createdAt: "2026-04-25T00:00:00.000Z", runId: "run-1" },
          { id: "message-2", conversationId: "conversation-1", role: "user", content: "Focus on the worker.", createdAt: "2026-04-25T00:00:01.000Z", runId: "run-1" },
        ],
        runs: [],
        questions: [],
        replies: [],
        runActivities: [],
      }}
      selectedConversation={{ id: "conversation-1", title: "Worker thread", createdAt: "", updatedAt: "", status: "active" }}
      selectedTask={{
        id: "task-1",
        title: "Inspect worker logs",
        prompt: "Inspect worker logs and report progress.",
        status: "running",
        createdAt: "",
        updatedAt: "",
        conversationId: "conversation-1",
        runId: "run-1",
        execution: {
          queueState: "linked_run",
          linkedRunStatus: "running",
          workerStatus: "running",
          workerPid: 4242,
        },
      }}
      agentGuidances={[]}
      onBack={() => {}}
      onSubmitAgentGuidance={async () => {}}
      onSteerAgentRun={async () => {}}
      backLabel="Back to Tasks"
    />,
  );

  assert.match(html, /Inspect worker logs/);
  assert.match(html, /Inspecting logs now\./);
  assert.match(html, /Execution diagnostics/);
  assert.match(html, /Worker PID/);
  assert.match(html, /task-progress-steer-panel/);
  assert.match(html, /task-progress-steer-input/);
  assert.match(html, /Steer run/);
  assert.match(html, /task-progress-guidance-input/);
});

test("TaskAgentDetailPanel explains when no live linked run exists yet", () => {
  const html = renderToStaticMarkup(
    <TaskAgentDetailPanel
      conversationState={{
        conversation: { id: "conversation-1", title: "Worker thread", createdAt: "", updatedAt: "", status: "active" },
        messages: [],
        runs: [],
        questions: [],
        replies: [],
        runActivities: [],
      }}
      selectedConversation={{ id: "conversation-1", title: "Worker thread", createdAt: "", updatedAt: "", status: "active" }}
      selectedTask={{
        id: "task-1",
        title: "Inspect worker logs",
        prompt: "Inspect worker logs and report progress.",
        status: "pending",
        createdAt: "",
        updatedAt: "",
        conversationId: "conversation-1",
        execution: {
          queueState: "ready",
        },
      }}
      agentGuidances={[]}
      onBack={() => {}}
      onSubmitAgentGuidance={async () => {}}
      onSteerAgentRun={async () => {}}
      backLabel="Back to Tasks"
    />,
  );

  assert.match(html, /task-progress-no-live-run/);
  assert.match(html, /has not been assigned a live run yet/i);
  assert.doesNotMatch(html, /task-progress-steer-panel/);
});
