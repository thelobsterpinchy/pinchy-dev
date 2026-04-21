import test from "node:test";
import assert from "node:assert/strict";
import guardrails from "../.pi/extensions/guardrails/index.ts";

type EventHandler = (event: any, ctx: any) => Promise<any> | any;

type CommandHandler = (args: string[], ctx: any) => Promise<any> | any;

function createHarness() {
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, { description: string; handler: CommandHandler }>();
  const statuses: Array<{ scope: string; message: string }> = [];
  const notifications: Array<{ message: string; level: string }> = [];

  const pi = {
    on(eventName: string, handler: EventHandler) {
      const existing = handlers.get(eventName) ?? [];
      existing.push(handler);
      handlers.set(eventName, existing);
    },
    registerCommand(name: string, definition: { description: string; handler: CommandHandler }) {
      commands.set(name, definition);
    },
  };

  guardrails(pi as never);

  const ctx = {
    cwd: process.cwd(),
    ui: {
      setStatus(scope: string, message: string) {
        statuses.push({ scope, message });
      },
      notify(message: string, level: string) {
        notifications.push({ message, level });
      },
    },
  };

  return {
    statuses,
    notifications,
    commands,
    async emit(eventName: string, event: any) {
      let result;
      for (const handler of handlers.get(eventName) ?? []) {
        result = await handler(event, ctx);
        if (result) return result;
      }
      return result;
    },
  };
}

test("before_agent_start appends engineering guardrails to the system prompt", async () => {
  const harness = createHarness();

  const result = await harness.emit("before_agent_start", { systemPrompt: "Base prompt" });

  assert.match(result.systemPrompt, /^Base prompt\n\nEngineering Guardrails:/);
  assert.match(result.systemPrompt, /Use \/skill:tdd-implementation/);
});

test("tool_call blocks dangerous bash commands and git push by default", async () => {
  const harness = createHarness();

  const dangerousResult = await harness.emit("tool_call", {
    toolName: "bash",
    input: { command: "rm -rf /" },
  });
  assert.equal(dangerousResult.block, true);
  assert.match(dangerousResult.reason, /Blocked dangerous command/);

  const pushResult = await harness.emit("tool_call", {
    toolName: "bash",
    input: { command: "git push origin main" },
  });
  assert.equal(pushResult.block, true);
  assert.match(pushResult.reason, /git push is blocked/);
});

test("tool_call blocks protected paths for reads", async () => {
  const harness = createHarness();

  const result = await harness.emit("tool_call", {
    toolName: "read",
    input: { path: ".env.local" },
  });

  assert.equal(result.block, true);
  assert.match(result.reason, /Protected path blocked/);
});

test("tool_call enforces TDD before editing implementation files", async () => {
  const harness = createHarness();

  const result = await harness.emit("tool_call", {
    toolName: "edit",
    input: {
      path: "apps/host/src/main.ts",
      edits: [{ oldText: "a", newText: "b" }],
    },
  });

  assert.equal(result.block, true);
  assert.match(result.reason, /TDD guardrail/);
});

test("touching a test file first allows implementation edits and records a reminder", async () => {
  const harness = createHarness();

  await harness.emit("session_start", {});
  await harness.emit("tool_call", {
    toolName: "read",
    input: { path: "tests/main.test.ts" },
  });

  const result = await harness.emit("tool_call", {
    toolName: "edit",
    input: {
      path: "apps/host/src/main.ts",
      edits: [{ oldText: "a", newText: "b" }],
    },
  });

  assert.equal(result, undefined);
  assert.deepEqual(harness.statuses.at(-1), {
    scope: "guardrails",
    message: "Editing apps/host/src/main.ts; consider adding or updating tests first.",
  });
});

test("registered commands surface validation and engineering guidance", async () => {
  const harness = createHarness();

  const original = process.env.PINCHY_TEST_COMMAND;
  process.env.PINCHY_TEST_COMMAND = "npm run check";
  try {
    await harness.commands.get("suggest-test-command")?.handler([], {
      ui: {
        notify(message: string, level: string) {
          harness.notifications.push({ message, level });
        },
      },
    });
    await harness.commands.get("engineering-checklist")?.handler([], {
      ui: {
        notify(message: string, level: string) {
          harness.notifications.push({ message, level });
        },
      },
    });
  } finally {
    if (original === undefined) delete process.env.PINCHY_TEST_COMMAND;
    else process.env.PINCHY_TEST_COMMAND = original;
  }

  assert.equal(harness.notifications[0]?.message, "Suggested validation command: npm run check");
  assert.match(harness.notifications[1]?.message ?? "", /Engineering checklist:/);
});
