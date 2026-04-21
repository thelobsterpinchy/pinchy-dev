import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function getPinchyPackageRoot() {
  return packageRoot;
}

export function resolvePinchyPackagePath(...segments: string[]) {
  return resolve(packageRoot, ...segments);
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
