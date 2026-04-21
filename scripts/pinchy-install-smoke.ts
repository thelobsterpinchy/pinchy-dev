import { existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildPinchyInstallSmokePlan, resolvePinchyInstallSmokeExpectedFiles } from "./pinchy-install-smoke-plan.js";

function log(message: string) {
  console.log(`[pinchy-install-smoke] ${message}`);
}

function runStep(step: { label: string; command: string; args: string[]; cwd?: string }) {
  log(`${step.label}: ${step.command} ${step.args.join(" ")}`);
  const output = execFileSync(step.command, step.args, {
    cwd: step.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (output.trim()) {
    console.log(output.trimEnd());
  }
  return output;
}

function assertIncludes(output: string, text: string, label: string) {
  if (!output.includes(text)) {
    throw new Error(`${label} did not include expected text: ${text}`);
  }
}

function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), "pinchy-install-smoke-"));
  const tarballDir = resolve(tempRoot, "tarball");
  const installRoot = resolve(tempRoot, "install-root");
  const workspaceRoot = resolve(tempRoot, "workspace-root");
  mkdirSync(tarballDir, { recursive: true });
  mkdirSync(installRoot, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });

  log(`tempRoot=${tempRoot}`);
  const tarballName = execFileSync("npm", ["pack", "--pack-destination", tarballDir], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim().split(/\r?\n/).at(-1);

  if (!tarballName) {
    throw new Error("npm pack did not return a tarball name");
  }

  const tarballPath = resolve(tarballDir, tarballName);
  const plan = buildPinchyInstallSmokePlan({ tarballPath, installRoot, workspaceRoot });

  const installOutput = runStep(plan.steps[0]!);
  assertIncludes(installOutput, "added", "npm install output");

  const helpOutput = runStep(plan.steps[1]!);
  assertIncludes(helpOutput, "pinchy doctor", "installed help output");

  const initOutput = runStep(plan.steps[2]!);
  assertIncludes(initOutput, "Initialized workspace", "installed init output");

  for (const path of resolvePinchyInstallSmokeExpectedFiles(workspaceRoot)) {
    if (!existsSync(path)) {
      throw new Error(`Expected initialized workspace file: ${path}`);
    }
  }

  const doctorOutput = runStep(plan.steps[3]!);
  assertIncludes(doctorOutput, "Pinchy doctor", "installed doctor output");
  assertIncludes(doctorOutput, "workspace_init: ok", "installed doctor workspace status");

  const statusOutput = runStep(plan.steps[4]!);
  assertIncludes(statusOutput, "Managed service status", "installed status output");
  assertIncludes(statusOutput, resolve(workspaceRoot, ".pinchy/run/api.log"), "installed status workspace log path");

  log("install smoke test passed");
}

try {
  main();
} catch (error) {
  console.error(`[pinchy-install-smoke] failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
}
