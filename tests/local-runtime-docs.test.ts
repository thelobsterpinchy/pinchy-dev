import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("LOCAL_RUNTIME documents the supported pinchy config set keys and workspace-local guardrails", () => {
  const doc = readFileSync("docs/LOCAL_RUNTIME.md", "utf8");

  assert.match(doc, /Supported `pinchy config set` keys/i);
  assert.match(doc, /`defaultProvider`/);
  assert.match(doc, /`defaultModel`/);
  assert.match(doc, /`defaultThinkingLevel`/);
  assert.match(doc, /`defaultBaseUrl`/);
  assert.match(doc, /`autoDeleteEnabled`/);
  assert.match(doc, /`autoDeleteDays`/);
  assert.match(doc, /`toolRetryWarningThreshold`/);
  assert.match(doc, /`toolRetryHardStopThreshold`/);
  assert.match(doc, /`dangerModeEnabled`/);
  assert.match(doc, /For nested structures such as `modelOptions` or `savedModelConfigs`/);
  assert.match(doc, /Pinchy resolves runtime defaults for the active workspace in this order:/);
  assert.match(doc, /1\. workspace `.pinchy-runtime.json`/);
  assert.match(doc, /2\. `PINCHY_DEFAULT_\*` environment defaults/);
  assert.match(doc, /3\. Pi agent global settings for `defaultProvider`, `defaultModel`, and `defaultThinkingLevel`/);
  assert.match(doc, /`defaultBaseUrl` currently falls back through workspace config and `PINCHY_DEFAULT_BASE_URL`, but not Pi agent global settings/);
  assert.match(doc, /`dangerModeEnabled` is workspace-local and should only be enabled for sandboxed local debugging/);
  assert.match(doc, /Do not put secrets, auth tokens, or private session state in `.pinchy-runtime.json`/);
});
