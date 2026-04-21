import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  buildManagedServiceDefinitions,
  buildManagedServiceReadinessChecks,
  getManagedServiceStatePaths,
  inspectManagedServices,
  startManagedService,
  stopManagedServices,
  summarizeManagedServices,
  waitForManagedServiceReadiness,
  type ManagedServiceName,
} from "./dev-stack.js";
import { formatPinchyInitSummary, initializePinchyWorkspace } from "./pinchy-init.js";
import { buildPinchyDoctorReport, summarizePinchyDoctorReport } from "./pinchy-doctor.js";
import { formatPinchyVersion, summarizeLogs as summarizeLogSections, summarizeStatus as summarizeManagedStatus, summarizeStopResults } from "./pinchy-command-output.js";
import { buildPinchySetupPlan, runPinchySetup, summarizePinchySetupPlan } from "./pinchy-setup.js";
import { parsePinchyCliArgs, PINCHY_CLI_COMMANDS, summarizePinchyCliHelp } from "./pinchy-cli.js";
import { buildTsxEntrypointCommand, getPinchyPackageRoot, resolvePinchyPackagePath } from "./package-runtime.js";
import { shouldRunAsCliEntry } from "./module-entry.js";

function summarizeStatus(cwd: string) {
  return summarizeManagedStatus(inspectManagedServices(cwd));
}

function readLogTail(path: string, maxChars = 4000) {
  try {
    const text = readFileSync(path, "utf8");
    return text.slice(-maxChars);
  } catch {
    return "";
  }
}

function summarizeLogs(cwd: string, serviceName?: ManagedServiceName) {
  const names = serviceName ? [serviceName] : buildManagedServiceDefinitions().map((service) => service.name);
  return summarizeLogSections(names.map((name) => {
    const { logPath } = getManagedServiceStatePaths(cwd, name);
    return {
      name,
      logPath,
      content: readLogTail(logPath),
    };
  }));
}

async function runForegroundEntrypoint(entryPath: string, args: string[] = []) {
  const command = buildTsxEntrypointCommand(entryPath, args);
  const child = spawn(command.command, command.args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
}

export async function runPinchyCli(argv = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env) {
  const cwd = env.PINCHY_CWD ?? process.cwd();
  const parsed = parsePinchyCliArgs(argv);

  if (parsed.error) {
    console.error(`[pinchy] ${parsed.error}`);
  }

  switch (parsed.command) {
    case "help": {
      console.log(summarizePinchyCliHelp(PINCHY_CLI_COMMANDS));
      return;
    }
    case "init": {
      const plan = initializePinchyWorkspace(cwd, getPinchyPackageRoot());
      console.log(formatPinchyInitSummary(cwd, plan));
      return;
    }
    case "setup": {
      const plan = buildPinchySetupPlan();
      console.log(summarizePinchySetupPlan(plan));
      runPinchySetup(plan);
      return;
    }
    case "version": {
      const packageJson = JSON.parse(readFileSync(resolvePinchyPackagePath("package.json"), "utf8")) as { version: string };
      console.log(formatPinchyVersion(packageJson.version));
      return;
    }
    case "up": {
      const results = buildManagedServiceDefinitions().map((service) => startManagedService(cwd, service));
      await waitForManagedServiceReadiness(buildManagedServiceReadinessChecks());
      console.log(summarizeManagedServices(results));
      return;
    }
    case "down": {
      console.log(summarizeStopResults(stopManagedServices(cwd)));
      return;
    }
    case "status": {
      console.log(summarizeStatus(cwd));
      return;
    }
    case "logs": {
      const requested = parsed.args[0] as ManagedServiceName | undefined;
      console.log(summarizeLogs(cwd, requested));
      return;
    }
    case "doctor": {
      console.log(summarizePinchyDoctorReport(buildPinchyDoctorReport(cwd)));
      return;
    }
    case "dashboard": {
      await runForegroundEntrypoint(resolvePinchyPackagePath("apps/host/src/dashboard.ts"), parsed.args);
      return;
    }
    case "api": {
      await runForegroundEntrypoint(resolvePinchyPackagePath("apps/api/src/server.ts"), parsed.args);
      return;
    }
    case "worker": {
      await runForegroundEntrypoint(resolvePinchyPackagePath("services/agent-worker/src/worker.ts"), parsed.args);
      return;
    }
    case "daemon": {
      await runForegroundEntrypoint(resolvePinchyPackagePath("apps/host/src/daemon.ts"), parsed.args);
      return;
    }
    case "agent": {
      await runForegroundEntrypoint(resolvePinchyPackagePath("apps/host/src/main.ts"), parsed.args);
      return;
    }
    case "smoke": {
      await runForegroundEntrypoint(resolvePinchyPackagePath("scripts/dashboard-smoke.ts"), parsed.args);
      return;
    }
    default: {
      console.log(summarizePinchyCliHelp(PINCHY_CLI_COMMANDS));
    }
  }
}

if (shouldRunAsCliEntry(import.meta.url)) {
  void runPinchyCli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
