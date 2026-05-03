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

function normalizeLines(request: string) {
  return request
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function looksLikeInternalOrchestrationLine(line: string) {
  return /^(request assessment:|execution policy:|orchestration summary:|what actually happened|why you saw duplicate tasks|the clearest root cause|why the right detail pane looked wrong too|bottom line|most likely code area at fault|important conclusion|acknowledged\.|delegation is blocked|i checked the task state directly|i can tell you what happened\.?)/i.test(line)
    || /^- (extracted task count|execution shape|respond first in the main thread|decompose the request|when work can be parallelized|use delegate_task_plan|use queue_task|if one task depends on another|keep pinchy as the orchestrator|when a delegated agent finishes|for coding or implementation changes|if the request has multiple tasks|only skip delegation)/i.test(line);
}

function stripConversationalLeadIn(line: string) {
  const commaIndex = line.indexOf(",");
  if (commaIndex <= 0) {
    return line;
  }

  const prefix = line.slice(0, commaIndex).trim();
  const suffix = line.slice(commaIndex + 1).trim();
  const prefixHasAction = /\b(fix|patch|implement|create|queue|delegate|plan|investigate|explain|why|what|how|go ahead and|can you|could you|please)\b/i.test(prefix);
  const suffixHasAction = /\b(fix|patch|implement|create|queue|delegate|plan|investigate|explain|why|what|how|go ahead and|can you|could you|please)\b/i.test(suffix);

  if (!prefixHasAction && suffixHasAction) {
    return suffix;
  }

  return line;
}

function extractAssessmentFocusRequest(request: string) {
  const lines = normalizeLines(request);
  const lastLine = lines.at(-1);
  if (!lastLine) {
    return request;
  }

  const internalLineCount = lines.filter(looksLikeInternalOrchestrationLine).length;
  const looksLikeTranscriptHeavyPaste = request.length > 600 || lines.length > 15 || internalLineCount >= 3;
  const focusedLastLine = stripConversationalLeadIn(lastLine);
  const lastLineLooksLikeFreshAsk = /\b(can you|could you|please|fix|patch|implement|create|queue|delegate|plan|investigate|explain|why|what|how|go ahead and)\b/i.test(focusedLastLine);

  if (looksLikeTranscriptHeavyPaste && internalLineCount >= 3 && lastLineLooksLikeFreshAsk) {
    return focusedLastLine;
  }

  return request;
}

const PARALLEL_ACTION_START_PATTERN = /^(fix|patch|implement|create|queue|delegate|plan|investigate|audit|inspect|capture|review|find|debug|analyze|research|compare|evaluate|study|explore)\b/i;

function splitSegmentOnParallelAnd(segment: string) {
  if (/\bgo ahead and\b/i.test(segment)) {
    return [segment];
  }

  const parts = segment.split(/\band\b/gi).map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length <= 1) {
    return [segment];
  }

  if (parts.every((part) => PARALLEL_ACTION_START_PATTERN.test(part))) {
    return parts;
  }

  return [segment];
}

function normalizeSegments(request: string) {
  return normalizeLines(request)
    .flatMap((line) => line.split(/,|\band then\b|\bthen\b/gi))
    .flatMap((segment) => splitSegmentOnParallelAnd(segment.trim()))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

const CODING_ACTION_PATTERN = /\b(fix|implement|patch|refactor|change|update|add|remove|rename|edit|write|create|build|code|debug)\b/i;
const CODING_TARGET_PATTERN = /\b(test|bug|issue|feature|code|function|component|file|api|worker|server|dashboard|ui|cli|tool)\b/i;
const DIRECT_CODING_REFERENCE_PATTERN = /\b(fix|implement|patch|refactor|change|update|edit|write|code|debug)\b[\s\S]*\b(this|it|that)\b/i;
const RESEARCH_ACTION_PATTERN = /\b(research|investigate|analyze|audit|explore|compare|evaluate|study|look into|gather evidence)\b/i;
const RESEARCH_TARGET_PATTERN = /\b(approach|option|tradeoff|tradeoffs|root cause|problem|issue|behavior|architecture|pattern|design|workflow|tooling|provider|integration)\b/i;
const INTENSIVE_TOOL_PATTERN = /\b(browser|playwright|screenshot|screenshots|dom snapshot|network requests|console errors|probe|scan|crawl|inspect logs|debug scan|capture|tool calling|tool calls)\b/i;
const INTENSIVE_EFFORT_PATTERN = /\b(across|multiple|several|deep|thorough|time-intensive|extensive|full|end-to-end|step-by-step)\b/i;

function isLikelyCodingRequest(request: string) {
  if (/\bcreate a task\b/i.test(request)) {
    return false;
  }

  return CODING_ACTION_PATTERN.test(request)
    && (CODING_TARGET_PATTERN.test(request) || DIRECT_CODING_REFERENCE_PATTERN.test(request));
}

function isLikelyResearchRequest(request: string) {
  return RESEARCH_ACTION_PATTERN.test(request) && RESEARCH_TARGET_PATTERN.test(request);
}

function isLikelyIntensiveToolingRequest(request: string) {
  return INTENSIVE_TOOL_PATTERN.test(request) && (INTENSIVE_EFFORT_PATTERN.test(request) || /,/.test(request));
}

function requiresDelegationForSingleTask(request: string) {
  return isLikelyCodingRequest(request)
    || isLikelyResearchRequest(request)
    || isLikelyIntensiveToolingRequest(request);
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
  const focusRequest = extractAssessmentFocusRequest(request);
  const segments = normalizeSegments(focusRequest);
  const taskCount = Math.max(1, segments.length);
  const lower = focusRequest.toLowerCase();
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
    requiresDelegation: taskCount > 1 || requiresDelegationForSingleTask(focusRequest),
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
