import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { analyzeDesignStructure, type DesignStructureAnalysis } from "./design-structure-analysis.js";

export type DesignRepoScanResult = {
  summary: string;
  files: DesignStructureAnalysis[];
};

const CODE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", ".git", "dist", "build", "coverage", "artifacts"]);

function walkCodeFiles(root: string, current: string, results: string[]) {
  if (!existsSync(current)) return;
  const stat = statSync(current);
  if (stat.isDirectory()) {
    if (IGNORED_DIRECTORY_NAMES.has(current.split(/[/\\]/).at(-1) ?? "")) return;
    for (const entry of readdirSync(current)) {
      walkCodeFiles(root, join(current, entry), results);
    }
    return;
  }
  if (CODE_FILE_PATTERN.test(current)) {
    results.push(relative(root, current));
  }
}

function scoreAnalysis(analysis: DesignStructureAnalysis) {
  return analysis.evidence.length * 5 + analysis.antiPatterns.length * 10 + analysis.patterns.length;
}

export function scanRepositoryDesignStructure(
  cwd: string,
  options: { include?: string[]; maxFiles?: number; maxResultsPerFile?: number } = {},
): DesignRepoScanResult {
  const includePaths = options.include && options.include.length > 0 ? options.include : ["."];
  const filePaths: string[] = [];
  for (const includePath of includePaths) {
    walkCodeFiles(cwd, resolve(cwd, includePath), filePaths);
  }

  const analyses = filePaths
    .map((filePath) => analyzeDesignStructure(cwd, { path: filePath, maxResults: options.maxResultsPerFile ?? 3 }))
    .filter((analysis) => analysis.evidence.length > 0)
    .sort((left, right) => scoreAnalysis(right) - scoreAnalysis(left) || left.filePath.localeCompare(right.filePath))
    .slice(0, Math.max(1, Math.min(options.maxFiles ?? 10, 50)));

  return {
    summary: `Scanned ${filePaths.length} code files and found ${analyses.length} structurally suspicious files with heuristic evidence.`,
    files: analyses,
  };
}
