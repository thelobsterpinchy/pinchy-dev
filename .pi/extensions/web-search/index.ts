import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { appendArtifactRecord } from "../../../apps/host/src/artifact-index.js";
import { buildArtifactMetadata } from "../../../apps/host/src/artifact-metadata.js";
import { searchWeb, type InternetSearchResponse } from "../../../apps/host/src/web-search.js";

type ToolDeps = {
  search?: typeof searchWeb;
  now?: () => number;
};

function recordArtifact(cwd: string, outputPath: string, query: string) {
  appendArtifactRecord(cwd, {
    path: outputPath,
    mediaType: "application/json",
    ...buildArtifactMetadata(cwd, "internet_search", `query=${query}`, ["search", "internet"]),
  });
}

function formatSearchSummary(response: InternetSearchResponse) {
  if (response.results.length === 0) {
    return `Provider: ${response.provider}\nQuery: ${response.query}\nNo results found.`;
  }

  return [
    `Provider: ${response.provider}`,
    `Query: ${response.query}`,
    ...response.results.map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet || "(no snippet)"}`),
  ].join("\n");
}

export function registerInternetSearchTool(pi: ExtensionAPI, deps: ToolDeps = {}) {
  const runSearch = deps.search ?? searchWeb;
  const now = deps.now ?? Date.now;

  pi.registerTool({
    name: "internet_search",
    label: "Internet Search",
    description: "Search the public internet and return a small set of summarized results.",
    promptSnippet: "Use this when you need concrete web search results instead of guessing from memory.",
    promptGuidelines: [
      "Use it for targeted lookups, not broad crawling.",
      "Summarize the returned evidence instead of overstating confidence.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query." }),
      maxResults: Type.Optional(Type.Number({ description: "Maximum results to return (1-10).", default: 5 })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const response = await runSearch({ query: params.query, maxResults: params.maxResults });
      const outputPath = `artifacts/internet-search-${now()}.json`;
      const absolutePath = resolve(ctx.cwd, outputPath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, JSON.stringify(response, null, 2), "utf8");
      recordArtifact(ctx.cwd, outputPath, params.query);
      return {
        content: [{ type: "text", text: `${formatSearchSummary(response)}\nSaved results: ${outputPath}` }],
        details: { ...response, outputPath },
        isError: response.results.length === 0,
      };
    },
  });
}

export default function webSearch(pi: ExtensionAPI) {
  registerInternetSearchTool(pi);
}
