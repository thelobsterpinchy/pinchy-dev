import type { WatchConfig } from "./watch-config.js";

export const DEFAULT_WATCH_CONFIG: Required<WatchConfig> = {
  watch: ["README.md", "docs", ".pi", "apps", "packages", "services", "scripts"],
  debounceMs: 4000,
  prompt: "A watched Pinchy file changed. Run a bounded maintenance review for the changed area, prefer tests/docs/guardrails, and stop if no safe improvement is needed.",
};
