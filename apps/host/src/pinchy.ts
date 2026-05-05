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
import { buildPinchyDoctorReport, summarizePinchyDoctorReport, summarizePinchyDoctorReportJson } from "./pinchy-doctor.js";
import { formatPinchyVersion, summarizeLogs as summarizeLogSections, summarizeLogsJson, summarizeRestartResults, summarizeStatus as summarizeManagedStatus, summarizeStatusJson, summarizeStopResults } from "./pinchy-command-output.js";
import { buildPinchySetupPlan, runPinchySetup, summarizePinchySetupPlan } from "./pinchy-setup.js";
import { parsePinchyCliArgs, PINCHY_CLI_COMMANDS, summarizePinchyCliHelp } from "./pinchy-cli.js";
import { loadPinchyRuntimeConfig } from "./runtime-config.js";
import { parsePinchyConfigCliValue, setPinchyConfigValue } from "./pinchy-config.js";
import { summarizePinchyConfigSet, summarizePinchyConfigView } from "./pinchy-config-cli.js";
import { buildTsxEntrypointCommand, getPinchyPackageRoot, resolvePinchyPackagePath } from "./package-runtime.js";
import { shouldRunAsCliEntry } from "./module-entry.js";

function summarizeStatus(cwd: string, json = false) {
  const inspections = inspectManagedServices(cwd);
  return json ? summarizeStatusJson(inspections) : summarizeManagedStatus(inspections);
}

function readLogTail(path: string, maxChars = 4000) {
  try {
    const text = readFileSync(path, "utf8");
    return text.slice(-maxChars);
  } catch {
    return "";
  }
}

function summarizeLogs(cwd: string, serviceName?: ManagedServiceName, options: { json?: boolean; tailChars?: number } = {}) {
  const names = serviceName ? [serviceName] : buildManagedServiceDefinitions().map((service) => service.name);
  const sections = names.map((name) => {
    const { logPath } = getManagedServiceStatePaths(cwd, name);
    return {
      name,
      logPath,
      content: readLogTail(logPath, options.tailChars),
    };
  });
  return options.json ? summarizeLogsJson(sections) : summarizeLogSections(sections);
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
    case "config": {
      const [action, key, value] = parsed.args;
      if (action === "set") {
        if (!key || value === undefined) {
          throw new Error("Usage: pinchy config set <key> <value>");
        }
        setPinchyConfigValue(cwd, key, parsePinchyConfigCliValue(key, value));
        console.log(summarizePinchyConfigSet(key, value));
        return;
      }
      console.log(summarizePinchyConfigView(loadPinchyRuntimeConfig(cwd)));
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
    case "restart": {
      const stopped = stopManagedServices(cwd);
      const started = buildManagedServiceDefinitions().map((service) => startManagedService(cwd, service));
      await waitForManagedServiceReadiness(buildManagedServiceReadinessChecks());
      console.log(summarizeRestartResults({ stopped, started }));
      return;
    }
    case "status": {
      console.log(summarizeStatus(cwd, parsed.args.includes("--json")));
      return;
    }
    case "logs": {
      const requested = (["api", "worker", "dashboard", "daemon", "discord"].includes(parsed.args[0] ?? "") ? parsed.args[0] : undefined) as ManagedServiceName | undefined;
      const tailIndex = parsed.args.indexOf("--tail");
      const tailChars = tailIndex >= 0 ? Number(parsed.args[tailIndex + 1] ?? "4000") : 4000;
      console.log(summarizeLogs(cwd, requested, { json: parsed.args.includes("--json"), tailChars: Number.isFinite(tailChars) ? tailChars : 4000 }));
      return;
    }
    case "doctor": {
      const report = buildPinchyDoctorReport(cwd);
      console.log(parsed.args.includes("--json") ? summarizePinchyDoctorReportJson(report) : summarizePinchyDoctorReport(report));
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
      await runForegroundEntrypoint(resolvePinchyPackagePath("apps/host/src/pinchy-daemon.ts"), parsed.args);
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
