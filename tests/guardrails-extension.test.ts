import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import guardrails from "../.pi/extensions/guardrails/index.js";

type EventHandler = (event: any, ctx: any) => Promise<any> | any;

type CommandHandler = (args: string[], ctx: any) => Promise<any> | any;

function createHarness(options: { cwd?: string } = {}) {
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
    cwd: options.cwd ?? process.cwd(),
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
  assert.match(result.systemPrompt, /Stay in the orchestration layer for coding work; delegate coding changes to a subagent first, even for a single change when practical\./);
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

test("multi-task requests block implementation edits until delegation starts", async () => {
  const harness = createHarness();

  await harness.emit("session_start", {});
  await harness.emit("message_start", {
    message: {
      role: "user",
      content: "Audit the worker, inspect the dashboard, and then implement the smallest safe fix.",
    },
  });
  await harness.emit("tool_call", {
    toolName: "read",
    input: { path: "tests/main.test.ts" },
  });

  const blocked = await harness.emit("tool_call", {
    toolName: "edit",
    input: {
      path: "apps/host/src/main.ts",
      edits: [{ oldText: "a", newText: "b" }],
    },
  });

  assert.equal(blocked.block, true);
  assert.match(blocked.reason, /Orchestration guardrail/);

  await harness.emit("tool_call", {
    toolName: "delegate_task_plan",
    input: {
      tasks: [
        { title: "Audit worker", prompt: "Audit worker" },
        { title: "Inspect dashboard", prompt: "Inspect dashboard" },
      ],
    },
  });

  const allowed = await harness.emit("tool_call", {
    toolName: "edit",
    input: {
      path: "apps/host/src/main.ts",
      edits: [{ oldText: "a", newText: "b" }],
    },
  });

  assert.equal(allowed, undefined);
});

test("single-task coding requests require delegation before implementation edits", async () => {
  const harness = createHarness();

  await harness.emit("session_start", {});
  await harness.emit("message_start", {
    message: {
      role: "user",
      content: "Fix the flaky worker test.",
    },
  });
  await harness.emit("tool_call", {
    toolName: "read",
    input: { path: "tests/main.test.ts" },
  });

  const blocked = await harness.emit("tool_call", {
    toolName: "edit",
    input: {
      path: "apps/host/src/main.ts",
      edits: [{ oldText: "a", newText: "b" }],
    },
  });

  assert.equal(blocked.block, true);
  assert.match(blocked.reason, /Orchestration guardrail/);

  await harness.emit("tool_call", {
    toolName: "queue_task",
    input: {
      title: "Fix flaky worker test",
      prompt: "Fix the flaky worker test with TDD.",
    },
  });

  const allowed = await harness.emit("tool_call", {
    toolName: "edit",
    input: {
      path: "apps/host/src/main.ts",
      edits: [{ oldText: "a", newText: "b" }],
    },
  });

  assert.equal(allowed, undefined);
});

test("tool_call warns after 5 identical tool retries and blocks on the 10th", async () => {
  const harness = createHarness();

  for (let index = 0; index < 4; index += 1) {
    const result = await harness.emit("tool_call", {
      toolName: "read",
      input: { path: "README.md" },
    });
    assert.equal(result, undefined);
  }

  const warningResult = await harness.emit("tool_call", {
    toolName: "read",
    input: { path: "README.md" },
  });
  assert.equal(warningResult, undefined);
  assert.deepEqual(harness.notifications.at(-1), {
    message: "Tool retry penalty warning: read has been called 5 times with the same input in this turn. Reassess before continuing to retry the same action.",
    level: "warning",
  });

  for (let index = 0; index < 4; index += 1) {
    const result = await harness.emit("tool_call", {
      toolName: "read",
      input: { path: "README.md" },
    });
    assert.equal(result, undefined);
  }

  const blockedResult = await harness.emit("tool_call", {
    toolName: "read",
    input: { path: "README.md" },
  });
  assert.equal(blockedResult.block, true);
  assert.match(blockedResult.reason, /Tool retry penalty/);
  assert.match(blockedResult.reason, /10 times with the same input/);
});

test("tool_call retry penalty resets when the tool input changes", async () => {
  const harness = createHarness();

  for (let index = 0; index < 4; index += 1) {
    const result = await harness.emit("tool_call", {
      toolName: "read",
      input: { path: "README.md" },
    });
    assert.equal(result, undefined);
  }

  const changedInputResult = await harness.emit("tool_call", {
    toolName: "read",
    input: { path: "package.json" },
  });
  assert.equal(changedInputResult, undefined);
  assert.equal(harness.notifications.length, 0);
});

test("tool_call uses configured retry penalty thresholds from runtime settings", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-guardrails-"));
  try {
    writeFileSync(join(cwd, ".pinchy-runtime.json"), JSON.stringify({
      toolRetryWarningThreshold: 2,
      toolRetryHardStopThreshold: 3,
    }));

    const harness = createHarness({ cwd });

    const first = await harness.emit("tool_call", {
      toolName: "read",
      input: { path: "README.md" },
    });
    assert.equal(first, undefined);

    const second = await harness.emit("tool_call", {
      toolName: "read",
      input: { path: "README.md" },
    });
    assert.equal(second, undefined);
    assert.deepEqual(harness.notifications.at(-1), {
      message: "Tool retry penalty warning: read has been called 2 times with the same input in this turn. Reassess before continuing to retry the same action.",
      level: "warning",
    });

    const third = await harness.emit("tool_call", {
      toolName: "read",
      input: { path: "README.md" },
    });
    assert.equal(third.block, true);
    assert.match(third.reason, /3 times with the same input/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
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
