import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_WATCH_CONFIG } from "./watch-config-defaults.js";

export type WatchConfig = {
  watch?: string[];
  debounceMs?: number;
  prompt?: string;
};

const FILE = ".pinchy-watch.json";

function cloneWatchConfig(config: Required<WatchConfig>): Required<WatchConfig> {
  return {
    watch: [...config.watch],
    debounceMs: config.debounceMs,
    prompt: config.prompt,
  };
}

export function loadWatchConfig(cwd: string): Required<WatchConfig> {
  const fallback = DEFAULT_WATCH_CONFIG;

  const path = resolve(cwd, FILE);
  if (!existsSync(path)) return cloneWatchConfig(fallback);

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as WatchConfig;
    const watch = Array.isArray(parsed.watch)
      ? parsed.watch
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
      : undefined;
    const prompt = parsed.prompt?.trim();

    return {
      watch: watch?.length ? watch : [...fallback.watch],
      debounceMs: typeof parsed.debounceMs === "number" && parsed.debounceMs > 0 ? parsed.debounceMs : fallback.debounceMs,
      prompt: prompt ? prompt : fallback.prompt,
    };
  } catch {
    return cloneWatchConfig(fallback);
  }
}
