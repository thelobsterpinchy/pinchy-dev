import { resolve } from "node:path";

export type PinchyWorkspacePaths = {
  workspaceRoot: string;
  dotPiDir: string;
  runtimeConfigPath: string;
  goalsConfigPath: string;
  watchConfigPath: string;
  runDir: string;
  stateDir: string;
  logsDir: string;
};

export type PinchyUserDataPaths = {
  homeDir: string;
  appSupportDir: string;
  cacheDir: string;
  tmpDir: string;
};

export function resolvePinchyWorkspacePaths(workspaceRoot: string): PinchyWorkspacePaths {
  return {
    workspaceRoot,
    dotPiDir: resolve(workspaceRoot, ".pi"),
    runtimeConfigPath: resolve(workspaceRoot, ".pinchy-runtime.json"),
    goalsConfigPath: resolve(workspaceRoot, ".pinchy-goals.json"),
    watchConfigPath: resolve(workspaceRoot, ".pinchy-watch.json"),
    runDir: resolve(workspaceRoot, ".pinchy/run"),
    stateDir: resolve(workspaceRoot, ".pinchy/state"),
    logsDir: resolve(workspaceRoot, "logs"),
  };
}

export function resolvePinchyUserDataPaths(homeDir: string): PinchyUserDataPaths {
  const appSupportDir = resolve(homeDir, ".pinchy");
  return {
    homeDir,
    appSupportDir,
    cacheDir: resolve(appSupportDir, "cache"),
    tmpDir: resolve(appSupportDir, "tmp"),
  };
}
