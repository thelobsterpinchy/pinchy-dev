import { detectProjectSignals } from "./project-detection.js";

export function buildStackAwareIterationGuidance(cwd: string) {
  const kinds = new Set(detectProjectSignals(cwd).map((signal) => signal.kind));
  const guidance: string[] = [];

  if (kinds.has("node-package")) {
    guidance.push("For Node/TypeScript code, focus on invalid inputs, async timing, promise rejection paths, and config/env edge cases.");
  }
  if (kinds.has("playwright")) {
    guidance.push("For browser flows, focus on loading states, retries, disabled controls, missing selectors, and network failure handling.");
  }
  if (kinds.has("python-project")) {
    guidance.push("For Python code, focus on None handling, file/path issues, exception boundaries, and fixture coverage.");
  }
  if (kinds.has("rust-project")) {
    guidance.push("For Rust code, focus on Result error paths, boundary conditions, and serialization/deserialization assumptions.");
  }
  if (kinds.has("nx-workspace")) {
    guidance.push("For workspace-level changes, check project graph assumptions, cross-project scripts, and target configuration drift.");
  }

  return guidance;
}
