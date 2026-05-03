import { analyzeDesignStructure, type DesignStructureAnalysis } from "./design-structure-analysis.js";

export type DesignRemediationPlan = DesignStructureAnalysis & {
  steps: string[];
};

const REMEDIATION_GUIDANCE: Record<string, string[]> = {
  "service-locator": [
    "Introduce explicit dependency injection so collaborators are passed in through constructors or focused function parameters.",
    "Move object assembly to a composition root instead of resolving dependencies deep inside business logic.",
  ],
  "god-object": [
    "Extract cohesive responsibilities into smaller modules or services so one file stops owning unrelated behaviors.",
    "Add a small facade or orchestration boundary only if callers still need one simplified entrypoint after extraction.",
  ],
  "long-parameter-list": [
    "Collapse related primitives into value objects or an options object with explicit names.",
    "Use a builder only if construction order or many optional fields genuinely make plain objects unclear.",
  ],
  "primitive-obsession": [
    "Replace repeated raw primitives with value objects or named domain types where invariants matter.",
    "Centralize validation and semantic meaning in those types instead of repeating string and number checks.",
  ],
  "tight-coupling": [
    "Introduce interfaces, adapters, or ports so the module depends on abstractions instead of concrete infrastructure types.",
    "Pull side-effect wiring out to a boundary module and keep the core behavior focused on domain logic.",
  ],
  "magic-numbers-and-strings": [
    "Replace repeated literals with named policies, constants, or value objects that explain the business meaning.",
  ],
};

function unique(items: string[]) {
  return Array.from(new Set(items));
}

export function buildDesignRemediationPlan(
  cwd: string,
  options: { path: string; maxResults?: number },
): DesignRemediationPlan {
  const analysis = analyzeDesignStructure(cwd, options);
  const steps = unique(
    analysis.antiPatterns.flatMap((card) => REMEDIATION_GUIDANCE[card.slug] ?? [])
  );

  return {
    ...analysis,
    summary: steps.length > 0
      ? `Refactor plan: ${steps.length} targeted remediation steps based on detected anti-patterns.`
      : "No strong remediation plan needed; keep the design simple unless broader review shows a real structural problem.",
    steps,
  };
}
