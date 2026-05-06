import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("self-improvement prompt and extension keep the explicit no-safety-weakening guardrail", () => {
  const prompt = readFileSync(".pi/prompts/self-improve.md", "utf8");
  const extension = readFileSync(".pi/extensions/self-improver/index.ts", "utf8");

  assert.match(prompt, /Do not weaken safety\./i);
  assert.match(extension, /Do not weaken safety or expand beyond this repo unless explicitly instructed\./i);
});
