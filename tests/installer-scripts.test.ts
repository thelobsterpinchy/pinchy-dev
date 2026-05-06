import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellInstaller = readFileSync("scripts/install.sh", "utf8");
const powershellInstaller = readFileSync("scripts/install.ps1", "utf8");
const readme = readFileSync("README.md", "utf8");
const localRuntime = readFileSync("docs/LOCAL_RUNTIME.md", "utf8");

test("Unix installer uses a local Pinchy prefix and explicit PATH guidance", () => {
  assert.match(shellInstaller, /PINCHY_PREFIX:-\$HOME\/\.pinchy/);
  assert.match(shellInstaller, /npm install --global --prefix/);
  assert.match(shellInstaller, /PATH_LINE="export PATH=/);
  assert.match(shellInstaller, /--update-shell/);
  assert.match(shellInstaller, /pinchy doctor/);
  assert.doesNotMatch(shellInstaller, /`pinchy`/);
});

test("PowerShell installer uses a local Pinchy prefix and user PATH guidance", () => {
  assert.match(powershellInstaller, /\$env:USERPROFILE[^\n]+\.pinchy/);
  assert.match(powershellInstaller, /"install", "--global", "--prefix"/);
  assert.match(powershellInstaller, /\[Environment\]::SetEnvironmentVariable/);
  assert.match(powershellInstaller, /-UpdatePath/);
  assert.match(powershellInstaller, /pinchy doctor/);
});

test("install docs present script installer first and npm as the manual fallback", () => {
  assert.match(readme, /curl -fsSL https:\/\/raw\.githubusercontent\.com\/pinchy-dev\/pinchy-dev\/main\/scripts\/install\.sh \| bash/);
  assert.match(readme, /npm install -g pinchy-dev/);
  assert.match(localRuntime, /Recommended installer/);
  assert.match(localRuntime, /Manual npm fallback/);
});
