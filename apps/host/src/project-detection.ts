import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ProjectSignal = {
  kind: string;
  path: string;
};

export type ValidationPlan = {
  command: string;
  reason: string;
  signals: ProjectSignal[];
};

function safeReadJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function detectProjectSignals(cwd: string): ProjectSignal[] {
  const candidates: Array<[string, string]> = [
    ["package.json", "node-package"],
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm-lock"],
    ["yarn.lock", "yarn"],
    ["pytest.ini", "pytest"],
    ["pyproject.toml", "python-project"],
    ["Cargo.toml", "rust-project"],
    ["nx.json", "nx-workspace"],
    ["playwright.config.ts", "playwright"],
    ["vitest.config.ts", "vitest"],
    ["jest.config.ts", "jest"],
  ];

  return candidates
    .map(([relativePath, kind]) => ({ kind, path: relativePath, exists: existsSync(resolve(cwd, relativePath)) }))
    .filter((entry) => entry.exists)
    .map(({ kind, path }) => ({ kind, path }));
}

export function detectValidationPlan(cwd: string): ValidationPlan {
  const signals = detectProjectSignals(cwd);
  const packageJsonPath = resolve(cwd, "package.json");
  const packageJson = existsSync(packageJsonPath) ? safeReadJson(packageJsonPath) as { scripts?: Record<string, string> } : undefined;
  const scripts = packageJson?.scripts ?? {};

  if (scripts.test) {
    const packageManager = existsSync(resolve(cwd, "pnpm-lock.yaml"))
      ? "pnpm"
      : existsSync(resolve(cwd, "yarn.lock"))
        ? "yarn"
        : "npm";
    return {
      command: `${packageManager} test`,
      reason: `Detected package.json test script and ${packageManager} project markers.`,
      signals,
    };
  }

  if (scripts["test:ci"]) {
    return {
      command: "npm run test:ci",
      reason: "Detected package.json test:ci script.",
      signals,
    };
  }

  if (existsSync(resolve(cwd, "pytest.ini")) || existsSync(resolve(cwd, "pyproject.toml"))) {
    return {
      command: "pytest",
      reason: "Detected Python project configuration.",
      signals,
    };
  }

  if (existsSync(resolve(cwd, "Cargo.toml"))) {
    return {
      command: "cargo test",
      reason: "Detected Cargo.toml.",
      signals,
    };
  }

  return {
    command: process.env.PINCHY_TEST_COMMAND ?? "npm test",
    reason: "Using fallback validation command. Override with PINCHY_TEST_COMMAND if needed.",
    signals,
  };
}
