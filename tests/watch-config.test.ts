import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPinchyInitPlan } from "../apps/host/src/pinchy-init.js";
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

    assert.deepEqual(config.watch, ["README.md", "docs", ".pi", "apps", "packages", "services", "scripts"]);
    assert.equal(config.debounceMs, 4000);
    assert.equal(
      config.prompt,
      "A watched Pinchy file changed. Run a bounded maintenance review for the changed area, prefer tests/docs/guardrails, and stop if no safe improvement is needed.",
    );
  });
});


test("loadWatchConfig uses the guarded default prompt when no config file exists", () => {
  withTempDir((cwd) => {
    const config = loadWatchConfig(cwd);

    assert.deepEqual(config.watch, ["README.md", "docs", ".pi", "apps", "packages", "services", "scripts"]);
    assert.equal(config.debounceMs, 4000);
    assert.equal(
      config.prompt,
      "A watched Pinchy file changed. Run a bounded maintenance review for the changed area, prefer tests/docs/guardrails, and stop if no safe improvement is needed.",
    );
  });
});

test("loadWatchConfig trims watch entries and drops blank paths", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-watch.json"), JSON.stringify({
      watch: ["", " docs ", "   ", "apps/host/src"],
      debounceMs: 1234,
      prompt: "Review the changed area safely.",
    }));

    const config = loadWatchConfig(cwd);

    assert.deepEqual(config.watch, ["docs", "apps/host/src"]);
    assert.equal(config.debounceMs, 1234);
    assert.equal(config.prompt, "Review the changed area safely.");
  });
});

test("loadWatchConfig ignores non-string watch entries while preserving other valid overrides", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-watch.json"), JSON.stringify({
      watch: [null, " docs ", 42, "", "apps/host/src", { nested: true }],
      debounceMs: 1234,
      prompt: "Review the changed area safely.",
    }));

    const config = loadWatchConfig(cwd);

    assert.deepEqual(config.watch, ["docs", "apps/host/src"]);
    assert.equal(config.debounceMs, 1234);
    assert.equal(config.prompt, "Review the changed area safely.");
  });
});

test("loadWatchConfig trims prompt overrides before returning them", () => {
  withTempDir((cwd) => {
    writeFileSync(join(cwd, ".pinchy-watch.json"), JSON.stringify({
      prompt: "  Review the changed area safely.  ",
    }));

    const config = loadWatchConfig(cwd);

    assert.equal(config.prompt, "Review the changed area safely.");
  });
});

test("loadWatchConfig returns a fresh fallback so caller mutations do not leak across reads", () => {
  withTempDir((cwd) => {
    const first = loadWatchConfig(cwd);
    first.watch.push("tmp/mutated");

    const second = loadWatchConfig(cwd);

    assert.deepEqual(second.watch, ["README.md", "docs", ".pi", "apps", "packages", "services", "scripts"]);
    assert.notEqual(first.watch, second.watch);
  });
});

test("loadWatchConfig fallback matches the watch config scaffolded by pinchy init", () => {
  const plan = buildPinchyInitPlan({
    cwd: "/work/demo",
    packageRoot: "/pkg/pinchy-dev",
    existingFiles: new Set<string>(),
    existingGitignore: "",
  });

  const scaffoldedWatchConfig = plan.writeFiles.find((entry) => entry.path === "/work/demo/.pinchy-watch.json");
  assert.ok(scaffoldedWatchConfig);

  const parsedWatchConfig = JSON.parse(scaffoldedWatchConfig.content) as {
    watch: string[];
    debounceMs: number;
    prompt: string;
  };

  withTempDir((cwd) => {
    const fallback = loadWatchConfig(cwd);
    assert.deepEqual(fallback, parsedWatchConfig);
  });
});
