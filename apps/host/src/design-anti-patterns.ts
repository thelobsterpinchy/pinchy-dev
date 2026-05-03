import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DesignAntiPatternCard = {
  slug: string;
  name: string;
  aliases: string[];
  summary: string;
  symptoms: string[];
  whyItHurts: string[];
  detectionHints: string[];
  recommendedPatterns: string[];
  example: string;
};

const DESIGN_ANTI_PATTERN_DIRECTORY = ".pi/knowledge/design-anti-patterns";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseInlineList(value: string) {
  const trimmed = value.trim();
  const inner = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return inner.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseFrontmatter(source: string) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Design anti-pattern card is missing frontmatter.");
  }

  const metadata = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    metadata.set(key, value);
  }

  return { metadata, body: match[2].trim() };
}

function parseSection(body: string, heading: string) {
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = body.match(pattern);
  return match ? match[1].trim() : "";
}

function parseBulletSection(body: string, heading: string) {
  return parseSection(body, heading)
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function parseCard(filePath: string): DesignAntiPatternCard {
  const source = readFileSync(filePath, "utf8");
  const { metadata, body } = parseFrontmatter(source);
  return {
    slug: metadata.get("slug") ?? "",
    name: metadata.get("name") ?? "",
    aliases: parseInlineList(metadata.get("aliases") ?? "[]"),
    summary: parseSection(body, "Summary"),
    symptoms: parseBulletSection(body, "Symptoms"),
    whyItHurts: parseBulletSection(body, "Why it hurts"),
    detectionHints: parseBulletSection(body, "Detection hints"),
    recommendedPatterns: parseInlineList(metadata.get("recommendedPatterns") ?? "[]"),
    example: parseSection(body, "Example"),
  };
}

function resolveReferenceBaseCwd(cwd: string) {
  const workspaceDir = resolve(cwd, DESIGN_ANTI_PATTERN_DIRECTORY);
  if (existsSync(workspaceDir)) return cwd;
  const processDir = resolve(process.cwd(), DESIGN_ANTI_PATTERN_DIRECTORY);
  if (existsSync(processDir)) return process.cwd();
  return cwd;
}

export function resolveDesignAntiPatternCardDir(cwd: string) {
  return resolve(resolveReferenceBaseCwd(cwd), DESIGN_ANTI_PATTERN_DIRECTORY);
}

export function listDesignAntiPatternCards(cwd: string): DesignAntiPatternCard[] {
  const dir = resolveDesignAntiPatternCardDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => parseCard(resolve(dir, name)));
}

export function getDesignAntiPatternCard(cwd: string, nameOrAlias: string): DesignAntiPatternCard | undefined {
  const wanted = normalize(nameOrAlias);
  return listDesignAntiPatternCards(cwd).find((card) => normalize(card.name) === wanted || normalize(card.slug) === wanted || card.aliases.some((alias) => normalize(alias) === wanted));
}

function tokenize(value: string) {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 2);
}

function buildQueryPhrases(query: string) {
  const tokens = tokenize(query);
  const phrases: string[] = [];
  for (let size = 2; size <= Math.min(3, tokens.length); size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      phrases.push(tokens.slice(index, index + size).join(" "));
    }
  }
  return phrases;
}

function scoreCard(card: DesignAntiPatternCard, query: string) {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);
  const searchableText = normalize([
    card.name,
    card.slug,
    card.aliases.join(" "),
    card.summary,
    card.symptoms.join(" "),
    card.whyItHurts.join(" "),
    card.detectionHints.join(" "),
    card.recommendedPatterns.join(" "),
    card.example,
  ].join(" "));
  const highlightedText = [card.summary, ...card.symptoms, ...card.detectionHints].map((value) => normalize(value));

  const exactName = normalize(card.name) === normalizedQuery || normalize(card.slug) === normalizedQuery;
  const aliasMatch = card.aliases.some((alias) => normalize(alias) === normalizedQuery);
  const tokenMatches = queryTokens.filter((token) => searchableText.includes(token)).length;
  const phraseMatches = highlightedText.filter((value) => value.includes(normalizedQuery)).length;
  const phraseOverlap = buildQueryPhrases(query).filter((phrase) => highlightedText.some((value) => value.includes(phrase))).length;

  return (exactName ? 100 : 0) + (aliasMatch ? 80 : 0) + tokenMatches * 8 + phraseMatches * 20 + phraseOverlap * 6;
}

export function searchDesignAntiPatterns(cwd: string, query: string, maxResults = 5): DesignAntiPatternCard[] {
  return listDesignAntiPatternCards(cwd)
    .map((card) => ({ card, score: scoreCard(card, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name))
    .slice(0, Math.max(1, Math.min(maxResults, 10)))
    .map((entry) => entry.card);
}
