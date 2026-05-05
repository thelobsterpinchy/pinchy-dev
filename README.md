# pinchy-dev

`pinchy-dev` is Pinchy: a local-first autonomous orchestration runtime you run on your own machine.

Pinchy owns the chat, memory, run, task, dashboard, and operator lifecycle while using the **Pi coding agent** framework as an internal execution backend:
- a `pinchy` CLI
- a local dashboard
- persistent conversations and runs
- bounded delegated task execution
- website, browser, desktop, and simulator debugging workflows
- local runtime state, auditability, and operator controls

## Install Pinchy

Install Pinchy globally:

```bash
npm install -g pinchy-dev
```

You can also install directly from GitHub:

```bash
npm install -g github:pinchy-dev/pinchy-dev
```

## Quick start

Inside the repository you want Pinchy to work on:

```bash
cd /path/to/your/repo
pinchy init
pinchy setup
pinchy doctor
```

### Universal start command

If you want **one command that works across local terminals, SSH sessions, and other non-interactive environments**, use:

```bash
pinchy up
```

`pinchy up` starts Pinchy's managed local services without requiring an interactive TTY.

After that, use whichever operator surface fits your environment:
- **local machine**: open the dashboard at `http://127.0.0.1:4310`
- **SSH / remote host**: port-forward `4310` and open the dashboard locally
- **interactive terminal with a real TTY**: run `pinchy agent`

Examples:

```bash
# local interactive shell
pinchy agent

# remote dashboard over SSH
ssh -L 4310:127.0.0.1:4310 your-host

# remote interactive shell with forced TTY
ssh -tt your-host 'cd /path/to/your/repo && pinchy agent'
```

## What Pinchy does

Pinchy is designed for developers who want a local coding agent that stays usable as a real everyday tool.

Pinchy is:
- **local-first** — your runtime state, dashboard, and workflows stay on your machine
- **chat-first** — the main experience is conversation-oriented rather than a pile of disconnected tools
- **orchestration-owned** — Pinchy owns durable memory, run state, task state, questions, and synthesis
- **inspectable** — runs, agent activity, questions, artifacts, and local state are visible and auditable
- **debugging-oriented** — especially strong at website, browser, and local app debugging
- **disciplined** — built to prefer TDD, small changes, and explicit validation

## Typical workflows

### Ask Pinchy to work in a repo
Use the chat shell or dashboard to ask Pinchy to inspect code, plan changes, implement a fix, or validate a result. This is the primary orchestration surface; delegated Pi-backed execution appears underneath it when useful.

### Debug a website or browser flow
Pinchy can reproduce issues, capture screenshots and DOM snapshots, inspect console/network failures, and compare artifacts.

### Debug a local app or simulator flow
Pinchy includes local desktop and simulator observation/control tools with approval-aware actions for bounded debugging work.

### Delegate multi-part work
For broader requests, Pinchy can break work into bounded delegated tasks, keep progress visible, and synthesize results back in-thread.

### Steer an active agent
When delegated work is running, you can intentionally inspect the execution session and submit scoped guidance without losing the main orchestration thread.

## Capability highlights

### Autonomous and iterative work
- scheduled defect-hunting cycles via `.pinchy-iteration.json`
- edge-case focused review prompts
- validation-aware iteration using detected test command
- bounded autonomous bug-finding and fixing loop
- daemon health and run timeline visibility

### Website and browser debugging
- `browser_debug_scan`
- `browser_dom_snapshot`
- `browser_run_probe`
- `browser_execute_steps`
- `browser_compare_artifacts`
- Playwright-backed browser investigation workflows

### Internet search
- `internet_search`
- provider-backed web lookup with saved JSON artifacts
- useful for targeted external fact-finding when local repo context is insufficient

### Desktop and simulator debugging
- desktop interaction and inspection tools
- screen text/template targeting helpers
- simulator tap, swipe, type, screenshot, and URL-opening workflows
- approval-aware local action controls

### Routines, approvals, and local control
- saved routines and queued routine execution
- session and persistent approval scopes
- queue-task and delegated-task workflows
- sandbox-only `dangerModeEnabled` support for explicit local risk acceptance

