import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const INDEX_FILE = ".pi/extensions/generated-tools/.index";

export function loadGeneratedToolRegistry(cwd: string) {
  const path = resolve(cwd, INDEX_FILE);
  if (!existsSync(path)) return [] as string[];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
