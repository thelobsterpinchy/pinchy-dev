import test from "node:test";
import assert from "node:assert/strict";
import { parsePinchyCliArgs } from "../apps/host/src/pinchy-cli.js";

test("parsePinchyCliArgs recognizes setup and version commands", () => {
  assert.equal(parsePinchyCliArgs(["setup"]).command, "setup");
  assert.equal(parsePinchyCliArgs(["version"]).command, "version");
});

test("parsePinchyCliArgs preserves status and logs flags", () => {
  assert.deepEqual(parsePinchyCliArgs(["status", "--json"]).args, ["--json"]);
  assert.deepEqual(parsePinchyCliArgs(["logs", "dashboard", "--json", "--tail", "200"]).args, ["dashboard", "--json", "--tail", "200"]);
  assert.deepEqual(parsePinchyCliArgs(["doctor", "--json"]).args, ["--json"]);
});
