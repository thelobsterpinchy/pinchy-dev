import test from "node:test";
import assert from "node:assert/strict";
import { buildPinchyInstallSmokePlan, resolvePinchyInstallSmokeExpectedFiles } from "../scripts/pinchy-install-smoke-plan.js";

test("buildPinchyInstallSmokePlan validates installed CLI flows outside the source checkout", () => {
  const plan = buildPinchyInstallSmokePlan({
    tarballPath: "/tmp/pinchy-dev-0.2.1.tgz",
    installRoot: "/tmp/install-root",
    workspaceRoot: "/tmp/workspace-root",
  });

  assert.equal(plan.steps[0]?.label, "install tarball into temp prefix");
  assert.deepEqual(plan.steps[0]?.command, "npm");
  assert.deepEqual(plan.steps[0]?.args, ["install", "--prefix", "/tmp/install-root", "/tmp/pinchy-dev-0.2.1.tgz"]);

  assert.equal(plan.steps[1]?.label, "run installed pinchy help");
  assert.match(plan.steps[1]?.command, /\/node_modules\/\.bin\/pinchy$/);
  assert.deepEqual(plan.steps[1]?.args, ["help"]);

  assert.equal(plan.steps[2]?.label, "initialize workspace with installed pinchy");
  assert.equal(plan.steps[2]?.cwd, "/tmp/workspace-root");
  assert.deepEqual(plan.steps[2]?.args, ["init"]);

  assert.equal(plan.steps[3]?.label, "run installed pinchy doctor");
  assert.deepEqual(plan.steps[3]?.args, ["doctor"]);

  assert.equal(plan.steps[4]?.label, "run installed pinchy status");
  assert.deepEqual(plan.steps[4]?.args, ["status"]);
});

test("resolvePinchyInstallSmokeExpectedFiles lists the initialized workspace artifacts", () => {
  assert.deepEqual(resolvePinchyInstallSmokeExpectedFiles("/tmp/workspace-root"), [
    "/tmp/workspace-root/.pi/settings.json",
    "/tmp/workspace-root/.pinchy-runtime.json",
    "/tmp/workspace-root/.pinchy-goals.json",
    "/tmp/workspace-root/.pinchy-watch.json",
  ]);
});
