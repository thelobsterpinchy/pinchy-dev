import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExtensionBackedToolExecutor } from "../apps/host/src/tool-executor.js";
import { createSubmarineToolBridge } from "../services/agent-worker/src/submarine-tool-bridge.js";

async function withTempWorkspace(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-tool-executor-"));
  try {
    mkdirSync(join(cwd, ".pi/extensions/fake-tools"), { recursive: true });
    await run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function writeFakeExtension(cwd: string, source: string) {
  writeFileSync(join(cwd, ".pi/extensions/fake-tools/index.ts"), source, "utf8");
}

test("extension-backed tool executor runs workspace tools in cwd context", async () => {
  await withTempWorkspace(async (cwd) => {
    writeFakeExtension(cwd, `
      import { writeFile } from "node:fs/promises";
      import { resolve } from "node:path";

      export default function fakeTools(pi) {
        pi.registerTool({
          name: "internet_search",
          label: "Internet Search",
          description: "Fake internet search for bridge tests.",
          async execute(_id, params, _signal, _onUpdate, ctx) {
            await writeFile(resolve(ctx.cwd, "artifact.json"), JSON.stringify({ query: params.query }), "utf8");
            return {
              content: [{ type: "text", text: "searched " + params.query }],
              details: { outputPath: "artifact.json", query: params.query }
            };
          }
        });
      }
    `);

    const executor = createExtensionBackedToolExecutor();
    const result = await executor.executeTool({
      cwd,
      toolName: "internet_search",
      input: { query: "Pinchy Exa setup" },
      toolCallId: "call-1",
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.content[0]?.text, "searched Pinchy Exa setup");
    assert.deepEqual(JSON.parse(readFileSync(join(cwd, "artifact.json"), "utf8")), {
      query: "Pinchy Exa setup",
    });
  });
});

test("extension-backed tool executor runs approval and guardrail listeners before tools", async () => {
  await withTempWorkspace(async (cwd) => {
    writeFakeExtension(cwd, `
      export default function fakeTools(pi) {
        pi.on("tool_call", (event) => {
          if (event.toolName === "browser_debug_scan") {
            return { block: true, reason: "blocked by fake guardrail" };
          }
        });
        pi.registerTool({
          name: "browser_debug_scan",
          label: "Browser Debug Scan",
          async execute() {
            return { content: [{ type: "text", text: "should not execute" }] };
          }
        });
      }
    `);

    const executor = createExtensionBackedToolExecutor();
    const result = await executor.executeTool({
      cwd,
      toolName: "browser_debug_scan",
      input: { url: "http://localhost:4311" },
    });

    assert.equal(result.isError, true);
    assert.equal(result.blocked, true);
    assert.match(result.content[0]?.text ?? "", /blocked by fake guardrail/);
  });
});

test("extension-backed tool executor returns structured missing-tool failures", async () => {
  await withTempWorkspace(async (cwd) => {
    writeFakeExtension(cwd, "export default function fakeTools() {}\n");

    const executor = createExtensionBackedToolExecutor();
    const result = await executor.executeTool({
      cwd,
      toolName: "missing_tool",
      input: {},
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0]?.text ?? "", /Tool not found: missing_tool/);
  });
});

test("Submarine tool bridge delegates tool calls to the Node executor", async () => {
  const calls: Array<{ toolName: string; input: Record<string, unknown> }> = [];
  const bridge = createSubmarineToolBridge({
    executor: {
      async executeTool(input) {
        calls.push({ toolName: input.toolName, input: input.input });
        return {
          content: [{ type: "text", text: `called ${input.toolName}` }],
          details: { runId: input.runId },
        };
      },
    },
  });

  const result = await bridge.callTool({
    cwd: "/repo",
    toolName: "internet_search",
    input: { query: "Submarine tool bridge" },
    runId: "run-1",
  });

  assert.deepEqual(calls, [
    {
      toolName: "internet_search",
      input: { query: "Submarine tool bridge" },
    },
  ]);
  assert.equal(result.content[0]?.text, "called internet_search");
  assert.deepEqual(result.details, { runId: "run-1" });
});
