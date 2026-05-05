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

export type RestartSummaryInput = {
  stopped: StopResult[];
  started: Array<{ name: string; status: "started" | "already_running" | "disabled"; pid: number; logPath: string }>;
};

export function formatPinchyVersion(version: string) {
  return `[pinchy] version ${version}\n`;
}

export function summarizeStatusJson(inspections: ManagedServiceInspection[]) {
  return `${JSON.stringify({ services: inspections }, null, 2)}\n`;
}

export function summarizeStatus(inspections: ManagedServiceInspection[]) {
  const runningCount = inspections.filter((inspection) => inspection.status === "running").length;
  const disabledCount = inspections.filter((inspection) => inspection.status === "disabled").length;
  const stoppedCount = inspections.length - runningCount - disabledCount;
  const lines = [
    "[pinchy] Managed service status:",
    `[pinchy] running=${runningCount} stopped=${stoppedCount} disabled=${disabledCount}`,
    ...inspections.map((inspection) => `[pinchy] ${inspection.name}: ${inspection.status}${inspection.pid ? ` (pid ${inspection.pid})` : ""} log=${inspection.logPath}`),
    "[pinchy] Next steps: pinchy up | pinchy logs dashboard | pinchy agent",
  ];
  return `${lines.join("\n")}\n`;
}

export function summarizeLogsJson(sections: LogSection[]) {
  return `${JSON.stringify({ sections }, null, 2)}\n`;
}

export function summarizeLogs(sections: LogSection[]) {
  return `${sections.map((section) => [`[pinchy] logs: ${section.name} (${section.logPath})`, section.content || "(no log output yet)"].join("\n")).join("\n\n")}\n`;
}

export function summarizeRestartResults(result: RestartSummaryInput) {
  const lines = [
    "[pinchy] Restarted managed services:",
    ...result.started.map((entry) => {
      if (entry.status === "disabled") {
        return `[pinchy] ${entry.name}: disabled log=${entry.logPath}`;
      }
      const stopped = result.stopped.find((candidate) => candidate.name === entry.name);
      const previous = stopped?.pid ? `replaced pid ${stopped.pid}` : "was not running";
      return `[pinchy] ${entry.name}: restarted (pid ${entry.pid}) ${previous} log=${entry.logPath}`;
    }),
    "[pinchy] Next steps: pinchy status | pinchy logs dashboard | pinchy agent",
  ];
  return `${lines.join("\n")}\n`;
}

export function summarizeStopResults(results: StopResult[]) {
  const lines = [
    "[pinchy] Stopped managed services:",
    ...results.map((result) => `[pinchy] ${result.name}: ${result.pid ? `stopped (pid ${result.pid})` : "already stopped"}`),
    "[pinchy] Next steps: pinchy status | pinchy up",
  ];
  return `${lines.join("\n")}\n`;
}
