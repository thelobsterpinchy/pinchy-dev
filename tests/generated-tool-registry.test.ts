import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGeneratedToolRegistry } from "../apps/host/src/generated-tool-registry.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-generated-registry-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadGeneratedToolRegistry reads generated tool names", () => {
  withTempDir((cwd) => {
    const dir = join(cwd, ".pi/extensions/generated-tools");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".index"), "alpha\nbeta\n");
    assert.deepEqual(loadGeneratedToolRegistry(cwd), ["alpha", "beta"]);
  });
});
