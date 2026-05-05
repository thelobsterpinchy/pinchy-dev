# Submarine Default Runtime Plan

This plan describes how to offboard Pinchy from the current shared Pi-backed runtime path and make Submarine the default without losing customer-facing capabilities.

## Goal

Make Submarine the default runtime for new Pinchy workspaces while preserving the current operator experience:

- orchestration and subagent LLM routing
- `internet_search`
- browser and Playwright tools
- design pattern review skills and tools
- approval and guardrail behavior
- human wait/resume flow
- Discord and dashboard run summaries

The current Pi-backed runtime is the compatibility baseline. Submarine should not become the default until these capabilities have parity.

## Current State

Submarine can already be enabled through `.pinchy-runtime.json`:

```json
{
  "submarine": {
    "enabled": true,
    "pythonPath": "python3",
    "scriptModule": "submarine.serve_stdio",
    "supervisorModel": "qwen3-coder",
    "supervisorBaseUrl": "http://127.0.0.1:8080/v1",
    "agents": {
      "subagent": {
        "model": "qwen3-coder",
        "baseUrl": "http://127.0.0.1:8000/v1"
      }
    }
  }
}
```

When enabled:

- `services/agent-worker/src/pi-run-executor.ts` routes worker execution through `pi-submarine-adapter`.
- `apps/host/src/main.ts` routes interactive `pinchy agent` through `submarine-interactive-runtime`.

The main gap is capability parity. The Submarine runtime currently bypasses the Pi extension and skill runtime, so it should not be assumed to expose `.pi/extensions` or `.pi/skills` tools such as `internet_search`, browser debugging, approvals, or design pattern review.

## Runtime Capability Inventory

Status legend:

- `baseline`: works in the current Pi-backed runtime and defines expected behavior
- `partial`: some behavior exists, but it does not meet the baseline contract
- `missing`: not currently wired
- `unknown`: not yet proven by tests or dogfooding

### Capability Matrix

| Capability | Ownership | Pi-Backed Runtime | Submarine Runtime | Notes |
| --- | --- | --- | --- | --- |
| Main orchestration execution | runtime-owned | baseline | partial | `pi-run-executor` routes to Submarine when `submarine.enabled`; parity for tool/resource access is not proven. |
| Delegated subagent execution | runtime-owned | baseline | partial | Submarine has agent routing config, but shared workspace tool and skill access is not bridged. |
| Runtime model routing | runtime-owned | baseline | partial | Pi-backed runtime uses role-specific provider/model/base URL selection; Submarine has supervisor and per-agent model settings with a different config shape. |
| Conversation session reuse | runtime-owned | baseline | unknown | Pi-backed runtime has conversation session binding and runtime config signatures; Submarine has persisted session keys but needs parity tests. |
| Human wait and resume | runtime-owned | baseline | partial | Submarine maps `agent_yielded` to `waiting_for_human`, but end-to-end Discord/dashboard delivery and resume parity needs tests. |
| Cancellation and interrupted run recovery | runtime-owned | baseline | unknown | Pi-backed execution has cancellation checks; Submarine process cancellation and recovery need explicit coverage. |
| Streaming assistant text capture | runtime-owned | baseline | partial | Pi-backed runtime captures streamed assistant text; Submarine interactive runtime synthesizes messages from RPC responses and needs parity validation. |
| `internet_search` tool | workspace-owned | baseline | missing | The tool lives in `.pi/extensions/web-search`; Submarine currently does not load or bridge Pi extensions. |
| Browser and Playwright tools | workspace-owned | baseline | missing | The tools live in `.pi/extensions/browser-debugger`; Submarine needs a tool bridge before default rollout. |
| Desktop observation tools | workspace-owned | baseline | missing | The tools live in `.pi/extensions/desktop-observer`; same bridge requirement as browser tools. |
| Approval and guardrail extensions | workspace-owned | baseline | missing | Approval and guardrail behavior is implemented through Pi extensions and must remain enforced when Submarine calls tools. |
| Design pattern tools | workspace-owned | baseline | missing | Design pattern extension resources are workspace `.pi` resources and need catalog/bridge support. |
| Design pattern review skill | workspace-owned | baseline | missing | `.pi/skills/design-pattern-review` is not currently injected into Submarine session context. |
| Engineering excellence and TDD skills | workspace-owned | baseline | missing | Skill access needs a resource bridge or command compatibility layer. |
| Browser debugging prompts | workspace-owned | baseline | missing | `.pi/prompts/browser-bug.md` and related skill guidance need to be visible to Submarine. |
| Artifact creation and indexing | mixed | baseline | unknown | Existing Node tools write artifacts and index records; Submarine parity depends on tool bridge execution through Node. |
| Audit entries and run state transitions | mixed | baseline | partial | Worker state persistence wraps both runtimes, but Submarine-specific events need contract tests. |
| Discord request handling | runtime-adjacent | baseline | unknown | Discord gateway creates runs independently of runtime; final response quality and wait/resume behavior need dogfooding. |
| Dashboard run summaries | runtime-adjacent | baseline | unknown | Dashboard reads persisted state; Submarine message content and progress semantics need validation. |
| `pinchy setup` runtime configuration | setup-owned | baseline | missing | Setup does not currently offer Submarine as a guided runtime choice. |
| `pinchy doctor` runtime readiness | setup-owned | baseline | missing | Doctor does not currently check Submarine process, endpoints, or tool parity. |

