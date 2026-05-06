import test from "node:test";
import assert from "node:assert/strict";
import { buildSubmarineInteractiveStartSessionPayload, handleSubmarineInteractiveToolCall } from "../apps/host/src/submarine-interactive-runtime.js";

test("Submarine interactive runtime start payload includes shared tools and resources", async () => {
  const payload = await buildSubmarineInteractiveStartSessionPayload({
    cwd: "/repo",
    runtimeConfig: {
      defaultModel: "qwen3-coder",
      submarine: {
        enabled: true,
        supervisorModel: "qwen3-coder",
        supervisorBaseUrl: "http://127.0.0.1:8080/v1",
        agents: {
          worker: {
            model: "qwen3-coder",
            baseUrl: "http://127.0.0.1:8000/v1",
          },
        },
      },
    },
    toolCatalog: {
      tools: [
        {
          name: "internet_search",
          label: "Internet Search",
          description: "Search the public internet.",
          promptSnippet: "Use for current facts.",
          source: { extensionName: "web-search", path: "/repo/.pi/extensions/web-search/index.ts" },
        },
      ],
      commands: [],
      listeners: [],
      errors: [],
    },
    resourceContext: {
      resources: [
        {
          type: "skill",
          name: "design-pattern-review",
          path: "/repo/.pi/skills/design-pattern-review/SKILL.md",
          relativePath: ".pi/skills/design-pattern-review/SKILL.md",
          preview: "Design Pattern Review",
        },
      ],
      systemPrompt: "Workspace resources available to Submarine:\n- /skill:design-pattern-review",
    },
  });

  assert.deepEqual(payload.tools, [
    {
      name: "internet_search",
      label: "Internet Search",
      description: "Search the public internet.",
      prompt_snippet: "Use for current facts.",
      parameters: undefined,
    },
  ]);
  assert.deepEqual(payload.resources, [
    {
      type: "skill",
      name: "design-pattern-review",
      path: "/repo/.pi/skills/design-pattern-review/SKILL.md",
      relativePath: ".pi/skills/design-pattern-review/SKILL.md",
      preview: "Design Pattern Review",
    },
  ]);
  assert.match(payload.supervisor.system_prompt, /design-pattern-review/);
  assert.match(payload.agents[0]?.system_prompt ?? "", /design-pattern-review/);
});

test("Submarine interactive runtime sends tool_call events through the Node executor", async () => {
  const sentResults: Array<Record<string, unknown>> = [];
  const executed: Array<{ toolName: string; input: Record<string, unknown>; hasUI?: boolean }> = [];

  const handled = await handleSubmarineInteractiveToolCall({
    cwd: "/repo",
    event: {
      type: "tool_call",
      tool_call_id: "tool-1",
      tool_name: "internet_search",
      input: { query: "Pinchy Submarine" },
    },
    sendToolResult: async (params) => {
      sentResults.push(params);
      return undefined;
    },
    toolExecutor: {
      async executeTool(input) {
        executed.push({ toolName: input.toolName, input: input.input, hasUI: input.hasUI });
        return {
          content: [{ type: "text", text: "Search result" }],
          details: { outputPath: "artifacts/search.json" },
        };
      },
    },
  });

  assert.equal(handled, true);
  assert.deepEqual(executed, [{ toolName: "internet_search", input: { query: "Pinchy Submarine" }, hasUI: true }]);
  assert.deepEqual(sentResults, [
    {
      tool_call_id: "tool-1",
      result: {
        content: [{ type: "text", text: "Search result" }],
        details: { outputPath: "artifacts/search.json" },
      },
    },
  ]);
});

test("Submarine interactive runtime returns structured tool errors without throwing", async () => {
  const sentResults: Array<Record<string, unknown>> = [];

  const handled = await handleSubmarineInteractiveToolCall({
    cwd: "/repo",
    event: {
      type: "tool_call",
      tool_call_id: "tool-1",
      tool_name: "internet_search",
      input: { query: "Pinchy Submarine" },
    },
    sendToolResult: async (params) => {
      sentResults.push(params);
      return undefined;
    },
    toolExecutor: {
      async executeTool() {
        throw new Error("search provider unavailable");
      },
    },
  });

  const result = sentResults[0]?.result as { isError?: boolean; content?: Array<{ text?: string }> } | undefined;
  assert.equal(handled, true);
  assert.equal(result?.isError, true);
  assert.match(result?.content?.[0]?.text ?? "", /search provider unavailable/);
});
