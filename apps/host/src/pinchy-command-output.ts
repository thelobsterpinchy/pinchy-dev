import type { ManagedServiceInspection } from "./dev-stack.js";

export type LogSection = {
  name: string;
  logPath: string;
  content: string;
};

export type StopResult = {
  name: string;
  status: "stopped";
  pid?: number;
};

export function formatPinchyVersion(version: string) {
  return `[pinchy] version ${version}\n`;
}

export function summarizeStatus(inspections: ManagedServiceInspection[]) {
  const runningCount = inspections.filter((inspection) => inspection.status === "running").length;
  const stoppedCount = inspections.length - runningCount;
  const lines = [
    "[pinchy] Managed service status:",
    `[pinchy] running=${runningCount} stopped=${stoppedCount}`,
    ...inspections.map((inspection) => `[pinchy] ${inspection.name}: ${inspection.status}${inspection.pid ? ` (pid ${inspection.pid})` : ""} log=${inspection.logPath}`),
    "[pinchy] Next steps: pinchy up | pinchy logs dashboard | pinchy agent",
  ];
  return `${lines.join("\n")}\n`;
}

export function summarizeLogs(sections: LogSection[]) {
  return `${sections.map((section) => [`[pinchy] logs: ${section.name} (${section.logPath})`, section.content || "(no log output yet)"].join("\n")).join("\n\n")}\n`;
}

export function summarizeStopResults(results: StopResult[]) {
  const lines = [
    "[pinchy] Stopped managed services:",
    ...results.map((result) => `[pinchy] ${result.name}: ${result.pid ? `stopped (pid ${result.pid})` : "already stopped"}`),
    "[pinchy] Next steps: pinchy status | pinchy up",
  ];
  return `${lines.join("\n")}\n`;
}
