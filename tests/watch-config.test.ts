import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWatchConfig } from "../apps/host/src/watch-config.js";

function withTempDir(run: (cwd: string) => void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-watch-config-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("loadWatchConfig reads overrides", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-watch.json"), JSON.stringify({
      watch: ["src", "docs"],
      debounceMs: 1234,
      prompt: "Review the changed area safely.",
    }));

    const config = loadWatchConfig(cwd);

    assert.deepEqual(config.watch, ["src", "docs"]);
    assert.equal(config.debounceMs, 1234);
    assert.equal(config.prompt, "Review the changed area safely.");
  });
});

test("loadWatchConfig falls back to defaults when .pinchy-watch.json is invalid", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-watch.json"), "{not-valid-json");

    const config = loadWatchConfig(cwd);

    assert.deepEqual(config.watch, ["README.md", "docs", ".pi", "apps/host/src"]);
    assert.equal(config.debounceMs, 4000);
    assert.match(config.prompt, /bounded maintenance review/i);
  });
});
