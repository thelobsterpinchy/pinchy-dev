import type { TaskStatus } from "../../../packages/shared/src/contracts.js";

export type RequestExecutionShape = "single" | "parallel" | "dependency-chained" | "mixed";

export type RequestTaskAssessment = {
  taskCount: number;
  requiresDelegation: boolean;
  executionShape: RequestExecutionShape;
};

export type OrchestrationSummaryTask = {
  title: string;
  status?: TaskStatus;
  dependsOnTitles?: string[];
};

function normalizeSegments(request: string) {
  return request
    .split(/\n+/)
    .flatMap((line) => line.split(/,|\band then\b|\bthen\b|\band\b/gi))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function inferExecutionShapeFromTasks(tasks: OrchestrationSummaryTask[]): RequestExecutionShape {
  if (tasks.length <= 1) {
    return "single";
  }

  const dependencyEdges = tasks.reduce((count, task) => count + (task.dependsOnTitles?.length ?? 0), 0);
  if (dependencyEdges === 0) {
    return "parallel";
  }

  const rootTaskCount = tasks.filter((task) => (task.dependsOnTitles?.length ?? 0) === 0).length;
  const dependentTaskCount = tasks.filter((task) => (task.dependsOnTitles?.length ?? 0) > 0).length;
  if (rootTaskCount === 1 && dependentTaskCount === tasks.length - 1) {
    return "dependency-chained";
  }

  return "mixed";
}

function formatDependencySummary(tasks: OrchestrationSummaryTask[]) {
  const dependencyEdges = tasks.flatMap((task) => (task.dependsOnTitles ?? []).map((dependencyTitle) => `${task.title} waits for ${dependencyTitle}`));
  if (dependencyEdges.length === 0) {
    return "none";
  }

  return dependencyEdges.map((edge) => `  - ${edge}`).join("\n");
}

function formatSynthesisStatus(tasks: OrchestrationSummaryTask[]) {
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  if (blockedCount > 0) {
    return `blocked while ${blockedCount} delegated task(s) are blocked.`;
  }

  const pendingCount = tasks.filter((task) => task.status !== "done").length;
  if (pendingCount > 0) {
    return `waiting on ${pendingCount} delegated task(s) before final synthesis.`;
  }

  return "ready to synthesize the final thread update.";
}

export function assessUserRequestTasks(request: string): RequestTaskAssessment {
  const segments = normalizeSegments(request);
  const taskCount = Math.max(1, segments.length);
  const lower = request.toLowerCase();
  const hasSequentialSignal = /\bthen\b|\bafter\b|\bbefore\b|\bonce\b/.test(lower);
  const hasParallelSignal = /,|\band\b|\bin parallel\b|\bseparately\b/.test(lower);

  let executionShape: RequestExecutionShape = "single";
  if (taskCount <= 1) {
    executionShape = "single";
  } else if (hasSequentialSignal && hasParallelSignal) {
    executionShape = "mixed";
  } else if (hasSequentialSignal) {
    executionShape = "dependency-chained";
  } else {
    executionShape = "parallel";
  }

  return {
    taskCount,
    requiresDelegation: taskCount > 1,
    executionShape,
  };
}

export function buildOrchestrationSummary(input: {
  tasks: OrchestrationSummaryTask[];
  intro?: string;
}) {
  const executionShape = inferExecutionShapeFromTasks(input.tasks);
  const extractedTasks = input.tasks.length > 0
    ? input.tasks.map((task, index) => `  ${index + 1}. ${task.title}`).join("\n")
    : "  none";

  return [
    input.intro?.trim(),
    "Orchestration summary:",
    `- execution mode: ${executionShape}`,
    `- delegated tasks created: ${input.tasks.length}`,
    "- extracted tasks:",
    extractedTasks,
    "- pending dependency edges:",
    formatDependencySummary(input.tasks),
    `- synthesis status: ${formatSynthesisStatus(input.tasks)}`,
  ].filter(Boolean).join("\n");
}
