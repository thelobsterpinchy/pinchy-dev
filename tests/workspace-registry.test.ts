import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  deleteWorkspace,
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

test("workspace registry resolves relative workspace paths against the provided cwd", () => {
  withTempDir((cwd) => {
    const added = registerWorkspace(cwd, { path: "nested/demo-repo" });

    assert.equal(added.path, join(cwd, "nested/demo-repo"));
    assert.equal(listWorkspaces(cwd).some((entry) => entry.path === join(cwd, "nested/demo-repo")), true);
  });
});

test("workspace registry trims whitespace around input paths before registering", () => {
  withTempDir((cwd) => {
    const added = registerWorkspace(cwd, { path: "  nested/demo-repo  ", name: "Demo repo" });

    assert.equal(added.path, join(cwd, "nested/demo-repo"));
    assert.equal(listWorkspaces(cwd).some((entry) => entry.path === join(cwd, "nested/demo-repo")), true);
  });
});

test("workspace registry de-duplicates the same path even when later registrations include extra whitespace", () => {
  withTempDir((cwd) => {
    const first = registerWorkspace(cwd, { path: "/tmp/demo-repo", name: "Demo repo" });
    const second = registerWorkspace(cwd, { path: "  /tmp/demo-repo  ", name: "Renamed demo repo" });

    assert.equal(first.id, second.id);
    assert.equal(second.name, "Renamed demo repo");
    assert.equal(listWorkspaces(cwd).filter((entry) => entry.path === "/tmp/demo-repo").length, 1);
  });
});

test("workspace registry rejects empty workspace paths instead of mutating the seeded cwd entry", () => {
  withTempDir((cwd) => {
    const seeded = listWorkspaces(cwd)[0];

    assert.throws(() => registerWorkspace(cwd, { path: "   ", name: "Unexpected rename" }), /path is required/);
    assert.deepEqual(listWorkspaces(cwd), [seeded]);
    assert.equal(getActiveWorkspace(cwd)?.name, seeded.name);
  });
});

test("workspace registry deletes a workspace and falls back active selection when needed", () => {
  withTempDir((cwd) => {
    const demo = registerWorkspace(cwd, { path: "/tmp/demo-repo", name: "Demo repo" });
    const docs = registerWorkspace(cwd, { path: "/tmp/docs-repo", name: "Docs repo" });

    setActiveWorkspace(cwd, demo.id);
    const deleted = deleteWorkspace(cwd, demo.id);

    assert.equal(deleted?.id, demo.id);
    assert.equal(listWorkspaces(cwd).some((entry) => entry.id === demo.id), false);
    assert.equal(getActiveWorkspace(cwd)?.id, listWorkspaces(cwd)[0]?.id);
    assert.equal(listWorkspaces(cwd).some((entry) => entry.id === docs.id), true);
  });
});

test("workspace registry refuses to delete the last remaining workspace", () => {
  withTempDir((cwd) => {
    const seeded = listWorkspaces(cwd)[0];
    assert.equal(deleteWorkspace(cwd, seeded.id), undefined);
    assert.equal(listWorkspaces(cwd).length, 1);
    assert.equal(getActiveWorkspace(cwd)?.id, seeded.id);
  });
});
