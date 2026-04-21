import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { enqueueTask } from "./task-queue.js";

export type ImportedRoadmapTask = {
  id: number;
  title: string;
  prompt: string;
  status: "queued" | "in_progress" | "done" | "blocked";
  validation: string[];
  notes?: string;
};

export type RoadmapImportOptions = {
  enqueue?: boolean;
  statePath?: string;
  statusDocument?: string;
};

export type ImportedRoadmapState = {
  roadmapDocument: string;
  statusDocument: string;
  currentPhase: number;
  currentTask: {
    id: number;
    title: string;
    status: ImportedRoadmapTask["status"];
  };
  overallState: "queued" | "in_progress" | "done" | "blocked";
  lastUpdated: string;
  tasks: ImportedRoadmapTask[];
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeTaskTitle(prompt: string, id: number) {
  const firstSentence = prompt.split(/\n+/)[0]?.trim() ?? "";
  if (!firstSentence) return `Task ${id}`;
  return firstSentence.replace(/^Implement\s+/i, "").replace(/\.$/, "").trim();
}

export function parseDaemonFollowableTasks(markdown: string): ImportedRoadmapTask[] {
  const sectionMatch = markdown.match(/## Daemon-followable execution order([\s\S]*?)(?:\n## |$)/);
  if (!sectionMatch) return [];
  const section = sectionMatch[1] ?? "";
  const lines = section.split(/\r?\n/);
  const tasks: ImportedRoadmapTask[] = [];

  let currentId: number | undefined;
  let currentPromptLines: string[] = [];

  const flushTask = () => {
    if (!currentId) return;
    const prompt = currentPromptLines.join("\n").trim();
    if (!prompt) return;
    tasks.push({
      id: currentId,
      title: normalizeTaskTitle(prompt, currentId),
      prompt,
      status: "queued",
      validation: ["npm test", "npm run check"],
    });
  };

  for (const line of lines) {
    const heading = line.match(/^### Task\s+(\d+)(?:\s+[—-].*)?\s*$/);
    if (heading) {
      flushTask();
      currentId = Number(heading[1]);
      currentPromptLines = [];
      continue;
    }
    if (currentId) {
      currentPromptLines.push(line);
    }
  }

  flushTask();
  return tasks.sort((a, b) => a.id - b.id);
}

export function importRoadmapDocument(cwd: string, roadmapPath: string, options: RoadmapImportOptions = {}) {
  const absoluteRoadmapPath = resolve(cwd, roadmapPath);
  const markdown = readFileSync(absoluteRoadmapPath, "utf8");
  const tasks = parseDaemonFollowableTasks(markdown);
  const firstTask = tasks[0] ?? { id: 0, title: "none", status: "queued" as const };
  const state: ImportedRoadmapState = {
    roadmapDocument: absoluteRoadmapPath,
    statusDocument: options.statusDocument ?? "docs/ROADMAP_STATUS.md",
    currentPhase: firstTask.id,
    currentTask: {
      id: firstTask.id,
      title: firstTask.title,
      status: firstTask.status,
    },
    overallState: tasks.length > 0 ? "queued" : "done",
    lastUpdated: nowIso(),
    tasks,
  };

  const statePath = resolve(cwd, options.statePath ?? ".pinchy-roadmap-state.json");
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

  if (options.enqueue) {
    for (const task of tasks) {
      enqueueTask(cwd, `Roadmap Task ${task.id}: ${task.title}`, task.prompt);
    }
  }

  return state;
}
