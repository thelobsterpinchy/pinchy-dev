import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function assertMentions(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

test("README and LOCAL_RUNTIME stay aligned on installable CLI onboarding and workspace-local guardrails", () => {
  const readme = readFileSync("README.md", "utf8");
  const localRuntime = readFileSync("docs/LOCAL_RUNTIME.md", "utf8");

  const onboardingPatterns = [
    /npm install -g pinchy-dev/i,
    /pinchy init/i,
    /pinchy setup/i,
    /pinchy doctor/i,
    /pinchy up/i,
  ];

  const sharedGuardrailPatterns = [/dangerModeEnabled/i, /workspace-local/i];

  assertMentions(readme, onboardingPatterns);
  assertMentions(localRuntime, onboardingPatterns);
  assertMentions(readme, sharedGuardrailPatterns);
  assertMentions(localRuntime, sharedGuardrailPatterns);

  assert.match(readme, /These runtime files are intended to be \*\*workspace-local preferences and runtime state\*\*, not shared secrets/i);
  assert.match(localRuntime, /Do not put secrets, auth tokens, or private session state in `.pinchy-runtime\.json`/i);
  assert.match(readme, /`pinchy up` starts Pinchy's managed local services without requiring an interactive TTY/i);
  assert.match(localRuntime, /`pinchy doctor` checks workspace initialization/i);
});
