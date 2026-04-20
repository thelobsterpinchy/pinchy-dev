import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareArtifacts } from "../apps/host/src/browser-artifacts.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-artifacts-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("compareArtifacts detects identical text files", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, "a.html"), "<h1>Hello</h1>\n");
    writeFileSync(join(cwd, "b.html"), "<h1>Hello</h1>\n");

    const result = compareArtifacts(cwd, "a.html", "b.html");
    assert.equal(result.identical, true);
    assert.equal(result.sameExtension, true);
  });
});

test("compareArtifacts creates a text diff preview for changed HTML files", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, "before.html"), "<h1>Before</h1>\n<p>old</p>\n");
    writeFileSync(join(cwd, "after.html"), "<h1>After</h1>\n<p>new</p>\n");

    const result = compareArtifacts(cwd, "before.html", "after.html");
    assert.equal(result.identical, false);
    assert.match(result.textDiffPreview ?? "", /Before/);
    assert.match(result.textDiffPreview ?? "", /After/);
  });
});
