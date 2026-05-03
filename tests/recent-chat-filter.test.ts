import test from "node:test";
import assert from "node:assert/strict";
import { firstVisibleRecentChat, shouldHideFromRecentChats } from "../apps/dashboard/src/recent-chat-filter.js";
import { selectConversationId } from "../apps/dashboard/src/control-plane-client.js";

test("recent chat filter hides internal daemon and watcher conversations from client-facing recent chats", () => {
  assert.equal(shouldHideFromRecentChats({
    id: "conversation-1",
    title: "Pinchy continuous iteration",
    createdAt: "",
    updatedAt: "",
    status: "active",
  }), true);

  assert.equal(shouldHideFromRecentChats({
    id: "conversation-2",
    title: "Pinchy watcher follow-ups",
    createdAt: "",
    updatedAt: "",
    status: "active",
  }), true);

  assert.equal(shouldHideFromRecentChats({
    id: "conversation-3",
    title: "User-facing thread",
    createdAt: "",
    updatedAt: "",
    status: "active",
  }), false);
});

test("recent chat filter falls back to the first visible client-facing conversation", () => {
  const conversations = [
    {
      id: "conversation-1",
      title: "Pinchy continuous iteration",
      createdAt: "",
      updatedAt: "",
      status: "active" as const,
    },
    {
      id: "conversation-2",
      title: "User-facing thread",
      createdAt: "",
      updatedAt: "",
      status: "active" as const,
    },
    {
      id: "conversation-3",
      title: "Pinchy watcher follow-ups",
      createdAt: "",
      updatedAt: "",
      status: "active" as const,
    },
  ];

  assert.equal(firstVisibleRecentChat(conversations)?.id, "conversation-2");
  assert.equal(selectConversationId(conversations, "conversation-missing"), "conversation-2");
  assert.equal(selectConversationId(conversations, "conversation-2"), "conversation-2");

  assert.equal(firstVisibleRecentChat([
    {
      id: "conversation-4",
      title: "Pinchy autonomous goals",
      createdAt: "",
      updatedAt: "",
      status: "active" as const,
    },
  ]), undefined);
  assert.equal(selectConversationId([
    {
      id: "conversation-4",
      title: "Pinchy autonomous goals",
      createdAt: "",
      updatedAt: "",
      status: "active" as const,
    },
  ], "conversation-missing"), undefined);
});