### Required Workspace Resources

These resources are required for customer-facing parity and must be visible to both orchestration and subagent sessions before Submarine becomes the default:

- `.pi/SYSTEM.md`
- `.pi/extensions/web-search`
- `.pi/extensions/browser-debugger`
- `.pi/extensions/desktop-observer`
- `.pi/extensions/approval-inbox`
- `.pi/extensions/guardrails`
- `.pi/extensions/design-patterns`
- `.pi/extensions/task-inbox`
- `.pi/skills/design-pattern-review`
- `.pi/skills/engineering-excellence`
- `.pi/skills/tdd-implementation`
- `.pi/skills/website-debugger`
- `.pi/skills/playwright-investigation`
- `.pi/prompts/browser-bug.md`
- `.pi/knowledge/design-patterns`
- `.pi/knowledge/design-anti-patterns`

### Required Guardrails

These guardrails must survive the runtime switch:

- tool calls run in the active workspace context
- tool calls do not receive secrets unless the existing tool already reads configured environment values
- generated artifacts remain under `artifacts/` and are indexed
- approval prompts still block high-risk actions
- browser and desktop tools remain evidence-first
- behavior changes still prefer regression tests
- design review remains available for structural changes
- human questions pause execution until answered

### Known Submarine Gaps

Current known gaps before default rollout:

- no Pi extension loading in `submarine-interactive-runtime`
- no Node tool bridge in `pi-submarine-adapter`
- no skill or prompt bridge into Submarine supervisor context
- no setup flow for Submarine runtime configuration
- no doctor checks for Submarine readiness
- no contract tests proving shared capabilities across both runtime strategies
- deterministic dogfooding evidence exists in `docs/SUBMARINE_DOGFOODING.md`, but live Discord, model, Exa, and browser-debugging dogfood remains a default-rollout gate

### Unknowns To Resolve

These items require tests or dogfooding before rollout:

- whether Submarine session persistence has parity with Pi-backed conversation session reuse
- how Submarine should represent streaming progress in the dashboard
- how cancellation should stop the Python process and active RPC work
- how Submarine should report structured tool failures back to the supervisor
- whether `/skill:name` command compatibility is required or resource inventory is enough
- whether Submarine needs separate supervisor and subagent system prompts for Pinchy guardrails

## Work Plan

## Design Patterns To Use

Use these patterns deliberately so Submarine does not become a parallel runtime with duplicated logic.

### Hexagonal Architecture

Keep Pinchy orchestration as the application core. Runtime-specific details belong behind ports.

Ports to define or clarify:

- `AgentRuntime`
- `ToolCatalog`
- `ToolExecutor`
- `ResourceCatalog`
- `RuntimeHealthCheck`

Adapters:

- Pi-backed runtime adapter
- Submarine runtime adapter
- Node tool bridge adapter
- filesystem-backed resource catalog

Acceptance criteria:

- orchestration code depends on ports, not Submarine process details
- Submarine-specific RPC code stays outside core orchestration modules
- tests can replace runtime adapters with fakes

### Adapter

Use adapters to normalize Pi-backed runtime and Submarine runtime behavior.

Acceptance criteria:

- both runtimes expose the same high-level methods for execute, resume, steer, and follow-up
- both runtimes return the same outcome shape
- runtime-specific message formats are translated at the edge

### Facade

Expose existing `.pi/extensions` through a small `ToolBridge` facade rather than leaking extension runtime internals into Submarine.

Acceptance criteria:

- Submarine can request tool schemas through one facade call
- Submarine can execute a tool through one facade call
- tool execution still uses the existing Node extension implementation

### Strategy

Use runtime selection as a strategy chosen from `.pinchy-runtime.json`.

Acceptance criteria:

