import { TaskAgentDetailPanel } from "./TaskAgentDetailPanel.js";
import type { RootLayoutContext } from "../types.js";

export function AgentSessionView({
  conversationState,
  selectedConversation,
  selectedAgentTask,
  agentGuidances,
  onSelectAgentTask,
  onSubmitAgentGuidance,
  onSteerAgentRun,
}: Pick<RootLayoutContext, "conversationState" | "selectedConversation" | "selectedAgentTask" | "agentGuidances" | "onSelectAgentTask" | "onSubmitAgentGuidance" | "onSteerAgentRun">) {
  return (
    <TaskAgentDetailPanel
      conversationState={conversationState}
      selectedConversation={selectedConversation}
      selectedTask={selectedAgentTask}
      agentGuidances={agentGuidances}
      onBack={() => onSelectAgentTask(undefined)}
      onSubmitAgentGuidance={onSubmitAgentGuidance}
      onSteerAgentRun={onSteerAgentRun}
      backLabel="Back to Pinchy conversation"
    />
  );
}
