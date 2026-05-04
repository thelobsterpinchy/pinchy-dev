export type ArtifactRef = {
  path: string;
  kind: string;
  note?: string;
};

export type AgentContext = {
  objective: string;
  constraints: string[];
  repoFacts: string[];
  dependencyOutputs: string[];
  recentConversationSummary?: string;
  relevantMessages?: string[];
  operatorGuidance?: string[];
  artifactRefs?: ArtifactRef[];
};

export type MemorySnapshot = {
  conversationSummary?: string;
  runSummary?: string;
  taskOutputs?: Array<{ taskId: string; summary: string }>;
  pinnedFacts?: string[];
  recentDecisions?: string[];
};

export interface ContextAssembler {
  buildForTask(input: { parentRunId: string; taskId: string; conversationId: string }): Promise<AgentContext>;
}