- standard Pi runtime and Submarine runtime can be selected without branching throughout the worker
- `pinchy setup` and `pinchy doctor` can report the selected strategy clearly
- fallback to standard Pi runtime remains available

### Contract Tests

Use shared runtime contract tests for Pi-backed and Submarine-backed adapters.

Acceptance criteria:

- each runtime implementation runs through the same capability test suite
- adding a runtime capability requires adding contract coverage
- Submarine cannot become default until contract tests pass

## Slices And Todos

### Slice 1: Runtime Contract And Inventory

Goal: make the compatibility target explicit before changing behavior.

Todos:

- [x] Define a runtime capability matrix in docs.
- [x] List required tools, skills, prompts, and guardrails.
- [x] Identify which capabilities are runtime-owned vs workspace-owned.
- [x] Document current Pi-backed behavior as the baseline.
- [x] Document current Submarine gaps.

Acceptance criteria:

- `docs/SUBMARINE_DEFAULT_PLAN.md` includes a capability matrix.
- Every required customer-facing capability has a status.
- Unknowns are explicitly listed rather than assumed.

### Slice 2: Runtime Contract Test Harness

Goal: create a test harness that can validate both runtimes without live models.

Todos:

- [x] Add a fake runtime adapter that implements the target runtime port.
- [x] Add a mocked Submarine RPC transport for tests.
- [x] Add shared tests for execute, resume, waiting-for-human, failed run, and completed run.
- [x] Add shared tests for tool/resource visibility.
- [x] Add shared tests for artifact and audit behavior where applicable.

Acceptance criteria:

- Tests can run with `npx tsx --test` without Python, network, or model servers.
- The same contract tests can run against Pi-backed and Submarine-backed adapters.
- Contract tests fail if a runtime lacks required shared tools or resources.

### Slice 3: Tool Catalog Port

Goal: make tool discovery explicit and runtime-independent.

Todos:

- [x] Create a `ToolCatalog` port that lists tool names, labels, descriptions, schemas, and prompt snippets.
- [x] Implement a Node/Pi extension-backed `ToolCatalog` adapter.
- [x] Add tests for `internet_search`, browser tools, approval/guardrail listeners, and design-pattern tools appearing in the catalog.
- [x] Keep catalog reads scoped to the workspace `cwd`.

Acceptance criteria:

- `internet_search` appears in the tool catalog.
- Playwright/browser tools appear in the tool catalog.
- approval and guardrail commands/listeners appear in the catalog.
- Catalog code does not duplicate extension definitions.

### Slice 4: Tool Execution Bridge

Goal: let Submarine call the same tools that Pi-backed sessions use.

Todos:

- [x] Create a `ToolExecutor` port.
- [x] Implement a Node extension-backed executor.
- [x] Add a Submarine bridge method for tool execution requests.
- [x] Return tool text, details, artifacts, and error state to Submarine.
- [x] Preserve current artifact writes under `artifacts/`.
- [x] Preserve approval and guardrail behavior.

Acceptance criteria:

- A mocked Submarine session can call `internet_search`.
- A mocked Submarine session can call a browser debug tool.
- Tool artifacts are saved in the same paths and indexed the same way as Pi-backed execution.
- Tool failures are returned as structured failures instead of crashing the runtime.

### Slice 5: Skill And Prompt Resource Bridge

Goal: let Submarine see the same workspace skills and prompts as the Pi runtime.

Todos:

- [x] Create or reuse a `ResourceCatalog` abstraction around `.pi/skills`, `.pi/prompts`, and `.pi/knowledge`.
- [x] Build a Submarine resource context payload from the resource inventory.
- [x] Include key system guidance in the Submarine supervisor context.
- [x] Decide whether `/skill:name` command compatibility is required in the first implementation.
- [x] Add tests for `design-pattern-review`, `engineering-excellence`, TDD, browser debugging, Playwright guidance, and design knowledge resources.

Acceptance criteria:

- Submarine sessions can discover `design-pattern-review`.
- Submarine sessions can discover browser debugging guidance.
- Submarine supervisor receives enough resource context to choose tools/skills correctly.
- No skill content is duplicated into Submarine-specific files.

Decision: the first bridge preserves `/skill:name` references in the generated Submarine context, but it does not implement a full slash-command interpreter. Submarine receives resource names, paths, bounded previews, and guidance to route to the relevant resource. Full command compatibility can be added later if dogfooding shows the supervisor needs it.

### Slice 6: Setup Opt-In

Goal: make Submarine easy to configure without making it default.

Todos:

