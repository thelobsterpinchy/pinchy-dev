import { loadRunContext } from "./run-context.js";

export function buildArtifactMetadata(cwd: string, toolName: string, note?: string, tags?: string[]) {
  const run = loadRunContext(cwd);
  return {
    toolName,
    createdAt: new Date().toISOString(),
    note,
    runLabel: run?.currentRunLabel,
    sessionId: run?.currentRunId,
    tags,
  };
}

export function mergeArtifactTags(...groups: Array<Array<string | undefined> | undefined>) {
  const set = new Set<string>();
  for (const group of groups) {
    for (const item of group ?? []) {
      if (item) set.add(item);
    }
  }
  return Array.from(set);
}
