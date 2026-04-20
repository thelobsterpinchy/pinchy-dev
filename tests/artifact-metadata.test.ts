import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunContext } from "../apps/host/src/run-context.js";
import { buildArtifactMetadata, mergeArtifactTags } from "../apps/host/src/artifact-metadata.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-artifact-meta-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("buildArtifactMetadata includes current run context", () => {
  withTempDir((cwd) => {
    const run = createRunContext(cwd, "validation");
    const meta = buildArtifactMetadata(cwd, "tool", "note", ["a"]);
    assert.equal(meta.runLabel, "validation");
    assert.equal(meta.sessionId, run.currentRunId);
  });
});

test("mergeArtifactTags deduplicates tags", () => {
  assert.deepEqual(mergeArtifactTags(["a", "b"], ["b", "c"], undefined), ["a", "b", "c"]);
});
