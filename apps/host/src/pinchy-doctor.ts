import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type PinchyDoctorCheckStatus = "ok" | "warn" | "fail";

export type PinchyDoctorCheck = {
  name: string;
  status: PinchyDoctorCheckStatus;
  message: string;
  hint?: string;
};

export type PinchyDoctorReport = {
  cwd: string;
  checks: PinchyDoctorCheck[];
  summary: {
    status: PinchyDoctorCheckStatus;
    failCount: number;
    warnCount: number;
    okCount: number;
  };
};

export type PinchyDoctorDependencies = {
  pathExists?: (path: string) => boolean;
  commandExists?: (command: string) => boolean;
};

function summarizeDoctorStatus(checks: PinchyDoctorCheck[]): PinchyDoctorReport["summary"] {
  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const okCount = checks.filter((check) => check.status === "ok").length;
  return {
    status: failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "ok",
    failCount,
    warnCount,
    okCount,
  };
}

function commandExists(command: string) {
  const result = spawnSync("bash", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

export function buildPinchyDoctorReport(cwd: string, dependencies: PinchyDoctorDependencies = {}): PinchyDoctorReport {
  const pathExists = dependencies.pathExists ?? existsSync;
  const hasCommand = dependencies.commandExists ?? commandExists;

  const checks: PinchyDoctorCheck[] = [];

  const workspaceInitialized = pathExists(resolve(cwd, ".pi/settings.json"));
  checks.push({
    name: "workspace_init",
    status: workspaceInitialized ? "ok" : "fail",
    message: workspaceInitialized ? "Workspace is initialized for Pinchy." : "Workspace is not initialized for Pinchy yet.",
    hint: workspaceInitialized ? undefined : "Run `pinchy init` in this repository.",
  });

  for (const fileName of [".pinchy-runtime.json", ".pinchy-goals.json", ".pinchy-watch.json"]) {
    const exists = pathExists(resolve(cwd, fileName));
    checks.push({
      name: fileName.replace(/^\./, "").replace(/\.json$/, "").replace(/-/g, "_"),
      status: exists ? "ok" : "warn",
      message: exists ? `${fileName} is present.` : `${fileName} is missing; Pinchy can recreate defaults.`,
      hint: exists ? undefined : "Run `pinchy init` to scaffold missing workspace defaults.",
    });
  }

  checks.push({
    name: "git",
    status: hasCommand("git") ? "ok" : "warn",
    message: hasCommand("git") ? "git is available." : "git is not installed or not on PATH.",
    hint: hasCommand("git") ? undefined : "Install Git so Pinchy can work with repository state reliably.",
  });

  checks.push({
    name: "cliclick",
    status: hasCommand("cliclick") ? "ok" : "warn",
    message: hasCommand("cliclick") ? "cliclick is available for richer desktop automation." : "cliclick is not installed; richer desktop click helpers stay limited.",
    hint: hasCommand("cliclick") ? undefined : "Install with `brew install cliclick`.",
  });

  checks.push({
    name: "tesseract",
    status: hasCommand("tesseract") ? "ok" : "warn",
    message: hasCommand("tesseract") ? "tesseract is available for OCR-driven tooling." : "tesseract is not installed; OCR/text-driven flows stay limited.",
    hint: hasCommand("tesseract") ? undefined : "Install with `brew install tesseract`.",
  });

  return {
    cwd,
    checks,
    summary: summarizeDoctorStatus(checks),
  };
}

export function summarizePinchyDoctorReport(report: PinchyDoctorReport) {
  const lines = [
    `[pinchy] Pinchy doctor for ${report.cwd}`,
    `[pinchy] overall: ${report.summary.status} (ok=${report.summary.okCount} warn=${report.summary.warnCount} fail=${report.summary.failCount})`,
    ...report.checks.flatMap((check) => {
      const detail = `[pinchy] ${check.name}: ${check.status} - ${check.message}`;
      return check.hint ? [detail, `[pinchy] hint: ${check.hint}`] : [detail];
    }),
  ];
  return `${lines.join("\n")}\n`;
}
