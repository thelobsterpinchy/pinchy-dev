import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPinchyCli } from "../apps/host/src/pinchy.js";

function withTempDir(run: (cwd: string) => void | Promise<void>) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-logs-command-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("runPinchyCli prints only daemon logs when requested", async () => {
  await withTempDir(async (cwd) => {
    const runDir = join(cwd, ".pinchy", "run");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "daemon.log"), "daemon heartbeat\n", "utf8");
    writeFileSync(join(runDir, "api.log"), "api request\n", "utf8");

    const originalLog = console.log;
    const captured: string[] = [];
    console.log = (message?: unknown) => {
      captured.push(String(message ?? ""));
    };

    try {
      await runPinchyCli(["logs", "daemon"], { ...process.env, PINCHY_CWD: cwd });
    } finally {
      console.log = originalLog;
    }

    assert.equal(captured.length, 1);
    assert.match(captured[0] ?? "", /logs: daemon/);
    assert.match(captured[0] ?? "", /daemon heartbeat/);
    assert.doesNotMatch(captured[0] ?? "", /logs: api/);
    assert.doesNotMatch(captured[0] ?? "", /api request/);
  });
});
