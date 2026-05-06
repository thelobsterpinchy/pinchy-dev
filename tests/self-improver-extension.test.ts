import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import selfImprover from "../.pi/extensions/self-improver/index.js";

function createHarness(cwd: string) {
  const commands = new Map<string, any>();
  const tools = new Map<string, any>();
  const userMessages: Array<{ message: string; options?: any }> = [];
  const notifications: Array<{ message: string; level?: string }> = [];

  const pi = {
    registerCommand(name: string, definition: any) {
      commands.set(name, definition);
    },
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
    sendUserMessage(message: string, options?: any) {
      userMessages.push({ message, options });
    },
  };

  selfImprover(pi as never);

  return {
    commands,
    tools,
    userMessages,
    notifications,
    ctx: {
      cwd,
      waitForIdle: async () => {},
      ui: {
        notify(message: string, level?: string) {
          notifications.push({ message, level });
        },
      },
    },
  };
}

test("self-improver prompt reinforces safe bounded maintenance guidance", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-self-improver-"));
  try {
    writeFileSync(join(cwd, ".pinchy-health.md"), "Keep docs current.");
    const harness = createHarness(cwd);

    await harness.commands.get("self-improve").handler("tests", harness.ctx);

    const prompt = harness.userMessages[0]?.message ?? "";
    assert.match(prompt, /stay within this repository|beyond this repo/i);
    assert.match(prompt, /docs|documentation/i);
    assert.match(prompt, /tests/i);
    assert.match(prompt, /guardrails/i);
    assert.match(prompt, /small refactors/i);
    assert.match(prompt, /dirty-worktree|edited files with unrelated/i);
    assert.match(prompt, /validate any changes when practical/i);
    assert.match(prompt, /test-first|regression-test-first/i);
    assert.match(prompt, /If no safe improvement is warranted, explain why and stop/i);
    assert.match(prompt, /Current health hints:\nKeep docs current\./i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("queue_self_improvement_cycle sends follow-up prompt with the same guardrails", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-self-improver-tool-"));
  try {
    const harness = createHarness(cwd);
    const tool = harness.tools.get("queue_self_improvement_cycle");

    const result = await tool.execute(
      "call-1",
      { focus: "docs" },
      undefined,
      undefined,
      { cwd },
    );

    assert.equal(result.content[0]?.text, "Queued a self-improvement cycle as a follow-up.");
    assert.deepEqual(result.details, { focus: "docs" });
    assert.equal(harness.userMessages[0]?.options?.deliverAs, "followUp");
    assert.match(harness.userMessages[0]?.message ?? "", /dirty-worktree|edited files with unrelated/i);
    assert.match(harness.userMessages[0]?.message ?? "", /validate any changes when practical/i);
    assert.match(harness.userMessages[0]?.message ?? "", /test-first|regression-test-first/i);
    assert.match(harness.userMessages[0]?.message ?? "", /If no safe improvement is warranted, explain why and stop/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});


test("pinchy-health notifies with current repo health hints when present", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-health-"));
  try {
    writeFileSync(join(cwd, ".pinchy-health.md"), "Audit self-improvement prompts.");
    const harness = createHarness(cwd);

    await harness.commands.get("pinchy-health").handler(undefined, harness.ctx);

    assert.deepEqual(harness.notifications, [
      { message: "Audit self-improvement prompts.", level: "info" },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});


test("pinchy-health reports when no health hints file exists", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-health-empty-"));
  try {
    const harness = createHarness(cwd);

    await harness.commands.get("pinchy-health").handler(undefined, harness.ctx);

    assert.deepEqual(harness.notifications, [
      { message: "No .pinchy-health.md file found.", level: "info" },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
