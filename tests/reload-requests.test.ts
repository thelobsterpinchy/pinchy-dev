import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { consumeNextReloadRequest, getPendingReloadRequests, queueReloadRequest } from "../apps/host/src/reload-requests.js";

test("queueReloadRequest and consumeNextReloadRequest manage reload requests", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-reload-"));
  queueReloadRequest(cwd, "example-tool");
  assert.equal(getPendingReloadRequests(cwd).length, 1);
  const next = consumeNextReloadRequest(cwd);
  assert.equal(next?.toolName, "example-tool");
  assert.equal(getPendingReloadRequests(cwd).length, 0);
});

test("reload request helpers tolerate non-array request files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-reload-"));
  writeFileSync(join(cwd, ".pinchy-reload-requests.json"), JSON.stringify({ status: "pending" }));

  assert.deepEqual(getPendingReloadRequests(cwd), []);
  assert.equal(consumeNextReloadRequest(cwd), undefined);
});
