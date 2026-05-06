import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
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

test("loadRunHistory falls back to an empty list when the history file contains a non-array JSON value", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-history-"));
  writeFileSync(join(cwd, ".pinchy-run-history.json"), JSON.stringify({ unexpected: true }));

  assert.deepEqual(loadRunHistory(cwd), []);

  appendRunHistory(cwd, { kind: "goal", label: "goal 1", status: "started" });
  const entries = loadRunHistory(cwd);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.label, "goal 1");
});
