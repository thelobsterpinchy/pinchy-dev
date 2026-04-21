import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDashboardAssetRequest, resolveDashboardShellMode } from "../apps/host/src/dashboard-ui.js";

test("resolveDashboardShellMode prefers built React assets when index.html exists", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-dashboard-ui-"));
  const distDir = join(cwd, "apps/dashboard/dist/assets");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(cwd, "apps/dashboard/dist/index.html"), "<html></html>");

  const mode = resolveDashboardShellMode(cwd);

  assert.deepEqual(mode, {
    kind: "modern",
    root: join(cwd, "apps/dashboard/dist"),
    indexPath: join(cwd, "apps/dashboard/dist/index.html"),
  });
});

test("resolveDashboardShellMode falls back to legacy HTML when built assets are absent", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-dashboard-ui-legacy-"));

  const mode = resolveDashboardShellMode(cwd);

  assert.deepEqual(mode, { kind: "legacy" });
});

test("resolveDashboardAssetRequest returns static asset paths inside the built dashboard root", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-dashboard-ui-asset-"));
  const distDir = join(cwd, "apps/dashboard/dist/assets");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(cwd, "apps/dashboard/dist/index.html"), "<html></html>");
  writeFileSync(join(distDir, "main.js"), "console.log('ok')");

  const resolved = resolveDashboardAssetRequest(cwd, "/assets/main.js");

  assert.equal(resolved?.path, join(distDir, "main.js"));
  assert.equal(resolved?.contentType, "application/javascript; charset=utf-8");
});


test("resolveDashboardAssetRequest rejects paths outside the built dashboard root", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-dashboard-ui-safe-"));
  const distDir = join(cwd, "apps/dashboard/dist/assets");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(cwd, "apps/dashboard/dist/index.html"), "<html></html>");

  assert.equal(resolveDashboardAssetRequest(cwd, "/../package.json"), undefined);
});

test("resolveDashboardAssetRequest rejects directory paths inside the built dashboard root", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-dashboard-ui-dir-"));
  const distDir = join(cwd, "apps/dashboard/dist/assets");
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(cwd, "apps/dashboard/dist/index.html"), "<html></html>");

  assert.equal(resolveDashboardAssetRequest(cwd, "/assets"), undefined);
});
