import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendArtifactRecord, filterArtifactIndex } from "../apps/host/src/artifact-index.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-artifact-index-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("filterArtifactIndex filters by tag and tool", () => {
  withTempDir((cwd) => {
    appendArtifactRecord(cwd, {
      path: "artifacts/a.png",
      toolName: "screen_click_text",
      createdAt: new Date().toISOString(),
      tags: ["ocr", "screen"],
      runLabel: "iteration",
    });
    appendArtifactRecord(cwd, {
      path: "artifacts/b.png",
      toolName: "browser_debug_scan",
      createdAt: new Date().toISOString(),
      tags: ["browser"],
      runLabel: "manual",
    });
    assert.equal(filterArtifactIndex(cwd, { tag: "ocr" }).length, 1);
    assert.equal(filterArtifactIndex(cwd, { toolName: "browser_debug_scan" }).length, 1);
  });
});
