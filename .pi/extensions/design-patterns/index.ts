import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getDesignAntiPatternCard, searchDesignAntiPatterns, type DesignAntiPatternCard } from "../../../apps/host/src/design-anti-patterns.js";
import { diagnoseDesignSmells } from "../../../apps/host/src/design-diagnosis.js";
import { analyzeDesignStructure } from "../../../apps/host/src/design-structure-analysis.js";
import { scanRepositoryDesignStructure } from "../../../apps/host/src/design-repo-scan.js";
import { buildDesignRemediationPlan } from "../../../apps/host/src/design-remediation-plan.js";
import { getDesignPatternCard, searchDesignPatterns, type DesignPatternCard } from "../../../apps/host/src/design-patterns.js";

function formatPatternCard(card: DesignPatternCard) {
  return [
    `${card.name} (${card.family})`,
    "",
    card.summary,
    "",
    "Use when:",
    ...card.useWhen.map((entry) => `- ${entry}`),
    "",
    "Avoid when:",
    ...card.avoidWhen.map((entry) => `- ${entry}`),
    "",
    "Code smells:",
    ...card.codeSmells.map((entry) => `- ${entry}`),
    "",
    "Structure:",
    ...card.structure.map((entry) => `- ${entry}`),
    "",
    `Example: ${card.example}`,
    `Related: ${card.related.join(", ") || "(none)"}`,
  ].join("\n");
}

function formatAntiPatternCard(card: DesignAntiPatternCard) {
  return [
    card.name,
    "",
    card.summary,
    "",
    "Symptoms:",
    ...card.symptoms.map((entry) => `- ${entry}`),
    "",
    "Why it hurts:",
    ...card.whyItHurts.map((entry) => `- ${entry}`),
    "",
    "Detection hints:",
    ...card.detectionHints.map((entry) => `- ${entry}`),
    "",
    `Recommended patterns: ${card.recommendedPatterns.join(", ") || "(none)"}`,
    `Example: ${card.example}`,
  ].join("\n");
}

