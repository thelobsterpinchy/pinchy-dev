import { useOutletContext, useParams } from "react-router";
import { ChatView } from "./ChatView.js";
import { AgentSessionView } from "./AgentSessionView.js";
import type { RootLayoutContext } from "../types.js";

export function ChatPage() {
  const context = useOutletContext<RootLayoutContext>();
  const { conversationId, taskId } = useParams();
  const routedAgentTask = taskId
    ? context.tasks.find((task) => task.id === taskId && task.conversationId === conversationId)
    : undefined;

  if (routedAgentTask) {
    return <AgentSessionView {...context} selectedAgentTask={routedAgentTask} />;
  }
  return <ChatView {...context} />;
}
