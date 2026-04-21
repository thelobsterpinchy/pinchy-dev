import test from "node:test";
import assert from "node:assert/strict";
import { resolvePinchyUserDataPaths, resolvePinchyWorkspacePaths } from "../apps/host/src/pinchy-paths.js";

test("resolvePinchyWorkspacePaths keeps runtime and state inside the active workspace", () => {
  const paths = resolvePinchyWorkspacePaths("/work/demo");

  assert.equal(paths.workspaceRoot, "/work/demo");
  assert.equal(paths.dotPiDir, "/work/demo/.pi");
  assert.equal(paths.runtimeConfigPath, "/work/demo/.pinchy-runtime.json");
  assert.equal(paths.goalsConfigPath, "/work/demo/.pinchy-goals.json");
  assert.equal(paths.watchConfigPath, "/work/demo/.pinchy-watch.json");
  assert.equal(paths.runDir, "/work/demo/.pinchy/run");
  assert.equal(paths.stateDir, "/work/demo/.pinchy/state");
  assert.equal(paths.logsDir, "/work/demo/logs");
});

test("resolvePinchyUserDataPaths keeps user-global data separate from workspace state", () => {
  const paths = resolvePinchyUserDataPaths("/Users/tester");

  assert.equal(paths.homeDir, "/Users/tester");
  assert.equal(paths.appSupportDir, "/Users/tester/.pinchy");
  assert.equal(paths.cacheDir, "/Users/tester/.pinchy/cache");
  assert.equal(paths.tmpDir, "/Users/tester/.pinchy/tmp");
});
