# Changelog

## 0.3.2

- harden queued task execution so tasks stay recoverable until their delegated child run is created
- propagate blocked delegated-task dependencies instead of leaving downstream work pending forever
- keep failed human-question deliveries retryable and fail answered runs that cannot resume because their Pi session path is missing
- make parallel worker batches resilient to individual run failures
- add Discord bot REST and webhook timeouts so notification delivery cannot hang worker progress indefinitely
- improve dashboard server test cleanup for local HTTP bind errors and lingering sockets

## 0.3.0

- make Pinchy's autonomous orchestration layer the documented primary product/runtime boundary, with Pi treated as an internal execution backend
- add `npm run release:verify` to run typecheck, tests, dashboard build, pack dry run, and packaged install smoke through one release gate
- harden release verification against local npm cache ownership issues by forcing an isolated temporary npm cache by default
- route the npm publish workflow through the shared release verifier before `npm publish`
- update dashboard and README language so delegated agents appear as bounded execution underneath the main orchestration thread
- update package metadata and install docs for the moved `pinchy-dev/pinchy-dev` GitHub repository

## 0.2.11

- separate orchestration-core state from Pi execution with file-backed task, agent-run, and event repositories
- add a Pi executor adapter so Pi is called through an explicit orchestration-core port
- route blocked questions, replies, guidance, completion, progress, and final synthesis through orchestration-core services
- fix ARM Node validation by avoiding the `tsx --test` IPC path and running test files sequentially through Node's native runner
- complete the orchestration-core migration roadmap and refresh related regression coverage

## 0.2.6

- add local design-pattern, anti-pattern, diagnosis, repository-scan, and remediation planning tools for more structured code review workflows
- add repo-local web search capability plus broader desktop-observer coverage and related validation
- expand the dashboard with task-focused views, recent-chat filtering, and richer task/run details
- improve provider/runtime configuration, task observability, daemon behavior, and local runtime documentation for day-to-day operator use

## 0.2.4

- keep one persistent Pi session per conversation by introducing canonical conversation session bindings in agent state
- expose conversation session diagnostics through dashboard state and aggregate conversation state for easier debugging
- fix reused idle Pi sessions so follow-up turns execute with `prompt(...)` instead of replaying stale assistant history
- verify live same-thread session reuse end-to-end so a second message can recall context from the earlier turn
- continue maturing the chat-first dashboard with agent-session, guidance, retention, and orchestration improvements now included in the release package

## 0.2.3

- add workspace-local `defaultBaseUrl` runtime support for local LLM and OpenAI-compatible endpoints
- expose `defaultBaseUrl` through the Pinchy config CLI, dashboard settings API, and Settings UI
- add local-server model discovery in Settings so a local `/models` endpoint can auto-detect and prefill the model name
- pass configured endpoint overrides through the Pi run executor by overriding resolved model `baseUrl`
- expand the Tools page from generated tools only to Pi-synced skills, extensions, and prompt resources
- preserve unsaved Settings form edits during live dashboard refreshes instead of clobbering in-progress changes

## 0.2.2

- add `pinchy doctor` for workspace/runtime/tooling checks
- add packaged install smoke validation via `npm run pinchy:install-smoke`
- fix published CLI packaging by moving `tsx` into runtime dependencies
- add `pinchy setup` for Playwright Chromium provisioning and optional local tool guidance
- add `pinchy version`
- improve `pinchy init` first-run guidance
- improve `pinchy status`, `pinchy down`, and `pinchy logs` operator UX
- codify workspace-local vs user-global Pinchy path boundaries
- add tag-based npm publish workflow and release documentation
