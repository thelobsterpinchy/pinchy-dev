import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRoutines, upsertRoutine } from "../apps/host/src/routine-store.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-routines-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("upsertRoutine creates and updates routines", () => {
  withTempDir((cwd) => {
    upsertRoutine(cwd, "demo", [{ tool: "desktop_click", input: { x: 1, y: 2 } }]);
    assert.equal(loadRoutines(cwd).length, 1);
    upsertRoutine(cwd, "demo", [{ tool: "desktop_type_text", input: { text: "hello" } }]);
    const routines = loadRoutines(cwd);
    assert.equal(routines.length, 1);
    assert.equal(routines[0]?.steps[0]?.tool, "desktop_type_text");
  });
});

test("routine store tolerates non-array routine files and recovers on upsert", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-routines.json"), JSON.stringify({ name: "broken" }));

    assert.deepEqual(loadRoutines(cwd), []);

    upsertRoutine(cwd, "recovered", [{ tool: "desktop_click", input: { x: 3, y: 4 } }]);

    const routines = loadRoutines(cwd);
    assert.equal(routines.length, 1);
    assert.equal(routines[0]?.name, "recovered");
    assert.deepEqual(routines[0]?.steps, [{ tool: "desktop_click", input: { x: 3, y: 4 } }]);
    assert.ok(routines[0]?.createdAt);
    assert.ok(routines[0]?.updatedAt);
  });
});
