import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDaemonHealth } from "../apps/host/src/daemon-health.js";
import { loadRunHistory } from "../apps/host/src/run-history.js";
import { processNextReloadRequest } from "../apps/host/src/daemon.js";
import { queueReloadRequest } from "../apps/host/src/reload-requests.js";

function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-daemon-reload-"));
  return Promise.resolve()
    .then(() => run(cwd))
    .finally(() => {
      rmSync(cwd, { recursive: true, force: true });
    });
}

test("processNextReloadRequest handles runtime reloads via prompt instead of followUp", async () => {
  await withTempDir(async (cwd) => {
    queueReloadRequest(cwd, "example-tool");
    const calls: string[] = [];

    const processed = await processNextReloadRequest(cwd, {
      prompt: async (text: string) => {
        calls.push(`prompt:${text}`);
      },
      followUp: async (text: string) => {
        calls.push(`followUp:${text}`);
        throw new Error("followUp should not be used for /reload-runtime");
      },
    });

    const history = loadRunHistory(cwd);
    const health = loadDaemonHealth(cwd);

    assert.equal(processed?.toolName, "example-tool");
    assert.deepEqual(calls, ["prompt:/reload-runtime"]);
    assert.equal(history[0]?.kind, "reload");
    assert.equal(history[0]?.status, "completed");
    assert.equal(health?.status, "idle");
    assert.equal(health?.lastError, undefined);
  });
});
