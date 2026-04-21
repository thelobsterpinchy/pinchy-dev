import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  getActiveWorkspace,
  listWorkspaces,
  registerWorkspace,
  setActiveWorkspace,
} from "../apps/host/src/workspace-registry.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-workspaces-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("workspace registry seeds the current cwd as the default active workspace", () => {
  withTempDir((cwd) => {
    const workspaces = listWorkspaces(cwd);

    assert.equal(workspaces.length, 1);
    assert.equal(workspaces[0]?.path, cwd);
    assert.equal(workspaces[0]?.name, basename(cwd));
    assert.equal(getActiveWorkspace(cwd)?.id, workspaces[0]?.id);
  });
});

test("workspace registry adds tracked repos and lets callers switch the active workspace", () => {
  withTempDir((cwd) => {
    const added = registerWorkspace(cwd, { path: "/tmp/demo-repo", name: "Demo repo" });
    const beforeSwitch = getActiveWorkspace(cwd);

    assert.equal(added.path, "/tmp/demo-repo");
    assert.equal(beforeSwitch?.path, cwd);

    const activated = setActiveWorkspace(cwd, added.id);
    assert.equal(activated?.id, added.id);
    assert.equal(getActiveWorkspace(cwd)?.path, "/tmp/demo-repo");
  });
});

test("workspace registry de-duplicates paths when the same repo is registered twice", () => {
  withTempDir((cwd) => {
    const first = registerWorkspace(cwd, { path: "/tmp/demo-repo", name: "Demo repo" });
    const second = registerWorkspace(cwd, { path: "/tmp/demo-repo", name: "Renamed demo repo" });

    assert.equal(first.id, second.id);
    assert.equal(second.name, "Renamed demo repo");
    assert.equal(listWorkspaces(cwd).filter((entry) => entry.path === "/tmp/demo-repo").length, 1);
  });
});
