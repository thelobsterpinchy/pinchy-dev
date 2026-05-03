import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPinchyPackageRoot, resolvePinchyPackagePath } from "../apps/host/src/package-runtime.js";

test("getPinchyPackageRoot prefers the cwd when running from a pinchy-dev source checkout", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-package-root-"));
  try {
    mkdirSync(join(cwd, "apps/host/src"), { recursive: true });
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "pinchy-dev" }, null, 2));
    writeFileSync(join(cwd, "apps/host/src/pinchy.ts"), "export {};\n");

    assert.equal(getPinchyPackageRoot(cwd), cwd);
    assert.equal(resolvePinchyPackagePath("apps/api/src/server.ts", cwd), join(cwd, "apps/api/src/server.ts"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("getPinchyPackageRoot falls back to the installed package root for non-pinchy workspaces", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-package-root-fallback-"));
  try {
    writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "not-pinchy" }, null, 2));

    assert.notEqual(getPinchyPackageRoot(cwd), cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