- [x] Add `pinchy setup` selector for runtime strategy.
- [x] Add Submarine setup prompts for Python path, script module, supervisor endpoint/model, and subagent endpoint/model.
- [x] Persist non-secret settings to `.pinchy-runtime.json`.
- [x] Keep API keys out of `.pinchy-runtime.json`; use `.pinchy/env` or shell env for secrets.
- [x] Add setup tests preserving existing runtime config.

Acceptance criteria:

- A user can enable Submarine from `pinchy setup`.
- Existing Pi-backed config is preserved unless the user chooses to change it.
- Setup output explains how to return to standard Pi runtime.
- Tests cover setup persistence and secret handling.

### Slice 7: Doctor Readiness

Goal: make Submarine failures diagnosable before users start runs.

Todos:

- [x] Add doctor checks for Python executable availability.
- [x] Add doctor checks for `python -m submarine.serve_stdio` launchability.
- [x] Add doctor checks for supervisor endpoint reachability.
- [x] Add doctor checks for subagent endpoint reachability.
- [x] Add doctor checks for tool bridge readiness.
- [x] Add doctor checks for workspace `.pi` resources.

Acceptance criteria:

- `pinchy doctor` distinguishes not configured, configured but unavailable, available but missing parity, and ready.
- Doctor hints include concrete next commands or config keys.
- Tests cover each status.

### Slice 8: Worker And Interactive Runtime Parity

Goal: ensure Submarine behaves correctly in daemon/worker and interactive paths.

Todos:

- [x] Validate worker `executeRun`.
- [x] Validate worker `resumeRun`.
- [x] Validate interactive `pinchy agent`.
- [x] Validate cancellation and interrupted runs.
- [x] Validate Discord run summary behavior.
- [x] Validate dashboard message rendering.

Acceptance criteria:

- Submarine worker runs produce the same persisted run states as Pi-backed runs.
- Waiting-for-human questions deliver and resume.
- Discord receives the actual assistant response, not only deterministic status text.
- Dashboard shows useful progress and completion state.

Implementation notes:

- Worker sessions now start with the shared tool catalog and workspace resource context in the Submarine `start_session` payload.
- Worker tool calls are routed through the Node tool bridge and returned to Submarine as structured `tool_result` payloads.
- Worker resume preserves the Submarine waiting task id so human replies target the yielded task.
- Interrupted Submarine sessions are converted to failed run outcomes instead of leaving the worker loop waiting forever.
- Interactive `pinchy agent` builds the same shared tool and resource payload as worker sessions and returns interactive `tool_call` events through the Node executor.
- Discord summaries and dashboard messages use the actual assistant response persisted from the Submarine outcome.

### Slice 9: Dogfooding

Goal: prove the runtime in real repo workflows.

Todos:

- [x] Run a conversational Discord request.
- [x] Run a coding task with a delegated subagent.
- [x] Run a web-search-backed question.
- [x] Run a browser debugging task.
- [x] Run a design pattern review task.
- [x] Run a human question/resume path.
- [x] Run cancellation or interrupted run recovery.
- [x] Run failed tool call recovery.

Acceptance criteria:

- Each workflow has notes with result, issues, and follow-up fixes.
- Any parity failure blocks default rollout.
- Known limitations are documented before release.

Dogfood notes: `docs/SUBMARINE_DOGFOODING.md`.

Decision: slice 9 completed deterministic repo dogfooding only. Live external dogfooding remains a blocker for treating Submarine as the proven production default.

### Slice 10: Recommended Default

Goal: make Submarine the dogfood default while preserving an explicit Pi fallback.

Todos:

- [x] Make `pinchy setup` recommend Submarine for new dogfood workspaces.
- [x] Keep standard Pi runtime as an explicit option.
- [x] Add release notes explaining when to choose each runtime.
- [x] Add rollback docs.

Acceptance criteria:

- New users can choose Submarine without hand-editing JSON.
- Existing users can opt out explicitly with `submarine.enabled: false`.
- Rollback is a documented one-line config change.

Dogfood default notes:

- `pinchy init` scaffolds new `.pinchy-runtime.json` files with `submarine.enabled: true`.
- Existing workspaces use Submarine unless they explicitly set `submarine.enabled` to `false`.
- `pinchy setup` recommends the Submarine runtime selector path by default.
- Standard Pi remains available by setting `submarine.enabled` to `false`.
- Live dogfood still decides whether this becomes the proven production default.

### Slice 11: Actual Default For New Installs

Goal: promote Submarine from dogfood default to proven production default after live dogfooding.

Todos:

- [ ] Change new workspace default runtime config.
- [ ] Keep explicit `submarine.enabled: false` escape hatch.
- [ ] Keep standard Pi runtime tests.
- [ ] Add migration notes for existing users.

