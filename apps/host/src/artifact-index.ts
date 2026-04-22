import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type ArtifactRecord = {
  path: string;
  toolName: string;
  createdAt: string;
  mediaType?: string;
  note?: string;
  sessionId?: string;
  runLabel?: string;
  tags?: string[];
};

const INDEX_FILE = "artifacts/index.json";

export function loadArtifactIndex(cwd: string): ArtifactRecord[] {
  const path = resolve(cwd, INDEX_FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ArtifactRecord[];
  } catch {
    return [];
  }
}

export function saveArtifactIndex(cwd: string, records: ArtifactRecord[]) {
  const path = resolve(cwd, INDEX_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(records, null, 2), "utf8");
}

export function appendArtifactRecord(cwd: string, record: ArtifactRecord) {
  const current = loadArtifactIndex(cwd);
  current.push(record);
  saveArtifactIndex(cwd, current);
}

export function filterArtifactIndex(cwd: string, options: { toolName?: string; mediaType?: string; query?: string; tag?: string }) {
  return loadArtifactIndex(cwd).filter((record) => {
    if (options.toolName && record.toolName !== options.toolName) return false;
    if (options.mediaType && record.mediaType !== options.mediaType) return false;
    if (options.query && !(record.path.includes(options.query) || record.note?.includes(options.query) || record.runLabel?.includes(options.query))) return false;
    if (options.tag && !record.tags?.includes(options.tag)) return false;
    return true;
  });
}
