import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailsSidebar } from "../apps/dashboard/src/app/components/DetailsSidebar.js";

test("DetailsSidebar omits the runs section while keeping agent and question details", () => {
  const html = renderToStaticMarkup(
    <DetailsSidebar
      conversationState={{
        conversation: {
          id: "conversation-1",
          title: "Bug thread",
          createdAt: "2026-04-25T00:00:00.000Z",
          updatedAt: "2026-04-25T00:00:00.000Z",
          status: "active",
        },
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            role: "agent",
            content: "Investigating now.",
            createdAt: "2026-04-25T00:00:01.000Z",
            runId: "run-1",
          },
        ],
        runs: [
          {
            id: "run-1",
            conversationId: "conversation-1",
            goal: "Investigate the bug",
            kind: "user_prompt",
            status: "running",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:01.000Z",
          },
        ],
        questions: [
          {
            id: "question-1",
            conversationId: "conversation-1",
            runId: "run-1",
            prompt: "Can I restart the worker?",
            status: "waiting_for_human",
            priority: "high",
            createdAt: "2026-04-25T00:00:02.000Z",
          },
        ],
        replies: [],
        deliveries: [],
        runActivities: [],
      }}
      tasks={[
        {
          id: "task-1",
          title: "Inspect worker logs",
          prompt: "Inspect worker logs",
          status: "running",
          conversationId: "conversation-1",
          runId: "run-1",
          createdAt: "2026-04-25T00:00:00.000Z",
          updatedAt: "2026-04-25T00:00:03.000Z",
          execution: {
            queueState: "linked_run",
            linkedRunStatus: "running",
            workerStatus: "running",
            workerPid: 58919,
            piSessionPath: "/tmp/pi-session-1.json",
          },
        },
      ]}
      selectedTaskId={undefined}
      onSelectTask={() => {}}
      isOpen={true}
      onToggle={() => {}}
    />,
  );

  assert.match(html, />Agents</);
  assert.match(html, />Questions</);
  assert.match(html, /Worker PID 58919/);
  assert.match(html, /Run: running/);
  assert.match(html, /Pi session attached/);
  assert.doesNotMatch(html, />Runs</);
  assert.doesNotMatch(html, /Total Runs/);
  assert.doesNotMatch(html, /Active Runs/);
});
