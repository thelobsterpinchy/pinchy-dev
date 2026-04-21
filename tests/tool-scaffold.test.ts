import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendGeneratedToolIndex, listGeneratedTools, scaffoldExtensionTool } from "../apps/host/src/tool-scaffold.js";

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

test("listGeneratedTools returns an empty list when the generated tools directory exists without an index", () => {
  withTempDir((cwd) => {
    mkdirSync(join(cwd, ".pi/extensions/generated-tools"), { recursive: true });
    assert.deepEqual(listGeneratedTools(cwd), []);
  });
});

test("scaffoldExtensionTool rejects names that normalize to an empty identifier", () => {
  withTempDir((cwd) => {
    assert.throws(
      () => scaffoldExtensionTool(cwd, { name: "!!!", description: "demo" }),
      /tool name/i,
    );
  });
});
