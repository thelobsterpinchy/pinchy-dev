import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

test("package manifest keeps install-time runtime dependencies in dependencies", () => {
  assert.ok(packageJson.dependencies?.tsx, "tsx must be a runtime dependency for the installed pinchy binary");
  assert.equal(packageJson.devDependencies?.tsx, undefined, "tsx should not be dev-only when the published bin executes through it");
});
