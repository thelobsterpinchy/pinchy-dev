import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendGeneratedToolIndex, scaffoldExtensionTool } from "../apps/host/src/tool-scaffold.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-tool-scaffold-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("scaffoldExtensionTool creates a generated tool file", () => {
  withTempDir((cwd) => {
    const result = scaffoldExtensionTool(cwd, { name: "sample tool", description: "demo" });
    appendGeneratedToolIndex(cwd, result.safeName);
    const content = readFileSync(result.path, "utf8");
    assert.match(content, /registerTool/);
    assert.match(content, /demo/);
  });
});
