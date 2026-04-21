import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ImportedRoadmapState, ImportedRoadmapTask } from "./roadmap-import.js";

type RoadmapTaskStatus = ImportedRoadmapTask["status"];
type RoadmapOverallState = ImportedRoadmapState["overallState"];

export type SyncRoadmapTaskProgressInput = {
  taskId: number;
  status: RoadmapTaskStatus;
  overallState: RoadmapOverallState;
  currentPhase: number;
  currentTaskLabel: string;
  notes: string;
  lastUpdated?: string;
  statePath?: string;
  statusDocumentPath?: string;
};

function replaceOverallStatus(markdown: string, input: SyncRoadmapTaskProgressInput, lastUpdated: string) {
  return markdown
    .replace(/- currentPhase:\s*.*$/m, `- currentPhase: ${input.currentPhase}`)
    .replace(/- currentTask:\s*.*$/m, `- currentTask: ${input.currentTaskLabel}`)
    .replace(/- overallState:\s*.*$/m, `- overallState: ${input.overallState}`)
    .replace(/- lastUpdated:\s*.*$/m, `- lastUpdated: ${lastUpdated}`);
}

function replaceTaskBlock(markdown: string, taskId: number, update: { status?: string; notes?: string }) {
  const pattern = new RegExp(`(### Task ${taskId}[^\n]*\n(?:- .*\n)*)`, "m");
  const match = markdown.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Task block not found for task ${taskId}`);
  }

  let block = match[1];
  if (update.status !== undefined) {
    block = block.replace(/- status:\s*.*$/m, `- status: ${update.status}`);
  }
  if (update.notes !== undefined) {
    block = block.replace(/- notes:\s*.*$/m, `- notes: ${update.notes}`);
  }

  return markdown.replace(pattern, block);
}

function clearOtherInProgressStatuses(markdown: string, activeTaskId: number) {
  return markdown.replace(/### Task (\d+)([^]*?)(?=\n### Task \d+|$)/g, (full, rawTaskId, body) => {
    const taskId = Number(rawTaskId);
    if (taskId === activeTaskId) return full;
    return `### Task ${rawTaskId}${String(body).replace(/- status:\s*in_progress$/m, "- status: queued")}`;
  });
}

export function syncRoadmapTaskProgress(cwd: string, input: SyncRoadmapTaskProgressInput) {
  const lastUpdated = input.lastUpdated ?? new Date().toISOString();
  const statusDocumentPath = resolve(cwd, input.statusDocumentPath ?? "docs/ROADMAP_STATUS.md");
  const statePath = resolve(cwd, input.statePath ?? ".pinchy-roadmap-state.json");

  const state = JSON.parse(readFileSync(statePath, "utf8")) as ImportedRoadmapState;
  const task = state.tasks.find((entry) => entry.id === input.taskId);
  if (!task) {
    throw new Error(`Task not found in roadmap state: ${input.taskId}`);
  }

  for (const entry of state.tasks) {
    if (input.status === "in_progress") {
      entry.status = entry.id === input.taskId ? "in_progress" : entry.status === "in_progress" ? "queued" : entry.status;
    } else if (entry.id === input.taskId) {
      entry.status = input.status;
    }
  }

  task.notes = input.notes;
  state.currentPhase = input.currentPhase;
  state.currentTask = {
    id: task.id,
    title: task.title,
    status: task.status,
  };
  state.overallState = input.overallState;
  state.lastUpdated = lastUpdated;

  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

  let markdown = readFileSync(statusDocumentPath, "utf8");
  markdown = replaceOverallStatus(markdown, input, lastUpdated);
  if (input.status === "in_progress") {
    markdown = clearOtherInProgressStatuses(markdown, input.taskId);
  }
  markdown = replaceTaskBlock(markdown, input.taskId, {
    status: input.status,
    notes: input.notes,
  });

  writeFileSync(statusDocumentPath, markdown, "utf8");

  return state;
}
