# Submarine Dogfooding Notes

Date: 2026-05-05

Scope: deterministic repo dogfooding for Submarine parity. These runs use mocked Submarine, Discord, and external-search boundaries so they can run in CI without Python model servers, Discord network access, or Exa credentials.

Live external dogfooding is still required before Submarine is treated as the proven production default. New workspaces may use Submarine as the dogfood default, but production confidence remains blocked until live Discord, live model, live Exa, and browser-debugging notes are added here.

## Results

| Workflow | Result | Evidence | Issues And Follow-Ups |
| --- | --- | --- | --- |
| Conversational Discord request | Pass in deterministic worker path. The worker persists and sends the actual assistant response instead of deterministic status text. | `tests/pi-submarine-adapter.test.ts` covers mapped run summary delivery and dashboard-visible agent message persistence. | Live Discord API delivery was not run in this environment. Add live gateway notes before default rollout. |
| Coding task with delegated subagent | Pass in runtime contract path. Submarine contract runs expose shared tools/resources and complete with artifact and audit semantics. | `tests/agent-runtime-contract-harness.test.ts` covers Submarine execute, artifact, audit, failure, and human-resume outcomes. | Live delegated coding with a real Submarine model server remains a default-rollout gate. |
| Web-search-backed question | Pass in tool bridge path. Submarine can call `internet_search`, receive structured results, and recover from provider failures. | `tests/pi-submarine-adapter.test.ts`, `tests/submarine-interactive-runtime.test.ts`, and `tests/tool-executor.test.ts`. | Live Exa search was not run because CI must not require `EXA_API_KEY`. |
| Browser debugging task | Pass in catalog and bridge path. Browser debugging tools are visible to Submarine and execute through the same Node tool facade with guardrails. | `tests/tool-catalog.test.ts` verifies browser tools; `tests/tool-executor.test.ts` verifies browser tool guardrail handling. | Live Playwright/browser investigation should be run before recommending Submarine. |
| Design pattern review task | Pass in resource and catalog path. Design pattern resources and tools are visible to Submarine session context. | `tests/resource-catalog.test.ts`, `tests/tool-catalog.test.ts`, and `tests/submarine-interactive-runtime.test.ts`. | Live model behavior with `/skill:design-pattern-review` should be sampled before default rollout. |
| Human question/resume path | Pass in worker path. Submarine yielded task IDs are persisted and reused for resume replies. | `tests/pi-submarine-adapter.test.ts` and `tests/agent-runtime-contract-harness.test.ts`. | Live Discord reply resume still needs end-to-end validation. |
| Cancellation or interrupted run recovery | Pass for interrupted process recovery. Submarine process exit becomes a failed run outcome instead of a stuck worker loop. | `tests/pi-submarine-adapter.test.ts`. | User-initiated cancellation semantics should be dogfooded live before default rollout. |
| Failed tool call recovery | Pass in worker and interactive paths. Thrown tool bridge errors become structured `tool_result` failures so Submarine can continue reasoning. | `tests/pi-submarine-adapter.test.ts` and `tests/submarine-interactive-runtime.test.ts`. | No known follow-up from deterministic coverage. |

## Default Rollout Gate

Submarine can be used as the dogfood default for new workspaces, with the standard Pi runtime retained as an explicit fallback. It should not be treated as the proven production default until the live external dogfood gaps above are closed.
