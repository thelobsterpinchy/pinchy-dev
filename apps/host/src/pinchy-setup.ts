import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { getPinchyPackageRoot } from "./package-runtime.js";

export type PinchySetupStep = {
  label: string;
  command: string;
  args: string[];
};

export type PinchySetupOptionalCheck = {
  name: string;
  status: "ok" | "warn";
  hint?: string;
};

export type PinchySetupPlan = {
  steps: PinchySetupStep[];
  optionalChecks: PinchySetupOptionalCheck[];
};

function commandExists(command: string) {
  const result = spawnSync("bash", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

export function resolvePlaywrightInstallCommand(packageRoot = getPinchyPackageRoot()) {
  return {
    command: resolve(dirname(packageRoot), ".bin", "playwright"),
    args: ["install", "chromium"],
  };
}

function hasLocalModelSupport(hasCommand: (command: string) => boolean) {
  return hasCommand("ollama") || hasCommand("lmstudio") || hasCommand("lms");
}

export function buildPinchySetupPlan(input: {
  playwrightCommand?: { command: string; args: string[] };
  commandExists?: (command: string) => boolean;
} = {}): PinchySetupPlan {
  const hasCommand = input.commandExists ?? commandExists;
  const playwrightCommand = input.playwrightCommand ?? resolvePlaywrightInstallCommand();
  return {
    steps: [
      {
        label: "Install Playwright Chromium",
        command: playwrightCommand.command,
        args: playwrightCommand.args,
      },
    ],
    optionalChecks: [
      { name: "git", status: hasCommand("git") ? "ok" : "warn", hint: hasCommand("git") ? undefined : "Install Git." },
      { name: "cliclick", status: hasCommand("cliclick") ? "ok" : "warn", hint: hasCommand("cliclick") ? undefined : "brew install cliclick" },
      { name: "tesseract", status: hasCommand("tesseract") ? "ok" : "warn", hint: hasCommand("tesseract") ? undefined : "brew install tesseract" },
      { name: "local_models", status: hasLocalModelSupport(hasCommand) ? "ok" : "warn", hint: hasLocalModelSupport(hasCommand) ? undefined : "Install or start Ollama / LM Studio." },
    ],
  };
}

export function summarizePinchySetupPlan(plan: PinchySetupPlan) {
  const lines = [
    "[pinchy] Setup plan:",
    ...plan.steps.map((step) => `[pinchy] ${step.label}: ${step.command} ${step.args.join(" ")}`),
    "[pinchy] Optional local tools:",
    ...plan.optionalChecks.map((check) => `[pinchy] ${check.name}: ${check.status}${check.hint ? ` (${check.hint})` : ""}`),
    "[pinchy] Next steps: pinchy doctor | pinchy up | pinchy agent",
  ];
  return `${lines.join("\n")}\n`;
}

export function runPinchySetup(plan: PinchySetupPlan) {
  for (const step of plan.steps) {
    const result = spawnSync(step.command, step.args, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (result.status !== 0) {
      throw new Error(`Setup step failed: ${step.label}`);
    }
  }
}
