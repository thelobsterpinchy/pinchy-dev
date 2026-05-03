import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function assertMentions(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

test("AGENTS and LOCAL_RUNTIME stay aligned with package entrypoint scripts", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const agents = readFileSync("AGENTS.md", "utf8");
  const localRuntime = readFileSync("docs/LOCAL_RUNTIME.md", "utf8");

  const expectedScripts = ["agent", "daemon", "dashboard", "dashboard:web"];

  for (const scriptName of expectedScripts) {
    assert.ok(packageJson.scripts?.[scriptName], `package.json should define npm run ${scriptName}`);
  }

  assertMentions(agents, [
    /npm run agent/i,
    /npm run daemon/i,
    /npm run dashboard/i,
    /npm run dashboard:web/i,
  ]);

  assertMentions(localRuntime, [
    /npm run agent/i,
    /npm run daemon/i,
    /npm run dashboard/i,
    /npm run dashboard:web/i,
  ]);
});
