import { existsSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

type LegacyDashboardShell = { kind: "legacy" };
type ModernDashboardShell = { kind: "modern"; root: string; indexPath: string };

export type DashboardShellMode = LegacyDashboardShell | ModernDashboardShell;

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

export function resolveDashboardShellMode(cwd: string): DashboardShellMode {
  const root = resolve(cwd, "apps/dashboard/dist");
  const indexPath = resolve(root, "index.html");
  if (existsSync(indexPath)) {
    return { kind: "modern", root, indexPath };
  }
  return { kind: "legacy" };
}

export function getContentTypeForDashboardAsset(path: string) {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export function resolveDashboardAssetRequest(cwd: string, requestPath: string) {
  const shell = resolveDashboardShellMode(cwd);
  if (shell.kind !== "modern") return undefined;
  const relativePath = requestPath.replace(/^\//, "");
  if (!relativePath || relativePath.includes("..")) return undefined;
  const path = resolve(shell.root, relativePath);
  if (!path.startsWith(shell.root) || !existsSync(path) || !statSync(path).isFile()) return undefined;
  return {
    path,
    contentType: getContentTypeForDashboardAsset(path),
  };
}
