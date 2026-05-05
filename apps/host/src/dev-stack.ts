import { mkdirSync, readFileSync, rmSync, writeFileSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { buildTsxEntrypointCommand, resolvePinchyPackagePath } from "./package-runtime.js";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:4320";
const DEFAULT_DASHBOARD_BASE_URL = "http://127.0.0.1:4310";

export type ManagedServiceName = "api" | "worker" | "dashboard" | "daemon" | "discord";
export type ManagedServiceStatus = "started" | "already_running" | "disabled";

export type ManagedServiceDefinition = {
  name: ManagedServiceName;
  command: string;
  args: string[];
  enabled?: boolean;
};

export type ManagedServiceStartResult = {
  name: ManagedServiceName;
  status: ManagedServiceStatus;
  pid: number;
  logPath: string;
};

export type ManagedServiceReadinessCheck = {
  name: Exclude<ManagedServiceName, "worker">;
  url: string;
};

export function buildManagedServiceDefinitions(env: NodeJS.ProcessEnv = process.env): ManagedServiceDefinition[] {
  const api = buildTsxEntrypointCommand(resolvePinchyPackagePath("apps/api/src/server.ts"));
  const worker = buildTsxEntrypointCommand(resolvePinchyPackagePath("services/agent-worker/src/worker.ts"));
  const dashboard = buildTsxEntrypointCommand(resolvePinchyPackagePath("apps/host/src/dashboard.ts"));
  const daemon = buildTsxEntrypointCommand(resolvePinchyPackagePath("apps/host/src/pinchy-daemon.ts"));
  const discord = buildTsxEntrypointCommand(resolvePinchyPackagePath("services/discord-gateway/gateway.ts"));
  return [
    { name: "api", command: api.command, args: api.args },
    { name: "worker", command: worker.command, args: worker.args },
    { name: "dashboard", command: dashboard.command, args: dashboard.args },
    { name: "daemon", command: daemon.command, args: daemon.args },
    { name: "discord", command: discord.command, args: discord.args, enabled: Boolean(env.PINCHY_DISCORD_BOT_TOKEN) },
  ];
}

export function getManagedServiceStatePaths(cwd: string, name: ManagedServiceName) {
  const base = resolve(cwd, ".pinchy/run");
  return {
    pidPath: resolve(base, `${name}.pid`),
    logPath: resolve(base, `${name}.log`),
  };
}

export function isManagedServicePidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readStoredPid(pidPath: string) {
  try {
    const raw = readFileSync(pidPath, "utf8").trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  } catch {
    return undefined;
  }
}

export function startManagedServices(cwd: string, definitions = buildManagedServiceDefinitions(), env: NodeJS.ProcessEnv = process.env) {
  return definitions.map((service) => startManagedService(cwd, service, env));
}

export function startManagedService(cwd: string, service: ManagedServiceDefinition, env: NodeJS.ProcessEnv = process.env): ManagedServiceStartResult {
  const { pidPath, logPath } = getManagedServiceStatePaths(cwd, service.name);
  mkdirSync(dirname(pidPath), { recursive: true });

  if (service.enabled === false) {
    rmSync(pidPath, { force: true });
    return {
      name: service.name,
      status: "disabled",
      pid: -1,
      logPath,
    };
  }

  const storedPid = readStoredPid(pidPath);
  if (storedPid && isManagedServicePidAlive(storedPid)) {
    return {
      name: service.name,
      status: "already_running",
      pid: storedPid,
      logPath,
    };
  }

  const logFd = openSync(logPath, "a");
  const child = spawn(service.command, service.args, {
    cwd,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  });
  child.unref();
  writeFileSync(pidPath, `${child.pid}\n`, "utf8");

  return {
    name: service.name,
    status: "started",
    pid: child.pid ?? -1,
    logPath,
  };
}

export function buildManagedServiceReadinessChecks() {
  return [
    { name: "api", url: `${process.env.PINCHY_API_BASE_URL ?? DEFAULT_API_BASE_URL}/health` },
    { name: "dashboard", url: `${process.env.PINCHY_DASHBOARD_BASE_URL ?? DEFAULT_DASHBOARD_BASE_URL}/` },
  ] satisfies ManagedServiceReadinessCheck[];
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isUrlReady(url: string) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

export async function waitForManagedServiceReadiness(checks = buildManagedServiceReadinessChecks(), timeoutMs = 5000) {
  const startedAt = Date.now();
  for (const check of checks) {
    while (Date.now() - startedAt < timeoutMs) {
      if (await isUrlReady(check.url)) break;
      await sleep(150);
    }
  }
}

export type ManagedServiceObservedStatus = ManagedServiceName | "missing";

export type ManagedServiceInspection = {
  name: ManagedServiceName;
  status: "running" | "stopped" | "disabled";
  pid?: number;
  logPath: string;
};

export function stopManagedService(cwd: string, name: ManagedServiceName) {
  const { pidPath } = getManagedServiceStatePaths(cwd, name);
  const storedPid = readStoredPid(pidPath);
  if (!storedPid || !isManagedServicePidAlive(storedPid)) {
    rmSync(pidPath, { force: true });
    return { name, status: "stopped" as const, pid: storedPid };
  }
  try {
    process.kill(storedPid, "SIGTERM");
  } catch {
    // best effort shutdown
  }
  rmSync(pidPath, { force: true });
  return { name, status: "stopped" as const, pid: storedPid };
}

export function stopManagedServices(cwd: string, definitions = buildManagedServiceDefinitions()) {
  return definitions.map((service) => stopManagedService(cwd, service.name));
}

export function inspectManagedServices(cwd: string, definitions = buildManagedServiceDefinitions()): ManagedServiceInspection[] {
  return definitions.map((service) => {
    const { pidPath, logPath } = getManagedServiceStatePaths(cwd, service.name);
    const pid = readStoredPid(pidPath);
    if (service.enabled === false) {
      return {
        name: service.name,
        status: "disabled",
        pid,
        logPath,
      };
    }
    return {
      name: service.name,
      status: pid && isManagedServicePidAlive(pid) ? "running" : "stopped",
      pid,
      logPath,
    };
  });
}

export function summarizeManagedServices(results: ManagedServiceStartResult[]) {
  const lines = [
    "[pinchy] Started Pinchy local stack helpers:",
    ...results.map((result) => result.status === "disabled"
      ? `[pinchy] ${result.name}: disabled (set PINCHY_DISCORD_BOT_TOKEN to enable) log=${result.logPath}`
      : `[pinchy] ${result.name}: ${result.status} (pid ${result.pid}) log=${result.logPath}`),
    "[pinchy] Use npm run agent in this terminal for the interactive shell.",
  ];
  return `${lines.join("\n")}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cwd = process.env.PINCHY_CWD ?? process.cwd();
  const results = startManagedServices(cwd);
  void waitForManagedServiceReadiness().finally(() => {
    console.log(summarizeManagedServices(results));
  });
}
