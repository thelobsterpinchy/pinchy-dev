import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendRunHistory, loadRunHistory } from "../apps/host/src/run-history.js";

test("appendRunHistory stores newest entries first", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-history-"));
  appendRunHistory(cwd, { kind: "goal", label: "goal 1", status: "started" });
  appendRunHistory(cwd, { kind: "goal", label: "goal 2", status: "completed" });
  const entries = loadRunHistory(cwd);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.label, "goal 2");
  assert.equal(entries[1]?.label, "goal 1");
});
