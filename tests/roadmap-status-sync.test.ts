import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncRoadmapTaskProgress } from "../apps/host/src/roadmap-status-sync.js";

type RoadmapStateFile = {
  currentPhase: number;
  currentTask: { id: number; title: string; status: string };
  overallState: string;
  lastUpdated: string;
  tasks: Array<{ id: number; title: string; status: string; validation: string[]; notes?: string }>;
};

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-roadmap-status-sync-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function seedFiles(cwd: string) {
  mkdirSync(join(cwd, "docs"), { recursive: true });
  writeFileSync(join(cwd, "docs/ROADMAP_STATUS.md"), `# Roadmap Status\n\n## Overall status\n- currentPhase: 2\n- currentTask: Roadmap Task 2\n- overallState: queued\n- lastUpdated: 2026-04-20T00:00:00.000Z\n\n## Task checklist\n\n### Task 1 — First task\n- status: done\n- goal: first\n- validation: \`npm test && npm run check\`\n- notes: completed\n\n### Task 2 — Second task\n- status: queued\n- goal: second\n- validation: \`npm test && npm run check\`\n- notes: pending\n\n### Task 3 — Third task\n- status: queued\n- goal: third\n- validation: \`npm test && npm run check\`\n- notes: pending\n`);

  const state: RoadmapStateFile = {
    currentPhase: 2,
    currentTask: { id: 2, title: "Second task", status: "queued" },
    overallState: "queued",
    lastUpdated: "2026-04-20T00:00:00.000Z",
    tasks: [
      { id: 1, title: "First task", status: "done", validation: ["npm test", "npm run check"], notes: "completed" },
      { id: 2, title: "Second task", status: "queued", validation: ["npm test", "npm run check"], notes: "pending" },
      { id: 3, title: "Third task", status: "queued", validation: ["npm test", "npm run check"], notes: "pending" },
    ],
  };
  writeFileSync(join(cwd, ".pinchy-roadmap-state.json"), JSON.stringify(state, null, 2));
}

test("syncRoadmapTaskProgress marks exactly one task in progress across markdown and state json", () => {
  withTempDir((cwd) => {
    seedFiles(cwd);

    syncRoadmapTaskProgress(cwd, {
      taskId: 2,
      status: "in_progress",
      overallState: "in_progress",
      currentPhase: 2,
      currentTaskLabel: "Roadmap Task 2",
      notes: "implementing bounded slice",
      lastUpdated: "2026-04-21T01:00:00.000Z",
    });

    const markdown = readFileSync(join(cwd, "docs/ROADMAP_STATUS.md"), "utf8");
    const state = JSON.parse(readFileSync(join(cwd, ".pinchy-roadmap-state.json"), "utf8")) as RoadmapStateFile;

    assert.match(markdown, /currentTask: Roadmap Task 2/);
    assert.match(markdown, /overallState: in_progress/);
    assert.match(markdown, /### Task 2 — Second task[\s\S]*?- status: in_progress/);
    assert.doesNotMatch(markdown, /### Task 3 — Third task[\s\S]*?- status: in_progress/);
    assert.equal(state.currentTask.id, 2);
    assert.equal(state.currentTask.status, "in_progress");
    assert.equal(state.overallState, "in_progress");
    assert.equal(state.tasks[1]?.status, "in_progress");
    assert.equal(state.tasks[2]?.status, "queued");
    assert.equal(state.tasks.filter((task) => task.status === "in_progress").length, 1);
  });
});

test("syncRoadmapTaskProgress clears an older in-progress task before marking a new one in progress", () => {
  withTempDir((cwd) => {
    seedFiles(cwd);

    syncRoadmapTaskProgress(cwd, {
      taskId: 2,
      status: "in_progress",
      overallState: "in_progress",
      currentPhase: 2,
      currentTaskLabel: "Roadmap Task 2",
      notes: "working on task two",
      lastUpdated: "2026-04-21T01:05:00.000Z",
    });

    syncRoadmapTaskProgress(cwd, {
      taskId: 3,
      status: "in_progress",
      overallState: "in_progress",
      currentPhase: 3,
      currentTaskLabel: "Roadmap Task 3",
      notes: "switching to task three",
      lastUpdated: "2026-04-21T01:10:00.000Z",
    });

    const markdown = readFileSync(join(cwd, "docs/ROADMAP_STATUS.md"), "utf8");
    const state = JSON.parse(readFileSync(join(cwd, ".pinchy-roadmap-state.json"), "utf8")) as RoadmapStateFile;

    assert.match(markdown, /### Task 2 — Second task[\s\S]*?- status: queued/);
    assert.match(markdown, /### Task 3 — Third task[\s\S]*?- status: in_progress/);
    assert.equal(state.tasks[1]?.status, "queued");
    assert.equal(state.tasks[2]?.status, "in_progress");
    assert.equal(state.tasks.filter((task) => task.status === "in_progress").length, 1);
  });
});

test("syncRoadmapTaskProgress marks a task done with notes only after validation and can complete the roadmap", () => {
  withTempDir((cwd) => {
    seedFiles(cwd);

    syncRoadmapTaskProgress(cwd, {
      taskId: 3,
      status: "done",
      overallState: "done",
      currentPhase: 3,
      currentTaskLabel: "Roadmap complete",
      notes: "validated with npm test and npm run check",
      lastUpdated: "2026-04-21T01:15:00.000Z",
    });

    const markdown = readFileSync(join(cwd, "docs/ROADMAP_STATUS.md"), "utf8");
    const state = JSON.parse(readFileSync(join(cwd, ".pinchy-roadmap-state.json"), "utf8")) as RoadmapStateFile;

    assert.match(markdown, /currentTask: Roadmap complete/);
    assert.match(markdown, /overallState: done/);
    assert.match(markdown, /### Task 3 — Third task[\s\S]*?- status: done/);
    assert.match(markdown, /validated with npm test and npm run check/);
    assert.equal(state.currentTask.id, 3);
    assert.equal(state.currentTask.status, "done");
    assert.equal(state.overallState, "done");
    assert.equal(state.tasks[2]?.status, "done");
    assert.equal(state.tasks[2]?.notes, "validated with npm test and npm run check");
  });
});
