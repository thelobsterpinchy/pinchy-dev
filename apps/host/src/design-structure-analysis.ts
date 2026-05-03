import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { diagnoseDesignSmells } from "./design-diagnosis.js";
import type { DesignAntiPatternCard } from "./design-anti-patterns.js";
import type { DesignPatternCard } from "./design-patterns.js";

export type DesignStructureAnalysis = {
  filePath: string;
  summary: string;
  evidence: string[];
  antiPatterns: DesignAntiPatternCard[];
  patterns: DesignPatternCard[];
};

function countMatches(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

function collectHeuristicEvidence(source: string) {
  const evidence: string[] = [];
  const lowerSource = source.toLowerCase();

  if (/container\.(get|resolve)\(/i.test(source) || /serviceLocator|getService\(/i.test(source)) {
    evidence.push("Hidden dependency lookups suggest Service Locator.");
  }

  const ifCount = countMatches(source, /\bif\s*\(/g);
  if (ifCount >= 4) {
    evidence.push(`Found ${ifCount} if-branches, which can indicate branching-heavy behavior selection.`);
  }

  const methodLikeCount = countMatches(source, /^\s*(public |private |protected |async )?[a-zA-Z_$][\w$]*\s*\([^)]*\)\s*\{/gm);
  if (methodLikeCount >= 8) {
    evidence.push(`Found ${methodLikeCount} method-like blocks, which can indicate a growing God Object.`);
  }

  const constructorMatch = source.match(/constructor\s*\(([^)]*)\)/s);
  const constructorParams = constructorMatch?.[1].split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (constructorParams.length >= 6) {
    evidence.push(`Constructor has ${constructorParams.length} parameters, which suggests Long Parameter List.`);
  }

  if (/\bnew\s+[A-Z][A-Za-z0-9_]+\(/.test(source) && /(client|logger|queue|store|service|repository)/i.test(lowerSource)) {
    evidence.push("Direct construction of collaborators may indicate Tight Coupling.");
  }

  if (/"(queued|running|failed|completed|waiting_for_human|debug|safe|fast|slow)"/.test(source)) {
    evidence.push("Repeated semantic string literals may indicate Magic Numbers and Strings / Primitive Obsession.");
  }

  return evidence;
}

function buildHeuristicQuery(evidence: string[], source: string) {
  const phrases: string[] = [];
  if (evidence.some((item) => item.includes("Service Locator"))) phrases.push("global service locator hidden dependencies");
  if (evidence.some((item) => item.includes("God Object"))) phrases.push("one giant class knows everything and keeps growing");
  if (evidence.some((item) => item.includes("Long Parameter List"))) phrases.push("long constructor parameter list");
  if (evidence.some((item) => item.includes("branching-heavy"))) phrases.push("too many if else branches choosing behavior");
  if (evidence.some((item) => item.includes("Tight Coupling"))) phrases.push("classes create collaborators internally and are tightly coupled");
  if (evidence.some((item) => item.includes("Primitive Obsession"))) phrases.push("primitive obsession and magic strings");
  if (phrases.length === 0) {
    const preview = source.replace(/\s+/g, " ").slice(0, 300);
    phrases.push(preview);
  }
  return phrases.join("; ");
}

export function analyzeDesignStructure(cwd: string, options: { path: string; maxResults?: number }): DesignStructureAnalysis {
  const maxResults = Math.max(1, Math.min(options.maxResults ?? 5, 10));
  const absolutePath = resolve(cwd, options.path);
  if (!existsSync(absolutePath)) {
    return {
      filePath: options.path,
      summary: `File not found: ${options.path}`,
      evidence: [],
      antiPatterns: [],
      patterns: [],
    };
  }

  const source = readFileSync(absolutePath, "utf8");
  const evidence = collectHeuristicEvidence(source);
  if (evidence.length === 0) {
    return {
      filePath: options.path,
      summary: "No strong anti-pattern heuristics matched this file. Consider using broader design review judgment.",
      evidence,
      antiPatterns: [],
      patterns: [],
    };
  }

  const diagnosis = diagnoseDesignSmells(cwd, buildHeuristicQuery(evidence, source), maxResults);
  return {
    filePath: options.path,
    summary: `Detected ${diagnosis.antiPatterns.length} likely anti-patterns and ${diagnosis.patterns.length} candidate replacement patterns from local heuristics.`,
    evidence,
    antiPatterns: diagnosis.antiPatterns,
    patterns: diagnosis.patterns,
  };
}
