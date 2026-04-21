import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { shouldRunAsCliEntry } from "../apps/host/src/module-entry.js";

test("shouldRunAsCliEntry accepts direct tsx and node-style entrypoint paths", () => {
  assert.equal(shouldRunAsCliEntry("file:///repo/apps/api/src/server.ts", "/repo/apps/api/src/server.ts"), true);
  assert.equal(shouldRunAsCliEntry("file:///repo/apps/api/src/server.ts", "file:///repo/apps/api/src/server.ts"), true);
  assert.equal(shouldRunAsCliEntry("file:///repo/apps/api/src/server.ts", "/repo/apps/host/src/main.ts"), false);
  assert.equal(shouldRunAsCliEntry("file:///repo/apps/api/src/server.ts", undefined), false);
});

test("shouldRunAsCliEntry tolerates realpath differences between argv1 and import.meta.url", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-entry-"));
  try {
    const entryPath = join(cwd, "entry.ts");
    writeFileSync(entryPath, "export {}\n", "utf8");
    const realEntryPath = realpathSync(entryPath);
    assert.equal(shouldRunAsCliEntry(pathToFileURL(realEntryPath).href, entryPath), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
