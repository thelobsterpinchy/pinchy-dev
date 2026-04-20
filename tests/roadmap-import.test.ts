import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importRoadmapDocument, parseDaemonFollowableTasks } from "../apps/host/src/roadmap-import.js";
import { loadTasks } from "../apps/host/src/task-queue.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-roadmap-import-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("parseDaemonFollowableTasks extracts ordered tasks from roadmap markdown", () => {
  const markdown = `# Example\n\n## Daemon-followable execution order\n\n### Task 1\nImplement Phase 1: First step.\n\n### Task 2\nImplement Phase 2: Second step.\n\n## Definition of roadmap completion\nDone.`;

  const tasks = parseDaemonFollowableTasks(markdown);

  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((task) => task.id), [1, 2]);
  assert.match(tasks[0]?.title ?? "", /First step/);
  assert.match(tasks[1]?.prompt ?? "", /Second step/);
});

test("importRoadmapDocument writes roadmap state and can enqueue imported tasks", () => {
  withTempDir((cwd) => {
    const roadmapPath = join(cwd, "ROADMAP.md");
    writeFileSync(roadmapPath, `# Example\n\n## Daemon-followable execution order\n\n### Task 1\nImplement Phase 1: First step.\n\n### Task 2\nImplement Phase 2: Second step.\n\n## Definition of roadmap completion\nDone.`);

    const imported = importRoadmapDocument(cwd, roadmapPath, { enqueue: true, statusDocument: "docs/CUSTOM_ROADMAP_STATUS.md" });
    const statePath = join(cwd, ".pinchy-roadmap-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      roadmapDocument: string;
      statusDocument: string;
      currentTask: { id: number; title: string; status: string };
      tasks: Array<{ id: number; title: string; status: string }>;
    };

    assert.equal(imported.tasks.length, 2);
    assert.equal(state.roadmapDocument, roadmapPath);
    assert.equal(state.statusDocument, "docs/CUSTOM_ROADMAP_STATUS.md");
    assert.equal(state.currentTask.id, 1);
    assert.equal(state.currentTask.status, "queued");
    assert.equal(state.tasks.length, 2);

    const queuedTasks = loadTasks(cwd);
    assert.equal(queuedTasks.length, 2);
    assert.match(queuedTasks[0]?.title ?? "", /Roadmap Task 1/);
    assert.match(queuedTasks[1]?.prompt ?? "", /Second step/);
  });
});
