import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatView, scrollTranscriptViewportToBottom } from "../apps/dashboard/src/app/components/ChatView.js";

test("ChatView shows the thinking stage instead of the empty onboarding state while a new run is active", () => {
  const html = renderToStaticMarkup(
    <ChatView
      conversationState={{
        conversation: { id: "conversation-1", title: "Thinking", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z", status: "active" },
        messages: [],
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
        questions: [],
        replies: [],
        runActivities: [
          {
            id: "activity-1",
            conversationId: "conversation-1",
            runId: "run-1",
            kind: "tool",
            status: "completed",
            label: "Tool: read",
            details: ["path: README.md"],
            createdAt: "2026-04-25T00:00:02.000Z",
          },
        ],
      }}
      selectedConversation={{ id: "conversation-1", title: "Thinking", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z", status: "active" }}
      onSendMessage={async () => {}}
      isLoading={false}
      onToggleLeftSidebar={() => {}}
      onToggleRightSidebar={() => {}}
      isLeftSidebarOpen={true}
      isRightSidebarOpen={true}
    />,
  );

  assert.match(html, /Pinchy is thinking/);
  assert.doesNotMatch(html, /How can Pinchy help\?/);
});

test("ChatView labels the thinking stage with Pinchy's name", () => {
  const html = renderToStaticMarkup(
    <ChatView
      conversationState={{
        conversation: { id: "conversation-1", title: "Thinking", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z", status: "active" },
        messages: [],
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
        questions: [],
        replies: [],
        runActivities: [
          {
            id: "activity-1",
            conversationId: "conversation-1",
            runId: "run-1",
            kind: "tool",
            status: "completed",
            label: "Tool: read",
            details: ["path: README.md"],
            createdAt: "2026-04-25T00:00:02.000Z",
          },
        ],
      }}
      selectedConversation={{ id: "conversation-1", title: "Thinking", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z", status: "active" }}
      onSendMessage={async () => {}}
      isLoading={false}
      onToggleLeftSidebar={() => {}}
      onToggleRightSidebar={() => {}}
      isLeftSidebarOpen={true}
      isRightSidebarOpen={true}
    />,
  );

  assert.match(html, /Pinchy is thinking/);
});

test("ChatView only shows the final completed agent reply in the chat transcript", () => {
  const html = renderToStaticMarkup(
    <ChatView
      conversationState={{
        conversation: { id: "conversation-1", title: "Bug repro", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" },
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            role: "user",
            content: "Please fix the label.",
            createdAt: "2026-04-25T00:00:00.000Z",
          },
          {
            id: "message-2",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            content: "I am checking the sidebar labels.",
            createdAt: "2026-04-25T00:00:01.000Z",
          },
          {
            id: "message-3",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            content: "I fixed the label.",
            createdAt: "2026-04-25T00:00:02.000Z",
          },
        ],
        runs: [
          {
            id: "run-1",
            conversationId: "conversation-1",
            goal: "Fix the label",
            kind: "user_prompt",
            status: "completed",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:03.000Z",
          },
        ],
        questions: [],
        replies: [],
        runActivities: [],
      }}
      selectedConversation={{ id: "conversation-1", title: "Bug repro", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" }}
      onSendMessage={async () => {}}
      isLoading={false}
      onToggleLeftSidebar={() => {}}
      onToggleRightSidebar={() => {}}
      isLeftSidebarOpen={true}
      isRightSidebarOpen={true}
    />,
  );

  assert.match(html, /Please fix the label\./);
  assert.match(html, /I fixed the label\./);
  assert.doesNotMatch(html, /I am checking the sidebar labels\./);
  assert.match(html, />Pinchy</);
  assert.doesNotMatch(html, />run</);
});

test("ChatView hides standalone orchestration artifacts from the main chat transcript", () => {
  const html = renderToStaticMarkup(
    <ChatView
      conversationState={{
        conversation: { id: "conversation-1", title: "No synthesis in main chat", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" },
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            role: "user",
            content: "What happened?",
            createdAt: "2026-04-25T00:00:00.000Z",
          },
          {
            id: "message-2",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            kind: "orchestration_update",
            content: "The delegated agent finished a bounded task.",
            createdAt: "2026-04-25T00:00:01.000Z",
          },
          {
            id: "message-3",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            kind: "orchestration_final",
            content: "Final synthesis summary: delegated work for this thread is complete.",
            createdAt: "2026-04-25T00:00:02.000Z",
          },
        ],
        runs: [
          {
            id: "run-1",
            conversationId: "conversation-1",
            goal: "Summarize the task",
            kind: "user_prompt",
            status: "completed",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:02.000Z",
          },
        ],
        questions: [],
        replies: [],
        runActivities: [],
      }}
      selectedConversation={{ id: "conversation-1", title: "No synthesis in main chat", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" }}
      onSendMessage={async () => {}}
      isLoading={false}
      onToggleLeftSidebar={() => {}}
      onToggleRightSidebar={() => {}}
      isLeftSidebarOpen={true}
      isRightSidebarOpen={true}
    />,
  );

  assert.match(html, /What happened\?/);
  assert.doesNotMatch(html, /The delegated agent finished a bounded task\./);
  assert.doesNotMatch(html, /Final synthesis summary: delegated work for this thread is complete\./);
  assert.doesNotMatch(html, /Pinchy plan/);
  assert.doesNotMatch(html, /Pinchy synthesis/);
});

test("ChatView prefers the plain human-facing reply over later synthesis artifacts on the same run", () => {
  const html = renderToStaticMarkup(
    <ChatView
      conversationState={{
        conversation: { id: "conversation-1", title: "Human reply first", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" },
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            role: "user",
            content: "Did you fix it?",
            createdAt: "2026-04-25T00:00:00.000Z",
          },
          {
            id: "message-2",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            kind: "default",
            content: "I fixed it — the scroll now lands at the bottom.",
            createdAt: "2026-04-25T00:00:02.000Z",
          },
          {
            id: "message-3",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            kind: "orchestration_final",
            content: "Final synthesis summary: delegated work for this thread is complete.",
            createdAt: "2026-04-25T00:00:03.000Z",
          },
        ],
        runs: [
          {
            id: "run-1",
            conversationId: "conversation-1",
            goal: "Fix the relay",
            kind: "user_prompt",
            status: "completed",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:03.000Z",
          },
        ],
        questions: [],
        replies: [],
        runActivities: [],
      }}
      selectedConversation={{ id: "conversation-1", title: "Human reply first", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" }}
      onSendMessage={async () => {}}
      isLoading={false}
      onToggleLeftSidebar={() => {}}
      onToggleRightSidebar={() => {}}
      isLeftSidebarOpen={true}
      isRightSidebarOpen={true}
    />,
  );

  assert.match(html, /I fixed it — the scroll now lands at the bottom\./);
  assert.doesNotMatch(html, /Final synthesis summary: delegated work for this thread is complete\./);
});

test("ChatView keeps completed run chatter in the thinking path and only shows the later plain parent-thread answer", () => {
  const html = renderToStaticMarkup(
    <ChatView
      conversationState={{
        conversation: { id: "conversation-1", title: "Wake-up relay", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" },
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            role: "user",
            content: "Can you fix the relay?",
            createdAt: "2026-04-25T00:00:00.000Z",
          },
          {
            id: "message-2",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            content: "Yes — I’ll treat this as a dependency-chained fix.",
            createdAt: "2026-04-25T00:00:01.000Z",
          },
          {
            id: "message-3",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            content: "Good — the wake-up behavior is now implemented in the worker path.",
            createdAt: "2026-04-25T00:00:02.000Z",
          },
          {
            id: "message-4",
            conversationId: "conversation-1",
            role: "agent",
            content: "Yes — I fixed that.",
            createdAt: "2026-04-25T00:00:03.000Z",
          },
        ],
        runs: [
          {
            id: "run-1",
            conversationId: "conversation-1",
            goal: "Fix the relay",
            kind: "user_prompt",
            status: "completed",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:03.000Z",
          },
        ],
        questions: [],
        replies: [],
        runActivities: [],
      }}
      selectedConversation={{ id: "conversation-1", title: "Wake-up relay", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" }}
      onSendMessage={async () => {}}
      isLoading={false}
      onToggleLeftSidebar={() => {}}
      onToggleRightSidebar={() => {}}
      isLeftSidebarOpen={true}
      isRightSidebarOpen={true}
    />,
  );

  assert.match(html, /Can you fix the relay\?/);
  assert.match(html, /Yes — I fixed that\./);
  assert.doesNotMatch(html, /Yes — I’ll treat this as a dependency-chained fix\./);
  assert.doesNotMatch(html, /Good — the wake-up behavior is now implemented in the worker path\./);
});

test("scrollTranscriptViewportToBottom retries on the next animation frame for late layout sizing", () => {
  const viewport = { scrollTop: 0, scrollHeight: 120 } as { scrollTop: number; scrollHeight: number };
  const scheduled: Array<() => void> = [];
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    scheduled.push(() => callback(16));
    return scheduled.length;
  }) as typeof globalThis.requestAnimationFrame;

  try {
    scrollTranscriptViewportToBottom(viewport as never);
    assert.equal(viewport.scrollTop, 120);

    viewport.scrollHeight = 360;
    const nextFrame = scheduled.shift();
    assert.ok(nextFrame);
    nextFrame?.();

    assert.equal(viewport.scrollTop, 360);
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("ChatView renders visible messages with markdown formatting", () => {
  const html = renderToStaticMarkup(
    <ChatView
      conversationState={{
        conversation: { id: "conversation-1", title: "Markdown", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" },
        messages: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            role: "agent",
            runId: "run-1",
            content: "# Summary\n\nUse **bold** and `code`.\n\n- first\n- second",
            createdAt: "2026-04-25T00:00:02.000Z",
          },
        ],
        runs: [
          {
            id: "run-1",
            conversationId: "conversation-1",
            goal: "Write the summary",
            kind: "user_prompt",
            status: "completed",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:03.000Z",
          },
        ],
        questions: [],
        replies: [],
        runActivities: [],
      }}
      selectedConversation={{ id: "conversation-1", title: "Markdown", createdAt: "2026-04-25T00:00:00.000Z", updatedAt: "2026-04-25T00:00:00.000Z" }}
      onSendMessage={async () => {}}
      isLoading={false}
      onToggleLeftSidebar={() => {}}
      onToggleRightSidebar={() => {}}
      isLeftSidebarOpen={true}
      isRightSidebarOpen={true}
    />,
  );

  assert.match(html, /<h1[^>]*>Summary<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<li>first<\/li>/);
  assert.match(html, /<li>second<\/li>/);
});
