import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TasksPageContent } from "../apps/dashboard/src/app/components/TasksPage.js";

test("TasksPageContent labels linked queued runs as scheduled instead of actively running", () => {
  const html = renderToStaticMarkup(
    <TasksPageContent
      onToggleLeftSidebar={() => {}}
      isLeftSidebarOpen={true}
      tasks={[
        {
          id: "task-queued",
          title: "Inspect worker logs",
          prompt: "Inspect worker logs and report progress.",
          status: "running",
          createdAt: "",
          updatedAt: "",
          conversationId: "conversation-1",
          execution: {
            queueState: "linked_run",
            linkedRunStatus: "queued",
          },
        },
      ]}
      conversations={[]}
      agentGuidances={[]}
      onQueueTask={async () => {}}
      onDeleteTask={async () => {}}
      onClearCompletedTasks={async () => {}}
      onReprioritizeTask={async () => {}}
      selectedTask={undefined}
      selectedConversation={undefined}
      selectedConversationState={undefined}
      onSelectTask={() => {}}
      onSubmitAgentGuidance={async () => {}}
      onSteerAgentRun={async () => {}}
    />,
  );

  assert.match(html, /scheduled/i);
  assert.match(html, /run queued/);
  assert.doesNotMatch(html, /run running/);
});

test("TasksPageContent exposes an inspect-progress action for worker tasks", () => {
  const html = renderToStaticMarkup(
    <TasksPageContent
      onToggleLeftSidebar={() => {}}
      isLeftSidebarOpen={true}
      tasks={[
        {
          id: "task-1",
          title: "Inspect worker logs",
          prompt: "Inspect worker logs and report progress.",
          status: "running",
          createdAt: "",
          updatedAt: "",
          conversationId: "conversation-1",
          execution: {
            queueState: "linked_run",
            linkedRunStatus: "running",
          },
        },
      ]}
      conversations={[]}
      agentGuidances={[]}
      onQueueTask={async () => {}}
      onDeleteTask={async () => {}}
      onClearCompletedTasks={async () => {}}
      onReprioritizeTask={async () => {}}
      selectedTask={undefined}
      selectedConversation={undefined}
      selectedConversationState={undefined}
      onSelectTask={() => {}}
      onSubmitAgentGuidance={async () => {}}
      onSteerAgentRun={async () => {}}
    />,
  );

  assert.match(html, /task-inspect-task-1/);
  assert.match(html, /Inspect progress/);
  assert.match(html, /run running/);
});

test("TasksPageContent renders the task detail panel when a task is selected", () => {
  const html = renderToStaticMarkup(
    <TasksPageContent
      onToggleLeftSidebar={() => {}}
      isLeftSidebarOpen={true}
      tasks={[]}
      conversations={[
        { id: "conversation-1", title: "Worker thread", createdAt: "", updatedAt: "", status: "active" },
      ]}
      agentGuidances={[]}
      onQueueTask={async () => {}}
      onDeleteTask={async () => {}}
      onClearCompletedTasks={async () => {}}
      onReprioritizeTask={async () => {}}
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
        },
      }}
      selectedConversation={{ id: "conversation-1", title: "Worker thread", createdAt: "", updatedAt: "", status: "active" }}
      selectedConversationState={{
        conversation: { id: "conversation-1", title: "Worker thread", createdAt: "", updatedAt: "", status: "active" },
        messages: [
          { id: "message-1", conversationId: "conversation-1", role: "agent", content: "Inspecting logs now.", createdAt: "2026-04-25T00:00:00.000Z", runId: "run-1" },
        ],
        runs: [],
        questions: [],
        replies: [],
        runActivities: [],
      }}
      onSelectTask={() => {}}
      onSubmitAgentGuidance={async () => {}}
      onSteerAgentRun={async () => {}}
    />,
  );

  assert.match(html, /task-progress-back-button/);
  assert.match(html, /Inspecting logs now\./);
  assert.match(html, /Steer run/);
});
