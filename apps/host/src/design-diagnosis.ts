import { getDesignPatternCard, searchDesignPatterns, type DesignPatternCard } from "./design-patterns.js";
import { searchDesignAntiPatterns, type DesignAntiPatternCard } from "./design-anti-patterns.js";

export type DesignDiagnosis = {
  antiPatterns: DesignAntiPatternCard[];
  patterns: DesignPatternCard[];
};

function rankRecommendedPatterns(
  antiPatterns: DesignAntiPatternCard[],
  directlyMatchedPatterns: DesignPatternCard[],
  cwd: string,
  maxResults: number,
) {
  const scores = new Map<string, { card: DesignPatternCard; score: number }>();

  antiPatterns.forEach((antiPattern, antiPatternIndex) => {
    antiPattern.recommendedPatterns.forEach((name, recommendationIndex) => {
      const card = getDesignPatternCard(cwd, name);
      if (!card) return;
      const existing = scores.get(card.slug);
      const weight = 100 - antiPatternIndex * 10 - recommendationIndex;
      scores.set(card.slug, { card, score: (existing?.score ?? 0) + weight });
    });
  });

  directlyMatchedPatterns.forEach((card, index) => {
    const existing = scores.get(card.slug);
    const weight = 40 - index;
    scores.set(card.slug, { card, score: Math.max(existing?.score ?? 0, weight) + (existing ? 5 : 0) });
  });

  return Array.from(scores.values())
    .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name))
    .slice(0, Math.max(1, Math.min(maxResults, 10)))
    .map((entry) => entry.card);
}

export function diagnoseDesignSmells(cwd: string, query: string, maxResults = 5): DesignDiagnosis {
  const antiPatterns = searchDesignAntiPatterns(cwd, query, maxResults);
  const directlyMatchedPatterns = searchDesignPatterns(cwd, query, maxResults);

  return {
    antiPatterns,
    patterns: rankRecommendedPatterns(antiPatterns, directlyMatchedPatterns, cwd, maxResults),
  };
}
