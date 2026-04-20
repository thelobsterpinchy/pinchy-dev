import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGeneratedToolSource } from "../apps/host/src/tool-review.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-tool-review-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadGeneratedToolSource returns generated tool source", () => {
  withTempDir((cwd) => {
    const dir = join(cwd, ".pi/extensions/generated-tools");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "demo-tool.ts"), "export default function(){}\n");
    const loaded = loadGeneratedToolSource(cwd, "demo tool");
    assert.match(loaded?.source ?? "", /export default/);
  });
});
