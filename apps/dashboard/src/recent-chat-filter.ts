import type { Conversation } from "../../../packages/shared/src/contracts.js";

const INTERNAL_RECENT_CHAT_TITLES = new Set([
  "Pinchy queued tasks",
  "Pinchy continuous iteration",
  "Pinchy watcher follow-ups",
  "Pinchy autonomous goals",
]);

export function shouldHideFromRecentChats(conversation: Conversation) {
  return INTERNAL_RECENT_CHAT_TITLES.has(conversation.title);
}

export function firstVisibleRecentChat(conversations: Conversation[]) {
  return conversations.find((conversation) => !shouldHideFromRecentChats(conversation));
}
