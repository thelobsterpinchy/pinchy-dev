export interface ModelSelectionStrategy {
  chooseForTask(input: {
    taskTitle: string;
    taskPrompt: string;
    parentRunKind: string;
    backendCandidates: string[];
  }): Promise<{
    backend: "pi" | "native" | string;
    modelProfile: string;
  }>;
}
