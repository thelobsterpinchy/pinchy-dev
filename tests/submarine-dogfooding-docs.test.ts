import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const doc = () => readFileSync("docs/SUBMARINE_DOGFOODING.md", "utf8");

test("Submarine dogfooding notes cover every slice 9 workflow", () => {
  const text = doc();

  for (const workflow of [
    "Conversational Discord request",
    "Coding task with delegated subagent",
    "Web-search-backed question",
    "Browser debugging task",
    "Design pattern review task",
    "Human question/resume path",
    "Cancellation or interrupted run recovery",
    "Failed tool call recovery",
  ]) {
    assert.match(text, new RegExp(workflow));
  }
});

test("Submarine dogfooding notes keep live external dogfood as a default rollout gate", () => {
  const text = doc();

  assert.match(text, /deterministic repo dogfooding/i);
  assert.match(text, /Live external dogfooding is still required/i);
  assert.match(text, /production confidence remains blocked/i);
  assert.match(text, /live Discord, live model, live Exa, and browser-debugging notes/i);
  assert.match(text, /dogfood default for new workspaces/i);
});
