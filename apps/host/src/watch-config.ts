import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type WatchConfig = {
  watch?: string[];
  debounceMs?: number;
  prompt?: string;
};

const FILE = ".pinchy-watch.json";

export function loadWatchConfig(cwd: string): Required<WatchConfig> {
  const fallback: Required<WatchConfig> = {
    watch: ["README.md", "docs", ".pi", "apps/host/src"],
    debounceMs: 4000,
    prompt: "A watched Pinchy file changed. Run a safe bounded maintenance review for the changed area.",
  };

  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return fallback;

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as WatchConfig;
    return {
      watch: parsed.watch?.length ? parsed.watch : fallback.watch,
      debounceMs: typeof parsed.debounceMs === "number" && parsed.debounceMs > 0 ? parsed.debounceMs : fallback.debounceMs,
      prompt: parsed.prompt?.trim() ? parsed.prompt : fallback.prompt,
    };
  } catch {
    return fallback;
  }
}
