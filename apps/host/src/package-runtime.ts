import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function isPinchyPackageRoot(candidateRoot: string) {
  const packageJsonPath = resolve(candidateRoot, "package.json");
  const cliEntryPath = resolve(candidateRoot, "apps/host/src/pinchy.ts");
  if (!existsSync(packageJsonPath) || !existsSync(cliEntryPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string };
    return packageJson.name === "pinchy-dev";
  } catch {
    return false;
  }
}

export function getPinchyPackageRoot(preferredCwd = process.cwd()) {
  const candidateRoot = resolve(preferredCwd);
  return isPinchyPackageRoot(candidateRoot) ? candidateRoot : packageRoot;
}

export function resolvePinchyPackagePath(relativePath: string, preferredCwd = process.cwd()) {
  return resolve(getPinchyPackageRoot(preferredCwd), relativePath);
}

export function resolveTsxCliPath() {
  const tsxPackageJsonPath = require.resolve("tsx/package.json");
  return resolve(dirname(tsxPackageJsonPath), "dist/cli.mjs");
}

export function buildTsxEntrypointCommand(entryPath: string, args: string[] = []) {
  return {
    command: process.execPath,
    args: [resolveTsxCliPath(), entryPath, ...args],
  };
}