Acceptance criteria:

- New workspaces default to Submarine.
- Existing workspaces retain their current runtime unless changed by setup.
- Full test suite passes with both runtime strategies covered.

## Detailed Work Plan

### 1. Define The Runtime Contract

Document the required customer-facing behavior that every runtime must preserve:

- main orchestration runs can answer conversationally
- delegated subagents can execute bounded coding work
- both orchestration and subagents can use shared workspace tools
- both orchestration and subagents can access shared workspace skills/prompts
- tool calls produce artifacts and audit records where expected
- human questions pause, deliver, accept replies, and resume correctly
- Discord and dashboard receive useful status and completion messages

### 2. Inventory Runtime Differences

Compare Pi-backed sessions and Submarine sessions across:

- tool loading
- skill and prompt loading
- resource loader behavior
- session persistence
- cancellation
- human questions
- streaming and message capture
- artifact creation
- approval and guardrail behavior

Output a small matrix with these states:

- works now
- missing
- unknown
- intentionally different

### 3. Add A Runtime Capability Test Harness

Create tests that assert both runtimes expose required capabilities. Use a mocked Submarine RPC process so tests do not require Python, live models, or network access.

Required checks:

- `internet_search` is available
- browser tools are visible
- design pattern skill/tool resources are discoverable
- guardrail and approval extensions still register
- human wait/resume still works
- Discord-facing completion messages still contain the actual assistant response

### 4. Design The Tool Bridge

Prefer a bridge that lets Submarine call the existing Pinchy/Pi tool catalog instead of reimplementing tools in Python.

Proposed pattern:

- Node owns the canonical tool registry from `.pi/extensions`.
- Submarine receives a catalog of tool schemas and descriptions.
- Submarine sends tool-call requests over RPC.
- Node executes the existing tool in the workspace context.
- Node returns text, details, artifacts, and errors to Submarine.

This keeps `internet_search`, Playwright tools, approval tools, artifact writes, and future tools single-sourced.

### 5. Design The Skill And Prompt Bridge

Decide how Submarine should access workspace guidance:

- raw skill and prompt files included in supervisor context
- a discoverable resource list exposed to the supervisor
- command compatibility for forms such as `/skill:design-pattern-review`

The minimal first version should include the workspace resource inventory and current system guidance in the Submarine session config.

### 6. Wire Submarine Into Setup

Add a `pinchy setup` runtime choice:

- standard Pi runtime
- Submarine runtime

For Submarine, collect:

- `pythonPath`
- `scriptModule`
- supervisor endpoint and model
- subagent endpoint and model
- optional per-agent backend settings

Persist this to `.pinchy-runtime.json`. This phase should make Submarine easy to opt into, but not the default.

### 7. Add Doctor Checks

Extend `pinchy doctor` with Submarine readiness checks:

- Python executable is available
- `python -m submarine.serve_stdio` launches
- supervisor model endpoint is reachable
- configured subagent model endpoint is reachable
- tool bridge can enumerate tools
- required workspace `.pi` resources exist

Doctor should clearly distinguish:

- not configured
- configured but unavailable
- available but missing tool parity
- ready

### 8. Dogfood In This Repo

Before making Submarine the default, dogfood these workflows:

- conversational Discord request
- coding task with a delegated subagent
- web-search-backed question
- browser debugging task
- design pattern review task
- human question and resume path
- cancellation or interrupted run
- failed tool call and recovery

Compare reliability and output quality against the current Pi-backed runtime.

### 9. Flip Defaults Gradually

Do not switch defaults until parity tests and dogfooding pass.

Recommended rollout:

1. Keep Pi-backed runtime as default.
2. Add explicit Submarine opt-in.
3. Make `pinchy setup` recommend Submarine when doctor checks pass.
4. Make new workspaces default to Submarine.
5. Keep an escape hatch:

```json
{
  "submarine": {
    "enabled": false
  }
}
```

## Release Strategy

### 0.3.5

- Exa/search setup improvements
- customer-facing setup and Discord improvements
- no Submarine default

### 0.3.6

- Submarine opt-in setup
- Submarine doctor checks
- runtime capability test harness

### 0.3.7

- Submarine tool bridge
- Submarine skill and prompt bridge
- parity tests for shared tools and skills

### 0.3.8

- Submarine recommended by setup when readiness checks pass
- continued Pi-backed fallback

### Later

- Submarine becomes the default for new installs
- Pi-backed runtime remains available as an explicit fallback until Submarine is proven stable across customer workflows
