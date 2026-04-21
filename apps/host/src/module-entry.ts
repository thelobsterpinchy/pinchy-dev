import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

function normalizeEntryPath(pathOrUrl: string) {
  const path = pathOrUrl.startsWith("file://") ? fileURLToPath(pathOrUrl) : pathOrUrl;
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function shouldRunAsCliEntry(moduleUrl: string, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return normalizeEntryPath(moduleUrl) === normalizeEntryPath(argv1);
}
