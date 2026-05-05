import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

type ReleaseStep = {
  name: string;
  args: string[];
};

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCache = process.env.PINCHY_RELEASE_NPM_CACHE?.trim() || mkdtempSync(join(tmpdir(), "pinchy-release-npm-cache-"));

const steps: ReleaseStep[] = [
  { name: "type check", args: ["run", "check"] },
  { name: "test suite", args: ["test"] },
  { name: "dashboard build", args: ["run", "dashboard:build"] },
  { name: "pack dry run", args: ["pack", "--dry-run"] },
  { name: "packaged install smoke", args: ["run", "pinchy:install-smoke"] },
];

function runStep(step: ReleaseStep) {
  console.log(`[release:verify] ${step.name}`);
  const result = spawnSync(npmCommand, step.args, {
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_cache: npmCache,
      NPM_CONFIG_CACHE: npmCache,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`[release:verify] npm cache: ${npmCache}`);
for (const step of steps) {
  runStep(step);
}
console.log("[release:verify] release validation passed");
