import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyPinchyWorkspaceEnv, loadPinchyWorkspaceEnv, savePinchyWorkspaceEnv } from "../apps/host/src/workspace-env.js";

async function withTempDir(run: (cwd: string) => Promise<void> | void) {
  const cwd = mkdtempSync(join(tmpdir(), "pinchy-workspace-env-"));
  try {
    await run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("workspace env persists local Discord secrets and applies them without overriding shell values", async () => {
  await withTempDir((cwd) => {
    savePinchyWorkspaceEnv(cwd, {
      PINCHY_DISCORD_BOT_TOKEN: "discord-token",
      PINCHY_API_TOKEN: "local-api-token",
    });

    assert.deepEqual(loadPinchyWorkspaceEnv(cwd), {
      PINCHY_API_TOKEN: "local-api-token",
      PINCHY_DISCORD_BOT_TOKEN: "discord-token",
    });

    const env: NodeJS.ProcessEnv = {
      PINCHY_API_TOKEN: "shell-token",
    };
    applyPinchyWorkspaceEnv(cwd, env);

    assert.equal(env.PINCHY_API_TOKEN, "shell-token");
    assert.equal(env.PINCHY_DISCORD_BOT_TOKEN, "discord-token");
  });
});

test("applyPinchyWorkspaceEnv preserves explicit empty shell values", async () => {
  await withTempDir((cwd) => {
    savePinchyWorkspaceEnv(cwd, {
      PINCHY_API_TOKEN: "local-api-token",
      PINCHY_DISCORD_BOT_TOKEN: "discord-token",
    });

    const env: NodeJS.ProcessEnv = {
      PINCHY_API_TOKEN: "",
    };
    applyPinchyWorkspaceEnv(cwd, env);

    assert.equal(env.PINCHY_API_TOKEN, "");
    assert.equal(env.PINCHY_DISCORD_BOT_TOKEN, "discord-token");
  });
});

test("savePinchyWorkspaceEnv clears existing keys when a patch value is blank or undefined", async () => {
  await withTempDir((cwd) => {
    savePinchyWorkspaceEnv(cwd, {
      PINCHY_API_TOKEN: "local-api-token",
      PINCHY_DISCORD_BOT_TOKEN: "discord-token",
      PINCHY_DISCORD_ALLOWED_CHANNEL_IDS: "channel-1",
    });

    savePinchyWorkspaceEnv(cwd, {
      PINCHY_API_TOKEN: undefined,
      PINCHY_DISCORD_ALLOWED_CHANNEL_IDS: "   ",
    });

    assert.deepEqual(loadPinchyWorkspaceEnv(cwd), {
      PINCHY_DISCORD_BOT_TOKEN: "discord-token",
    });
  });
});

test("workspace env round-trips escaped values saved with JSON quoting", async () => {
  await withTempDir((cwd) => {
    const expectedValue = 'line1\nline2\t\\path\\file"quote"'.replace(/\\n/g, "\n").replace(/\\t/g, "\t");

    savePinchyWorkspaceEnv(cwd, {
      PINCHY_ESCAPED_VALUE: expectedValue,
    });

    assert.deepEqual(loadPinchyWorkspaceEnv(cwd), {
      PINCHY_ESCAPED_VALUE: expectedValue,
    });
  });
});