export default function designPatternsExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "search_design_patterns",
    label: "Search Design Patterns",
    description: "Search the local design-pattern reference cards by code smell, design problem, or pattern family.",
    promptSnippet: "Use this before introducing a structural abstraction so you can choose a fitting pattern instead of guessing.",
    parameters: Type.Object({
      query: Type.String({ description: "Short description of the design problem or code smell." }),
      maxResults: Type.Optional(Type.Number({ description: "Maximum results to return.", default: 5 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cards = searchDesignPatterns(ctx.cwd, params.query, params.maxResults ?? 5);
      if (cards.length === 0) {
        return {
          content: [{ type: "text", text: `No design pattern cards matched: ${params.query}` }],
          details: { query: params.query, results: [] },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: cards.map((card, index) => `${index + 1}. ${card.name} (${card.family})\n   ${card.summary}`).join("\n\n") }],
        details: { query: params.query, results: cards },
      };
    },
  });

  pi.registerTool({
    name: "detect_design_anti_patterns",
    label: "Detect Design Anti-Patterns",
    description: "Search the local anti-pattern reference cards by code smell, structural warning sign, or maintainability problem.",
    promptSnippet: "Use this when code feels unhealthy so you can name the anti-pattern and move toward documented healthier patterns intentionally.",
    parameters: Type.Object({
      query: Type.String({ description: "Short description of the suspicious code smell or unhealthy structure." }),
      maxResults: Type.Optional(Type.Number({ description: "Maximum results to return.", default: 5 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cards = searchDesignAntiPatterns(ctx.cwd, params.query, params.maxResults ?? 5);
      if (cards.length === 0) {
        return {
          content: [{ type: "text", text: `No design anti-pattern cards matched: ${params.query}` }],
          details: { query: params.query, results: [] },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: cards.map((card, index) => `${index + 1}. ${card.name}\n   ${card.summary}\n   Recommended patterns: ${card.recommendedPatterns.join(", ") || "(none)"}`).join("\n\n") }],
        details: { query: params.query, results: cards },
      };
    },
  });

  pi.registerTool({
    name: "diagnose_design_problem",
    label: "Diagnose Design Problem",
    description: "Detect likely anti-patterns and suggest healthier documented patterns for a design problem or code smell.",
    promptSnippet: "Use this when you want one diagnosis pass that names the smell and recommends documented replacement patterns.",
    parameters: Type.Object({
      query: Type.String({ description: "Short description of the design problem or code smell." }),
      maxResults: Type.Optional(Type.Number({ description: "Maximum results to return.", default: 5 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const diagnosis = diagnoseDesignSmells(ctx.cwd, params.query, params.maxResults ?? 5);
      if (diagnosis.antiPatterns.length === 0 && diagnosis.patterns.length === 0) {
        return {
          content: [{ type: "text", text: `No design diagnosis matched: ${params.query}` }],
          details: { query: params.query, antiPatterns: [], patterns: [] },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: [
          `Query: ${params.query}`,
          "Likely anti-patterns:",
          ...(diagnosis.antiPatterns.length > 0 ? diagnosis.antiPatterns.map((card, index) => `${index + 1}. ${card.name} — recommends ${card.recommendedPatterns.join(", ") || "(none)"}`) : ["- none"]),
          "",
          "Recommended healthy patterns:",
          ...(diagnosis.patterns.length > 0 ? diagnosis.patterns.map((card, index) => `${index + 1}. ${card.name} (${card.family})`) : ["- none"]),
        ].join("\n") }],
        details: diagnosis,
        isError: diagnosis.antiPatterns.length === 0 && diagnosis.patterns.length === 0,
      };
    },
  });

  pi.registerTool({
    name: "analyze_design_structure",
    label: "Analyze Design Structure",
    description: "Inspect a local code file for likely anti-pattern heuristics and recommend healthier documented patterns.",
    promptSnippet: "Use this when a local file looks structurally unhealthy and you want file-aware diagnosis rather than a general query.",
    parameters: Type.Object({
      path: Type.String({ description: "Relative path to the local file to inspect." }),
      maxResults: Type.Optional(Type.Number({ description: "Maximum anti-patterns and patterns to return.", default: 5 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const analysis = analyzeDesignStructure(ctx.cwd, { path: params.path, maxResults: params.maxResults ?? 5 });
      return {
        content: [{ type: "text", text: [
          `File: ${analysis.filePath}`,
          `Summary: ${analysis.summary}`,
          "Evidence:",
          ...(analysis.evidence.length > 0 ? analysis.evidence.map((entry) => `- ${entry}`) : ["- none"]),
          "",
          "Likely anti-patterns:",
          ...(analysis.antiPatterns.length > 0 ? analysis.antiPatterns.map((card, index) => `${index + 1}. ${card.name}`) : ["- none"]),
          "",
          "Recommended patterns:",
          ...(analysis.patterns.length > 0 ? analysis.patterns.map((card, index) => `${index + 1}. ${card.name} (${card.family})`) : ["- none"]),
        ].join("\n") }],
        details: analysis,
        isError: analysis.summary.startsWith("File not found:"),
      };
    },
  });

  pi.registerTool({
    name: "scan_repository_design_structure",
    label: "Scan Repository Design Structure",
    description: "Scan local code files for heuristic anti-pattern signals and rank the most structurally suspicious files.",
    promptSnippet: "Use this when you want a repo-wide anti-pattern sweep instead of analyzing one file at a time.",
    parameters: Type.Object({
      include: Type.Optional(Type.Array(Type.String({ description: "Relative directories or files to include." }))),
      maxFiles: Type.Optional(Type.Number({ description: "Maximum suspicious files to return.", default: 10 })),
      maxResultsPerFile: Type.Optional(Type.Number({ description: "Maximum anti-patterns/patterns to keep per file.", default: 3 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const scan = scanRepositoryDesignStructure(ctx.cwd, {
        include: params.include,
        maxFiles: params.maxFiles ?? 10,
        maxResultsPerFile: params.maxResultsPerFile ?? 3,
      });
      return {
        content: [{ type: "text", text: [
          scan.summary,
          "",
          "Top suspicious files:",
          ...(scan.files.length > 0
            ? scan.files.map((file, index) => `${index + 1}. ${file.filePath}\n   ${file.summary}\n   Anti-patterns: ${file.antiPatterns.map((card) => card.name).join(", ") || "none"}\n   Recommended patterns: ${file.patterns.map((card) => card.name).join(", ") || "none"}`)
            : ["- none"]),
        ].join("\n") }],
        details: scan,
      };
    },
  });

  pi.registerTool({
    name: "plan_design_remediation",
    label: "Plan Design Remediation",
    description: "Generate concrete refactor steps for a suspicious local file based on detected anti-patterns and healthier documented patterns.",
    promptSnippet: "Use this after analyzing a file when you want explicit remediation steps instead of just diagnosis.",
    parameters: Type.Object({
      path: Type.String({ description: "Relative path to the local file to inspect." }),
      maxResults: Type.Optional(Type.Number({ description: "Maximum anti-patterns and patterns to consider.", default: 5 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const plan = buildDesignRemediationPlan(ctx.cwd, { path: params.path, maxResults: params.maxResults ?? 5 });
      return {
        content: [{ type: "text", text: [
          `File: ${plan.filePath}`,
          `Summary: ${plan.summary}`,
          "Likely anti-patterns:",
          ...(plan.antiPatterns.length > 0 ? plan.antiPatterns.map((card, index) => `${index + 1}. ${card.name}`) : ["- none"]),
          "",
          "Recommended patterns:",
          ...(plan.patterns.length > 0 ? plan.patterns.map((card, index) => `${index + 1}. ${card.name} (${card.family})`) : ["- none"]),
          "",
          "Refactor steps:",
          ...(plan.steps.length > 0 ? plan.steps.map((step, index) => `${index + 1}. ${step}`) : ["- none"]),
        ].join("\n") }],
        details: plan,
        isError: plan.summary.startsWith("File not found:"),
      };
    },
  });

  pi.registerTool({
    name: "get_design_pattern",
    label: "Get Design Pattern",
    description: "Load a single local design-pattern reference card with use-when, avoid-when, structure, and example guidance.",
    promptSnippet: "Use this after search_design_patterns when you want the exact pattern guidance before refactoring.",
    parameters: Type.Object({
      name: Type.String({ description: "Pattern name or alias." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const card = getDesignPatternCard(ctx.cwd, params.name);
      if (!card) {
        return {
          content: [{ type: "text", text: `Unknown design pattern: ${params.name}` }],
          details: { name: params.name },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: formatPatternCard(card) }],
        details: card,
      };
    },
  });

  pi.registerTool({
    name: "get_design_anti_pattern",
    label: "Get Design Anti-Pattern",
    description: "Load a single local design anti-pattern card with symptoms, damage, detection hints, and recommended replacement patterns.",
    promptSnippet: "Use this after detect_design_anti_patterns when you want exact anti-pattern guidance before refactoring toward a healthier structure.",
    parameters: Type.Object({
      name: Type.String({ description: "Anti-pattern name or alias." }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const card = getDesignAntiPatternCard(ctx.cwd, params.name);
      if (!card) {
        return {
          content: [{ type: "text", text: `Unknown design anti-pattern: ${params.name}` }],
          details: { name: params.name },
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: formatAntiPatternCard(card) }],
        details: card,
      };
    },
  });
}
