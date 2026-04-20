import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export default async function generatedTools(_pi: ExtensionAPI) {
  const dir = resolve(process.cwd(), ".pi/extensions/generated-tools");
  if (!existsSync(dir)) return;

  const files = readdirSync(dir).filter((name) => name.endsWith(".ts") && name !== "index.ts");
  for (const file of files) {
    const modulePath = resolve(dir, file);
    const loaded = await import(modulePath);
    if (typeof loaded.default === "function") {
      await loaded.default(_pi);
    }
  }
}
