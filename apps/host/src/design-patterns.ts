import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DesignPatternFamily = "Creational" | "Structural" | "Behavioral" | "Architectural";

export type DesignPatternCard = {
  slug: string;
  name: string;
  family: DesignPatternFamily;
  aliases: string[];
  summary: string;
  useWhen: string[];
  avoidWhen: string[];
  codeSmells: string[];
  structure: string[];
  example: string;
  related: string[];
};

const DESIGN_PATTERN_DIRECTORY = ".pi/knowledge/design-patterns";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseInlineList(value: string) {
  const trimmed = value.trim();
  const inner = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return inner.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseFrontmatter(source: string) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Design pattern card is missing frontmatter.");
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

function parsePatternCard(filePath: string): DesignPatternCard {
  const source = readFileSync(filePath, "utf8");
  const { metadata, body } = parseFrontmatter(source);
  const name = metadata.get("name") ?? "";
  const family = (metadata.get("family") ?? "Behavioral") as DesignPatternFamily;
  return {
    slug: metadata.get("slug") ?? slugify(name),
    name,
    family,
    aliases: parseInlineList(metadata.get("aliases") ?? "[]"),
    summary: parseSection(body, "Summary"),
    useWhen: parseBulletSection(body, "Use when"),
    avoidWhen: parseBulletSection(body, "Avoid when"),
    codeSmells: parseBulletSection(body, "Code smells"),
    structure: parseBulletSection(body, "Structure"),
    example: parseSection(body, "Example"),
    related: parseInlineList(metadata.get("related") ?? "[]"),
  };
}

function resolveReferenceBaseCwd(cwd: string) {
  const workspaceDir = resolve(cwd, DESIGN_PATTERN_DIRECTORY);
  if (existsSync(workspaceDir)) return cwd;
  const processDir = resolve(process.cwd(), DESIGN_PATTERN_DIRECTORY);
  if (existsSync(processDir)) return process.cwd();
  return cwd;
}

export function resolveDesignPatternCardDir(cwd: string) {
  return resolve(resolveReferenceBaseCwd(cwd), DESIGN_PATTERN_DIRECTORY);
}

export function listDesignPatternCards(cwd: string): DesignPatternCard[] {
  const dir = resolveDesignPatternCardDir(cwd);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => parsePatternCard(resolve(dir, name)));
}

export function getDesignPatternCard(cwd: string, nameOrAlias: string): DesignPatternCard | undefined {
  const wanted = normalize(nameOrAlias);
  return listDesignPatternCards(cwd).find((card) => {
    if (normalize(card.name) === wanted) return true;
    if (normalize(card.slug) === wanted) return true;
    return card.aliases.some((alias) => normalize(alias) === wanted);
  });
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

function scoreCard(card: DesignPatternCard, query: string) {
  const queryTokens = tokenize(query);
  const searchableText = normalize([
    card.name,
    card.slug,
    card.family,
    card.aliases.join(" "),
    card.summary,
    card.useWhen.join(" "),
    card.avoidWhen.join(" "),
    card.codeSmells.join(" "),
    card.structure.join(" "),
    card.example,
    card.related.join(" "),
  ].join(" "));
  const highlightedText = [card.summary, ...card.useWhen, ...card.codeSmells].map((value) => normalize(value));

  const exactName = normalize(card.name) === normalize(query) || normalize(card.slug) === normalize(query);
  const aliasMatch = card.aliases.some((alias) => normalize(alias) === normalize(query));
  const tokenMatches = queryTokens.filter((token) => searchableText.includes(token)).length;
  const phraseMatches = highlightedText.filter((value) => value.includes(normalize(query))).length;
  const phraseOverlap = buildQueryPhrases(query)
    .filter((phrase) => highlightedText.some((value) => value.includes(phrase)))
    .length;

  return (exactName ? 100 : 0) + (aliasMatch ? 80 : 0) + tokenMatches * 8 + phraseMatches * 20 + phraseOverlap * 6;
}

export function searchDesignPatterns(cwd: string, query: string, maxResults = 5): DesignPatternCard[] {
  return listDesignPatternCards(cwd)
    .map((card) => ({ card, score: scoreCard(card, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name))
    .slice(0, Math.max(1, Math.min(maxResults, 10)))
    .map((entry) => entry.card);
}
