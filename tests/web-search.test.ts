import test from "node:test";
import assert from "node:assert/strict";
import { buildBingRssSearchUrl, buildOpenLibrarySearchUrl, parseBingRssResults, parseOpenLibraryResults, searchWeb } from "../apps/host/src/web-search.js";

test("buildBingRssSearchUrl encodes the query and count", () => {
  const url = buildBingRssSearchUrl({ query: "pinchy dev", count: 3 });

  assert.equal(url, "https://www.bing.com/search?format=rss&q=pinchy+dev&count=3");
});

test("buildOpenLibrarySearchUrl encodes the title query and limit", () => {
  const url = buildOpenLibrarySearchUrl({ query: "Design Patterns: Elements of Reusable Object-Oriented Software", limit: 2 });

  assert.equal(url, "https://openlibrary.org/search.json?title=Design+Patterns%3A+Elements+of+Reusable+Object-Oriented+Software&limit=2");
});

test("parseBingRssResults extracts titles, links, and snippets", () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?>
  <rss version="2.0">
    <channel>
      <title>Bing: pinchy dev</title>
      <item>
        <title><![CDATA[Pinchy &amp; Dev]]></title>
        <link>https://example.com/one</link>
        <description><![CDATA[First <b>result</b>]]></description>
      </item>
      <item>
        <title>Second result</title>
        <link>https://example.com/two</link>
        <description>Second snippet</description>
      </item>
    </channel>
  </rss>`;

  const results = parseBingRssResults(xml, 1);

  assert.deepEqual(results, [
    {
      title: "Pinchy & Dev",
      url: "https://example.com/one",
      snippet: "First result",
    },
  ]);
});

test("parseOpenLibraryResults extracts book results", () => {
  const json = {
    docs: [
      {
        title: "Design Patterns. Elements of Reusable Object-oriented Software",
        author_name: ["Erich Gamma", "Richard Helm"],
        first_publish_year: 1994,
        key: "/works/OL31219436W",
      },
    ],
  };

  const results = parseOpenLibraryResults(json, 1);

  assert.deepEqual(results, [
    {
      title: "Design Patterns. Elements of Reusable Object-oriented Software",
      url: "https://openlibrary.org/works/OL31219436W",
      snippet: "Erich Gamma, Richard Helm • first published 1994",
    },
  ]);
});

test("searchWeb returns parsed results from the provider response", async () => {
  const requested: string[] = [];
  const results = await searchWeb(
    { query: "pinchy dev", maxResults: 2 },
    {
      fetch: async (url) => {
        requested.push(String(url));
        return {
          ok: true,
          status: 200,
          text: async () => `<?xml version="1.0"?><rss><channel><item><title>Result</title><link>https://example.com</link><description>Snippet</description></item></channel></rss>`,
        } as Response;
      },
    },
  );

  assert.equal(requested[0], "https://www.bing.com/search?format=rss&q=pinchy+dev&count=2");
  assert.deepEqual(results.provider, "bing-rss");
  assert.deepEqual(results.results, [
    {
      title: "Result",
      url: "https://example.com",
      snippet: "Snippet",
    },
  ]);
});

test("searchWeb prefers open library when it has much more relevant title matches", async () => {
  const requested: string[] = [];
  const results = await searchWeb(
    { query: "Design Patterns: Elements of Reusable Object-Oriented Software", maxResults: 2 },
    {
      fetch: async (url) => {
        const value = String(url);
        requested.push(value);
        if (value.includes("bing.com")) {
          return {
            ok: true,
            status: 200,
            text: async () => `<?xml version="1.0"?><rss><channel><item><title>Periodic Table of Elements - PubChem</title><link>https://pubchem.example/elements</link><description>chemistry</description></item></channel></rss>`,
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            docs: [
              {
                title: "Design Patterns. Elements of Reusable Object-oriented Software",
                author_name: ["Erich Gamma", "Richard Helm", "Ralph Johnson", "John Vlissides"],
                first_publish_year: 1994,
                key: "/works/OL31219436W",
              },
            ],
          }),
        } as unknown as Response;
      },
    },
  );

  assert.equal(requested.length, 2);
  assert.equal(results.provider, "open-library");
  assert.match(results.results[0]?.title ?? "", /Design Patterns/);
});

test("searchWeb reranks docs-like web queries to prefer official documentation over forum noise", async () => {
  const results = await searchWeb(
    { query: "OpenAI responses api tool calling guide", maxResults: 3 },
    {
      fetch: async (url) => {
        const value = String(url);
        if (value.includes("bing.com")) {
          return {
            ok: true,
            status: 200,
            text: async () => `<?xml version="1.0"?><rss><channel>
              <item>
                <title>OpenAI - Reddit</title>
                <link>https://www.reddit.com/r/OpenAI/</link>
                <description>Community discussion about OpenAI.</description>
              </item>
              <item>
                <title>Function calling guide - OpenAI API</title>
                <link>https://platform.openai.com/docs/guides/function-calling</link>
                <description>Official guide for tool and function calling.</description>
              </item>
            </channel></rss>`,
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ docs: [] }),
        } as Response;
      },
    },
  );

  assert.equal(results.provider, "bing-rss");
  assert.equal(results.results[0]?.url, "https://platform.openai.com/docs/guides/function-calling");
  assert.equal(results.results[1]?.url, "https://www.reddit.com/r/OpenAI/");
});

test("searchWeb throws when the provider request fails", async () => {
  await assert.rejects(
    () => searchWeb(
      { query: "pinchy dev" },
      {
        fetch: async () => ({
          ok: false,
          status: 503,
          text: async () => "unavailable",
        }) as Response,
      },
    ),
    /503/,
  );
});
