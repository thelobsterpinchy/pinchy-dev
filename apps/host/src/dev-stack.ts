import { mkdirSync, readFileSync, writeFileSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:4320";
const DEFAULT_DASHBOARD_BASE_URL = "http://127.0.0.1:4310";

export type ManagedServiceName = "api" | "worker" | "dashboard";
export type ManagedServiceStatus = "started" | "already_running";

export type ManagedServiceDefinition = {
  name: ManagedServiceName;
  command: string;
  args: string[];
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

export function buildManagedServiceDefinitions(): ManagedServiceDefinition[] {
  return [
    { name: "api", command: "npm", args: ["run", "api"] },
    { name: "worker", command: "npm", args: ["run", "worker"] },
    { name: "dashboard", command: "npm", args: ["run", "dashboard"] },
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

export function startManagedServices(cwd: string, definitions = buildManagedServiceDefinitions()) {
  return definitions.map((service) => startManagedService(cwd, service));
}

export function startManagedService(cwd: string, service: ManagedServiceDefinition): ManagedServiceStartResult {
  const { pidPath, logPath } = getManagedServiceStatePaths(cwd, service.name);
  mkdirSync(dirname(pidPath), { recursive: true });

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
    env: process.env,
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

export function summarizeManagedServices(results: ManagedServiceStartResult[]) {
  const lines = [
    "[pinchy] Started Pinchy local stack helpers:",
    ...results.map((result) => `[pinchy] ${result.name}: ${result.status} (pid ${result.pid}) log=${result.logPath}`),
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
