import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerInternetSearchTool } from "../.pi/extensions/web-search/index.js";

test("registerInternetSearchTool exposes internet_search and formats the top results", async () => {
  const tools = new Map<string, any>();
  const pi = {
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
  };

  registerInternetSearchTool(pi as never, {
    search: async () => ({
      provider: "bing-rss",
      query: "pinchy dev",
      results: [
        { title: "Pinchy", url: "https://example.com/pinchy", snippet: "Local-first coding agent" },
        { title: "Repo", url: "https://example.com/repo", snippet: "GitHub repository" },
      ],
    }),
    now: () => 123,
  });

  const tool = tools.get("internet_search");
  assert.ok(tool);

  const cwd = mkdtempSync(join(tmpdir(), "pinchy-internet-search-"));
  try {
    const response = await tool.execute(
      "call-1",
      { query: "pinchy dev", maxResults: 2 },
      undefined,
      undefined,
      { cwd },
    );

    assert.match(response.content[0].text, /Provider: bing-rss/);
    assert.match(response.content[0].text, /1\. Pinchy/);
    assert.match(response.content[0].text, /2\. Repo/);
    assert.equal(response.details.outputPath, "artifacts/internet-search-123.json");

    const saved = JSON.parse(readFileSync(join(cwd, "artifacts/internet-search-123.json"), "utf8"));
    assert.equal(saved.provider, "bing-rss");
    assert.equal(saved.results.length, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("registerInternetSearchTool marks empty result sets as an error", async () => {
  const tools = new Map<string, any>();
  const pi = {
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
  };

  registerInternetSearchTool(pi as never, {
    search: async () => ({
      provider: "bing-rss",
      query: "missing",
      results: [],
    }),
    now: () => 456,
  });

  const tool = tools.get("internet_search");
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-internet-search-empty-"));
  try {
    const response = await tool.execute(
      "call-2",
      { query: "missing" },
      undefined,
      undefined,
      { cwd },
    );

    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /No results found/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
