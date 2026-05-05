import test from "node:test";
import assert from "node:assert/strict";
import { createExtensionBackedToolCatalog, hasCatalogTool } from "../apps/host/src/tool-catalog.js";

test("extension-backed tool catalog discovers shared workspace tools without executing them", async () => {
  const catalog = createExtensionBackedToolCatalog();
  const snapshot = await catalog.listTools(process.cwd());

  assert.equal(snapshot.errors.length, 0, snapshot.errors.map((error) => `${error.extensionName}: ${error.message}`).join("\n"));

  for (const toolName of [
    "internet_search",
    "browser_debug_scan",
    "browser_dom_snapshot",
    "browser_run_probe",
    "browser_execute_steps",
    "browser_compare_artifacts",
    "queue_task",
    "delegate_task_plan",
    "search_design_patterns",
    "diagnose_design_problem",
  ]) {
    assert.equal(hasCatalogTool(snapshot, toolName), true, `missing catalog tool ${toolName}`);
  }
});

test("extension-backed tool catalog keeps descriptors tied to their source extensions", async () => {
  const catalog = createExtensionBackedToolCatalog();
  const snapshot = await catalog.listTools(process.cwd());

  const internetSearch = snapshot.tools.find((tool) => tool.name === "internet_search");
  assert.equal(internetSearch?.source.extensionName, "web-search");
  assert.match(internetSearch?.description ?? "", /public internet/i);
  assert.ok(internetSearch?.parameters);

  const browserScan = snapshot.tools.find((tool) => tool.name === "browser_debug_scan");
  assert.equal(browserScan?.source.extensionName, "browser-debugger");
  assert.match(browserScan?.promptSnippet ?? "", /debugging evidence/i);

  const designSearch = snapshot.tools.find((tool) => tool.name === "search_design_patterns");
  assert.equal(designSearch?.source.extensionName, "design-patterns");
  assert.match(designSearch?.promptSnippet ?? "", /structural abstraction/i);
});

test("extension-backed tool catalog records commands separately from callable tools", async () => {
  const catalog = createExtensionBackedToolCatalog();
  const snapshot = await catalog.listTools(process.cwd());

  assert.ok(snapshot.commands.some((command) => command.name === "approvals" && command.source.extensionName === "approval-inbox"));
  assert.ok(snapshot.commands.some((command) => command.name === "engineering-checklist" && command.source.extensionName === "guardrails"));
  assert.equal(hasCatalogTool(snapshot, "approvals"), false);
});

test("extension-backed tool catalog records guardrail and approval listeners", async () => {
  const catalog = createExtensionBackedToolCatalog();
  const snapshot = await catalog.listTools(process.cwd());

  assert.ok(snapshot.listeners.some((listener) => listener.eventName === "tool_call" && listener.source.extensionName === "approval-inbox"));
  assert.ok(snapshot.listeners.some((listener) => listener.eventName === "tool_call" && listener.source.extensionName === "guardrails"));
  assert.ok(snapshot.listeners.some((listener) => listener.eventName === "before_agent_start" && listener.source.extensionName === "guardrails"));
});
