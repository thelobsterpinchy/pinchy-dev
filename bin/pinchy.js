#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxPackageJsonPath = require.resolve("tsx/package.json");
const tsxCliPath = resolve(dirname(tsxPackageJsonPath), "dist/cli.mjs");
const entryPath = resolve(packageRoot, "apps/host/src/pinchy.ts");

const child = spawn(process.execPath, [tsxCliPath, entryPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
