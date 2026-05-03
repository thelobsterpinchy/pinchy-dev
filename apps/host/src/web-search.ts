function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

export type InternetSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type InternetSearchProvider = "bing-rss" | "open-library";

export type InternetSearchResponse = {
  provider: InternetSearchProvider;
  query: string;
  results: InternetSearchResult[];
};

export type SearchWebInput = {
  query: string;
  maxResults?: number;
};

type SearchFetch = typeof fetch;
type SearchResponseLike = Pick<Response, "ok" | "status" | "text">;

type SearchProviderResult = {
  provider: InternetSearchProvider;
  results: InternetSearchResult[];
};

type OpenLibrarySearchResponse = {
  docs?: Array<{
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    key?: string;
  }>;
};

export function buildBingRssSearchUrl({ query, count }: { query: string; count: number }) {
  const params = new URLSearchParams({ format: "rss", q: query, count: String(count) });
  return `https://www.bing.com/search?${params.toString()}`;
}

export function buildOpenLibrarySearchUrl({ query, limit }: { query: string; limit: number }) {
  const params = new URLSearchParams({ title: query, limit: String(limit) });
  return `https://openlibrary.org/search.json?${params.toString()}`;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXmlText(value: string) {
  const withoutCdata = value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  return decodeHtmlEntities(stripHtml(withoutCdata));
}

function readTag(block: string, tagName: string) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXmlText(match[1]) : "";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function queryTokens(query: string) {
  return normalizeText(query).split(/\s+/).filter((token) => token.length >= 3);
}

function readUrlParts(value: string) {
  try {
    const url = new URL(value);
    return {
      hostname: url.hostname.toLowerCase().replace(/^www\./, ""),
      path: normalizeText(url.pathname),
    };
  } catch {
    return { hostname: "", path: normalizeText(value) };
  }
}

function hasAnyTokenMatch(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function isDocsLikeQuery(query: string) {
  const tokens = queryTokens(query);
  return hasAnyTokenMatch(tokens.join(" "), ["api", "docs", "guide", "reference", "sdk", "tool", "calling"]);
}

function scoreSearchResult(query: string, result: InternetSearchResult) {
  const normalizedQuery = normalizeText(query);
  const normalizedTitle = normalizeText(result.title);
  const normalizedSnippet = normalizeText(result.snippet);
  const haystack = normalizeText([result.title, result.snippet, result.url].join(" "));
  const tokens = queryTokens(query);
  const tokenMatches = tokens.filter((token) => haystack.includes(token)).length;
  const exactTitleMatch = normalizedTitle === normalizedQuery;
  const titleContainsQuery = normalizedTitle.includes(normalizedQuery);
  const { hostname, path } = readUrlParts(result.url);
  const docsLikeQuery = isDocsLikeQuery(query);
  const docsTerms = ["docs", "guide", "guides", "reference", "api", "sdk", "function", "tool", "calling"];
  const forumHosts = ["reddit.com", "stackoverflow.com", "news.ycombinator.com", "quora.com"];
  const docsSignal = hasAnyTokenMatch([normalizedTitle, normalizedSnippet, path].join(" "), docsTerms);
  const forumHost = forumHosts.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));

  return (
    tokenMatches * 10
    + (titleContainsQuery ? 30 : 0)
    + (exactTitleMatch ? 40 : 0)
    + (docsLikeQuery && docsSignal ? 35 : 0)
    - (docsLikeQuery && forumHost ? 25 : 0)
  );
}

function averageScore(query: string, results: InternetSearchResult[]) {
  if (results.length === 0) return 0;
  return results.reduce((sum, result) => sum + scoreSearchResult(query, result), 0) / results.length;
}

function rerankResults(query: string, results: InternetSearchResult[]) {
  return [...results].sort((left, right) => scoreSearchResult(query, right) - scoreSearchResult(query, left));
}

function pickPreferredProvider(query: string, providers: SearchProviderResult[]) {
  const ranked = providers
    .map((provider) => {
      const rerankedResults = rerankResults(query, provider.results);
      return {
        ...provider,
        results: rerankedResults,
        average: averageScore(query, rerankedResults),
        best: Math.max(0, ...rerankedResults.map((result) => scoreSearchResult(query, result))),
      };
    })
    .sort((left, right) => right.best - left.best || right.average - left.average || left.provider.localeCompare(right.provider));
  return ranked[0] ?? { provider: "bing-rss" as const, results: [] };
}

export function parseBingRssResults(xml: string, maxResults: number): InternetSearchResult[] {
  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/gi));
  return items.slice(0, maxResults).map((item) => ({
    title: readTag(item[1], "title"),
    url: readTag(item[1], "link"),
    snippet: readTag(item[1], "description"),
  })).filter((item) => item.title && item.url);
}

export function parseOpenLibraryResults(payload: OpenLibrarySearchResponse, maxResults: number): InternetSearchResult[] {
  return (payload.docs ?? [])
    .slice(0, maxResults)
    .flatMap((doc) => {
      if (!doc.title || !doc.key) return [];
      const authors = doc.author_name?.filter(Boolean).join(", ");
      const published = typeof doc.first_publish_year === "number" ? `first published ${doc.first_publish_year}` : undefined;
      return [{
        title: doc.title,
        url: `https://openlibrary.org${doc.key}`,
        snippet: [authors, published].filter(Boolean).join(" • "),
      }];
    });
}

async function fetchText(fetchImpl: SearchFetch, url: string, accept: string) {
  const response: SearchResponseLike = await fetchImpl(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; Pinchy/0.2; +https://github.com/thelobsterpinchy/pinchy-dev)",
      accept,
    },
  });

  if (!response.ok) {
    throw new Error(`Internet search provider request failed with status ${response.status}.`);
  }

  return response.text();
}

async function searchBingRss(fetchImpl: SearchFetch, query: string, maxResults: number): Promise<SearchProviderResult> {
  const xml = await fetchText(fetchImpl, buildBingRssSearchUrl({ query, count: maxResults }), "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5");
  return {
    provider: "bing-rss",
    results: parseBingRssResults(xml, maxResults),
  };
}

async function searchOpenLibrary(fetchImpl: SearchFetch, query: string, maxResults: number): Promise<SearchProviderResult> {
  const text = await fetchText(fetchImpl, buildOpenLibrarySearchUrl({ query, limit: maxResults }), "application/json, text/plain;q=0.9, */*;q=0.5");
  const payload = JSON.parse(text) as OpenLibrarySearchResponse;
  return {
    provider: "open-library",
    results: parseOpenLibraryResults(payload, maxResults),
  };
}

export async function searchWeb(
  input: SearchWebInput,
  options: { fetch?: SearchFetch } = {},
): Promise<InternetSearchResponse> {
  const fetchImpl = options.fetch ?? fetch;
  const maxResults = Math.max(1, Math.min(input.maxResults ?? 5, 10));
  const providers = await Promise.all([
    searchBingRss(fetchImpl, input.query, maxResults),
    searchOpenLibrary(fetchImpl, input.query, maxResults).catch(() => ({ provider: "open-library" as const, results: [] })),
  ]);
  const selected = pickPreferredProvider(input.query, providers);
  return {
    provider: selected.provider,
    query: input.query,
    results: selected.results,
  };
}
