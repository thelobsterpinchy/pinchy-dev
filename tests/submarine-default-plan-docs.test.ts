import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const doc = () => readFileSync("docs/SUBMARINE_DEFAULT_PLAN.md", "utf8");

test("Submarine default plan documents the runtime capability inventory", () => {
  const text = doc();

  assert.match(text, /## Runtime Capability Inventory/);
  assert.match(text, /### Capability Matrix/);
  assert.match(text, /\| Capability \| Ownership \| Pi-Backed Runtime \| Submarine Runtime \| Notes \|/);
  assert.match(text, /\| `internet_search` tool \| workspace-owned \| baseline \| missing \|/);
  assert.match(text, /\| Browser and Playwright tools \| workspace-owned \| baseline \| missing \|/);
  assert.match(text, /\| Human wait and resume \| runtime-owned \| baseline \| partial \|/);
  assert.match(text, /### Required Workspace Resources/);
  assert.match(text, /\.pi\/skills\/design-pattern-review/);
  assert.match(text, /\.pi\/extensions\/browser-debugger/);
  assert.match(text, /### Required Guardrails/);
  assert.match(text, /### Known Submarine Gaps/);
  assert.match(text, /### Unknowns To Resolve/);
});

test("Submarine slice 1 todos are marked complete after inventory documentation", () => {
  const text = doc();

  assert.match(text, /- \[x\] Define a runtime capability matrix in docs\./);
  assert.match(text, /- \[x\] List required tools, skills, prompts, and guardrails\./);
  assert.match(text, /- \[x\] Identify which capabilities are runtime-owned vs workspace-owned\./);
  assert.match(text, /- \[x\] Document current Pi-backed behavior as the baseline\./);
  assert.match(text, /- \[x\] Document current Submarine gaps\./);
});

test("Submarine slice 2 todos are marked complete after contract harness implementation", () => {
  const text = doc();

  assert.match(text, /- \[x\] Add a fake runtime adapter that implements the target runtime port\./);
  assert.match(text, /- \[x\] Add a mocked Submarine RPC transport for tests\./);
  assert.match(text, /- \[x\] Add shared tests for execute, resume, waiting-for-human, failed run, and completed run\./);
  assert.match(text, /- \[x\] Add shared tests for tool\/resource visibility\./);
  assert.match(text, /- \[x\] Add shared tests for artifact and audit behavior where applicable\./);
});

test("Submarine slice 3 todos are marked complete after tool catalog implementation", () => {
  const text = doc();

  assert.match(text, /- \[x\] Create a `ToolCatalog` port that lists tool names, labels, descriptions, schemas, and prompt snippets\./);
  assert.match(text, /- \[x\] Implement a Node\/Pi extension-backed `ToolCatalog` adapter\./);
  assert.match(text, /- \[x\] Add tests for `internet_search`, browser tools, approval\/guardrail listeners, and design-pattern tools appearing in the catalog\./);
  assert.match(text, /- \[x\] Keep catalog reads scoped to the workspace `cwd`\./);
  assert.match(text, /approval and guardrail commands\/listeners appear in the catalog\./);
});

test("Submarine slice 4 todos are marked complete after tool execution bridge implementation", () => {
  const text = doc();

  assert.match(text, /- \[x\] Create a `ToolExecutor` port\./);
  assert.match(text, /- \[x\] Implement a Node extension-backed executor\./);
  assert.match(text, /- \[x\] Add a Submarine bridge method for tool execution requests\./);
  assert.match(text, /- \[x\] Return tool text, details, artifacts, and error state to Submarine\./);
  assert.match(text, /- \[x\] Preserve current artifact writes under `artifacts\/`\./);
  assert.match(text, /- \[x\] Preserve approval and guardrail behavior\./);
});

test("Submarine slice 5 todos are marked complete after resource bridge implementation", () => {
  const text = doc();

  assert.match(text, /- \[x\] Create or reuse a `ResourceCatalog` abstraction around `.pi\/skills`, `.pi\/prompts`, and `.pi\/knowledge`\./);
  assert.match(text, /- \[x\] Build a Submarine resource context payload from the resource inventory\./);
  assert.match(text, /- \[x\] Include key system guidance in the Submarine supervisor context\./);
  assert.match(text, /- \[x\] Decide whether `\/skill:name` command compatibility is required in the first implementation\./);
  assert.match(text, /- \[x\] Add tests for `design-pattern-review`, `engineering-excellence`, TDD, browser debugging, Playwright guidance, and design knowledge resources\./);
  assert.match(text, /first bridge preserves `\/skill:name` references/i);
});

test("Submarine slice 6 todos are marked complete after setup opt-in implementation", () => {
  const text = doc();

  assert.match(text, /- \[x\] Add `pinchy setup` selector for runtime strategy\./);
  assert.match(text, /- \[x\] Add Submarine setup prompts for Python path, script module, supervisor endpoint\/model, and subagent endpoint\/model\./);
  assert.match(text, /- \[x\] Persist non-secret settings to `.pinchy-runtime\.json`\./);
  assert.match(text, /- \[x\] Keep API keys out of `.pinchy-runtime\.json`; use `.pinchy\/env` or shell env for secrets\./);
  assert.match(text, /- \[x\] Add setup tests preserving existing runtime config\./);
});

test("Submarine slice 7 todos are marked complete after doctor readiness implementation", () => {
  const text = doc();

  assert.match(text, /- \[x\] Add doctor checks for Python executable availability\./);
  assert.match(text, /- \[x\] Add doctor checks for `python -m submarine\.serve_stdio` launchability\./);
  assert.match(text, /- \[x\] Add doctor checks for supervisor endpoint reachability\./);
  assert.match(text, /- \[x\] Add doctor checks for subagent endpoint reachability\./);
  assert.match(text, /- \[x\] Add doctor checks for tool bridge readiness\./);
  assert.match(text, /- \[x\] Add doctor checks for workspace `.pi` resources\./);
});

test("Submarine slice 8 todos are marked complete after worker and interactive parity implementation", () => {
  const text = doc();

  assert.match(text, /- \[x\] Validate worker `executeRun`\./);
  assert.match(text, /- \[x\] Validate worker `resumeRun`\./);
  assert.match(text, /- \[x\] Validate interactive `pinchy agent`\./);
  assert.match(text, /- \[x\] Validate cancellation and interrupted runs\./);
  assert.match(text, /- \[x\] Validate Discord run summary behavior\./);
  assert.match(text, /- \[x\] Validate dashboard message rendering\./);
  assert.match(text, /Worker sessions now start with the shared tool catalog and workspace resource context/);
  assert.match(text, /Interrupted Submarine sessions are converted to failed run outcomes/);
});

test("Submarine slice 9 todos are marked complete after deterministic dogfooding", () => {
  const text = doc();

  assert.match(text, /- \[x\] Run a conversational Discord request\./);
  assert.match(text, /- \[x\] Run a coding task with a delegated subagent\./);
  assert.match(text, /- \[x\] Run a web-search-backed question\./);
  assert.match(text, /- \[x\] Run a browser debugging task\./);
  assert.match(text, /- \[x\] Run a design pattern review task\./);
  assert.match(text, /- \[x\] Run a human question\/resume path\./);
  assert.match(text, /- \[x\] Run cancellation or interrupted run recovery\./);
  assert.match(text, /- \[x\] Run failed tool call recovery\./);
  assert.match(text, /Dogfood notes: `docs\/SUBMARINE_DOGFOODING\.md`/);
  assert.match(text, /Live external dogfooding remains a blocker/);
});

test("Submarine slice 10 todos are marked complete after dogfood default rollout controls", () => {
  const text = doc();

  assert.match(text, /- \[x\] Make `pinchy setup` recommend Submarine for new dogfood workspaces\./);
  assert.match(text, /- \[x\] Keep standard Pi runtime as an explicit option\./);
  assert.match(text, /- \[x\] Add release notes explaining when to choose each runtime\./);
  assert.match(text, /- \[x\] Add rollback docs\./);
  assert.match(text, /Dogfood default/);
  assert.match(text, /`pinchy init` scaffolds new `.pinchy-runtime\.json` files with `submarine\.enabled: true`/);
  assert.match(text, /Existing workspaces use Submarine unless they explicitly set `submarine\.enabled` to `false`/);
  assert.match(text, /Existing users can opt out explicitly with `submarine\.enabled: false`/);
});