### Design guidance
- `design-pattern-review` skill for structure-heavy planning
- `search_design_patterns` and `get_design_pattern` tools for local pattern reference lookup
- `detect_design_anti_patterns` and `get_design_anti_pattern` tools for naming unhealthy structure and moving toward documented patterns
- `diagnose_design_problem`, `analyze_design_structure`, and `scan_repository_design_structure` for query-based, file-based, and repo-wide structural diagnosis
- concise local pattern and anti-pattern cards covering GoF, architectural, resilience, and refactoring guidance

### Local state and auditability
- persistent conversations, runs, and artifacts
- run context and run history metadata
- local runtime state files under the workspace
- visible questions, replies, and operator controls in the dashboard

## Dashboard

Pinchy includes a local dashboard designed as a real operator UI.

For most setups, the dashboard is the easiest cross-platform way to use Pinchy after `pinchy up`, especially on remote machines or over SSH.

The dashboard is centered on the chat workspace and supports:
- conversation-first chat threads
- workspace-aware conversations
- delegated task and orchestration visibility
- ephemeral agent-session takeover in the center pane
- scoped guidance for active delegated agents
- artifact filtering by query/tool/tag
- live updates through the local dashboard API/SSE stream
- daemon health and recent run visibility

Main dashboard entrypoints:
- `pinchy dashboard` — local dashboard server + API on port `4310`
- `npm run dashboard:web` — Vite dev server for dashboard UI development on port `4311`

### Danger Mode

Pinchy now supports a workspace-local `dangerModeEnabled` setting in `.pinchy-runtime.json` and the dashboard Settings page.

Use it only in a sandboxed environment when you want the workspace configuration to explicitly allow risky local actions such as:
- desktop interaction
- simulator control
- clicks and typing
- validation execution

This setting is intentionally descriptive and repo-local. It does **not** guarantee that host-level or platform-level approval prompts disappear, because some approval enforcement lives outside this repository.

The dashboard also acts as the operator view over Pinchy's persistent run model:
- browse conversations
- inspect runs, blocked questions, replies, and delivery attempts
- inspect delegated agent sessions for a conversation
- submit scoped guidance to an active delegated agent
- reply to waiting questions
- cancel in-flight runs

## Main commands

Common Pinchy commands:
- `pinchy init`
- `pinchy setup`
- `pinchy doctor`
- `pinchy up` — universal startup command for the managed local stack
- `pinchy down`
- `pinchy status`
- `pinchy logs [api|worker|dashboard]`
- `pinchy agent` — interactive shell, requires a real TTY
- `pinchy dashboard`
- `pinchy smoke`

If you are running from a source checkout instead of a published install, the equivalent `npm run ...` entrypoints are also available.

Pinchy can also load non-secret runtime defaults from `.pinchy-runtime.json`, including:
- `defaultProvider`
- `defaultModel`
- `defaultThinkingLevel`
- `dangerModeEnabled`

These runtime files are intended to be **workspace-local preferences and runtime state**, not shared secrets. In normal usage they are best treated as local/generated files created by `pinchy init`.

For the first async notification adapter, Discord webhook delivery is supported through:
- `PINCHY_DISCORD_WEBHOOK_URL`

Discord replies can also be ingested back into Pinchy through the local API webhook:
- `POST /webhooks/discord/reply`

For browser-debugging access, Pinchy’s Playwright-backed browser tools require a local browser install. The repo provides:
- `npm run playwright:install`

If Playwright is upgraded and browser tools start failing with a missing executable message, rerun that command.

## Runtime boundary

Pinchy now treats these path classes explicitly:
- **workspace-local**: `.pi/`, `.pinchy-runtime.json`, `.pinchy-goals.json`, `.pinchy-watch.json`, `.pinchy-daemon-health.json`, `.pinchy/run`, `.pinchy/state`, `logs/`
- **user-global**: `~/.pinchy/cache`, `~/.pinchy/tmp`

That keeps portable repo behavior inside the repo while leaving room for user-level cache/temp data outside it. In practice, the `.pinchy-*.json` runtime/config files are best treated as local workspace files rather than team-shared source files.

## For source-checkout development

If you are developing Pinchy itself from this repository, source-checkout commands are available too.

## Run from source

```bash
cd pinchy-dev
npm install
npm run playwright:install
npm run pinchy -- init
npm run pinchy -- up
npm run pinchy -- status
npm run pinchy -- agent
npm run dashboard
npm run dashboard:web
npm test
```
