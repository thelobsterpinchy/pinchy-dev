import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadGeneratedToolSource(cwd: string, name: string) {
  const safeName = name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const path = resolve(cwd, ".pi/extensions/generated-tools", `${safeName}.ts`);
  if (!existsSync(path)) return undefined;
  return {
    path,
    source: readFileSync(path, "utf8"),
  };
}
