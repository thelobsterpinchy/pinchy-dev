import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { ConversationSidebar, resolveConversationsNavTarget } from "../apps/dashboard/src/app/components/ConversationSidebar.js";

test("ConversationSidebar prioritizes reply-needed notification bubbles over generic working state", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ConversationSidebar
        conversations={[
          {
            id: "conversation-1",
            title: "Deploy thread",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:05.000Z",
            status: "active",
            hasActiveRun: true,
            pendingQuestionCount: 2,
            attentionStatus: "needs_reply",
          },
        ]}
        selectedConversationId="conversation-1"
        isOpen={true}
        onToggle={() => {}}
        onSelectConversation={() => {}}
        onDeleteConversation={async () => {}}
        onNewConversation={() => {}}
        activePath="/"
      />
    </MemoryRouter>,
  );

  assert.match(html, /Reply needed/);
  assert.doesNotMatch(html, /Working/);
  assert.match(html, />2</);
});

test("ConversationSidebar shows approval and working notification bubbles with distinct labels", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ConversationSidebar
        conversations={[
          {
            id: "conversation-1",
            title: "Approval thread",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:05.000Z",
            status: "active",
            hasActiveRun: true,
            attentionStatus: "needs_approval",
          },
          {
            id: "conversation-2",
            title: "Working thread",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:06.000Z",
            status: "active",
            hasActiveRun: true,
            attentionStatus: "working",
          },
        ]}
        isOpen={true}
        onToggle={() => {}}
        onSelectConversation={() => {}}
        onDeleteConversation={async () => {}}
        onNewConversation={() => {}}
        activePath="/"
      />
    </MemoryRouter>,
  );

  assert.match(html, /Approval needed/);
  assert.match(html, /Working/);
});

test("ConversationSidebar hides internal Pinchy system conversations from recent chats", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ConversationSidebar
        conversations={[
          {
            id: "conversation-1",
            title: "User-facing thread",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:05.000Z",
            status: "active",
          },
          {
            id: "conversation-2",
            title: "Pinchy queued tasks",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:06.000Z",
            status: "active",
            hasActiveRun: true,
            attentionStatus: "working",
          },
          {
            id: "conversation-3",
            title: "Pinchy continuous iteration",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:07.000Z",
            status: "active",
            hasActiveRun: true,
            attentionStatus: "working",
          },
          {
            id: "conversation-4",
            title: "Pinchy watcher follow-ups",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:08.000Z",
            status: "active",
            hasActiveRun: true,
            attentionStatus: "working",
          },
          {
            id: "conversation-5",
            title: "Pinchy autonomous goals",
            createdAt: "2026-04-25T00:00:00.000Z",
            updatedAt: "2026-04-25T00:00:09.000Z",
            status: "active",
            hasActiveRun: true,
            attentionStatus: "working",
          },
        ]}
        isOpen={true}
        onToggle={() => {}}
        onSelectConversation={() => {}}
        onDeleteConversation={async () => {}}
        onNewConversation={() => {}}
        activePath="/"
      />
    </MemoryRouter>,
  );

  assert.match(html, /User-facing thread/);
  assert.doesNotMatch(html, /Pinchy queued tasks/);
  assert.doesNotMatch(html, /Pinchy continuous iteration/);
  assert.doesNotMatch(html, /Pinchy watcher follow-ups/);
  assert.doesNotMatch(html, /Pinchy autonomous goals/);
});

test("resolveConversationsNavTarget prefers visible chats and falls back to new chat when only internal threads exist", () => {
  assert.equal(resolveConversationsNavTarget([
    {
      id: "conversation-1",
      title: "Pinchy continuous iteration",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:07.000Z",
      status: "active",
    },
    {
      id: "conversation-2",
      title: "Pinchy watcher follow-ups",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:08.000Z",
      status: "active",
    },
  ]), "/");

  assert.equal(resolveConversationsNavTarget([
    {
      id: "conversation-1",
      title: "Pinchy autonomous goals",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:09.000Z",
      status: "active",
    },
    {
      id: "conversation-2",
      title: "User-facing thread",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:10.000Z",
      status: "active",
    },
  ]), "/c/conversation-2");
});

test("ConversationSidebar exposes a dedicated tasks navigation entry", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ConversationSidebar
        conversations={[]}
        isOpen={true}
        onToggle={() => {}}
        onSelectConversation={() => {}}
        onDeleteConversation={async () => {}}
        onNewConversation={() => {}}
        activePath="/tasks"
      />
    </MemoryRouter>,
  );

  assert.match(html, /data-testid="nav-page-tasks"/);
  assert.match(html, />Tasks</);
});
