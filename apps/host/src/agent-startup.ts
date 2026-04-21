import { resolveDashboardShellMode } from "./dashboard-ui.js";

export type AgentStartupSummary = {
  cwd: string;
  dashboardMode: "modern" | "legacy";
  dashboardUrl: string;
  apiBaseUrl: string;
};

export function requiresInteractiveTerminal(
  stdin: Pick<NodeJS.ReadStream, "isTTY"> = process.stdin,
  stdout: Pick<NodeJS.WriteStream, "isTTY"> = process.stdout,
) {
  return Boolean(stdin.isTTY && stdout.isTTY);
}

export function buildAgentStartupSummary(cwd: string, env: NodeJS.ProcessEnv = process.env): AgentStartupSummary {
  const dashboardPort = Number(env.PINCHY_DASHBOARD_PORT ?? 4310);
  const dashboardMode = resolveDashboardShellMode(cwd).kind;
  return {
    cwd,
    dashboardMode,
    dashboardUrl: `http://127.0.0.1:${dashboardPort}`,
    apiBaseUrl: env.PINCHY_API_BASE_URL ?? "http://127.0.0.1:4320",
  };
}

export function formatAgentStartupNotice(summary: AgentStartupSummary) {
  const lines = [
    "[pinchy] Pinchy interactive shell",
    "[pinchy] Pinchy wraps Pi and uses Pi as the execution substrate.",
    `[pinchy] cwd: ${summary.cwd}`,
    `[pinchy] dashboard: ${summary.dashboardUrl} (${summary.dashboardMode})`,
    `[pinchy] api: ${summary.apiBaseUrl}`,
    "[pinchy] This shell won't do anything until you give it a task or prompt.",
    "[pinchy] Try one of these first actions:",
    "[pinchy]   - Tell Pinchy: 'debug the failing dashboard flow'",
    "[pinchy]   - Tell Pinchy: 'implement <feature> with TDD'",
    "[pinchy]   - Run npm run up to boot dashboard/api/worker helpers in the background",
    "[pinchy]   - Run npm run dashboard if you want the local operator UI",
    "[pinchy]   - Run npm run api and npm run worker if you want the persistent control plane active",
    "[pinchy] Handing off to Pi interactive mode...",
  ];
  return `${lines.join("\n")}\n`;
}

export function formatNonInteractiveAgentError() {
  return [
    "[pinchy] npm run agent is an interactive shell and requires a TTY.",
    "[pinchy] Run it in a normal terminal window, or use npm run api / npm run worker / npm run dashboard for non-interactive services.",
  ].join("\n");
}
