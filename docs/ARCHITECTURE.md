# Architecture

## Overview

`pinchy-dev` is a **local Pi agent runtime** with three main layers:

1. **Pi host app**
   - starts interactive and daemon sessions via Pi SDK
   - manages session persistence and runtime startup
   - provides reusable helper modules for validation detection, browser artifact comparison, approval policy, image matching, task queueing, generated-tool review, and dashboard rendering/API state

2. **Pi extension layer**
   - adds browser debugging, desktop observation, validation helpers, local model provider registration, model routing, approval workflows, safety guardrails, audit logging, screen interaction, simulator tooling, task inbox, and self-improvement helpers

### Runtime state files
- `.pinchy-run-context.json` stores the current active run label/id
- `.pinchy-run-history.json` stores recent task/goal/iteration/watch/reload timeline entries
- `.pinchy-daemon-health.json` stores daemon heartbeat, activity, and last-error metadata
- `.pinchy-reload-requests.json` stores pending one-click runtime reload requests until the daemon consumes them

3. **Pi skill layer**
   - injects task-specific workflows for website debugging, app debugging, TDD implementation, design-pattern review, Playwright investigation, and self-improvement

## Runtime model

### Interactive mode
- launched by `npm run agent`
- uses Pi `InteractiveMode`
- loads local `.pi/` resources automatically
- persists sessions so work can continue like openclaw-style local operator flows

### Daemon mode
- launched by `npm run daemon`
- resumes or creates a session
- periodically runs autonomous maintenance/debugging prompts
- watches configured repo paths and queues bounded follow-up reviews on changes
- drains queued tasks before recurring goal cycles
- intended for local, supervised, long-running operation

### Dashboard mode
- `npm run dashboard` launches the local dashboard server on port `4310`
- serves the original server-rendered operator UI
- exposes JSON endpoints and an SSE stream for richer local clients
- supports approval/task/policy actions, generated-tool review lookups, artifact serving, and queue-reload flows

### Dashboard app mode
- `npm run dashboard:web` launches a Vite/React app on port `4311`
- consumes the local dashboard API via proxy
- adds live updates, artifact modal viewing, generated-tool review with git diff, daemon health visibility, run timeline visibility, one-click runtime reload requests, and richer operator controls

## Extension responsibilities

### `.pi/extensions/local-models`
Registers local model providers for Ollama and LM Studio using Pi's provider API.

### `.pi/extensions/model-router`
Selects model profiles for coding/debug/fast tasks and supports manual profile switching.

### `.pi/extensions/guardrails`
Blocks obviously dangerous shell/file operations and reinforces TDD + safe refactoring instructions.

### `.pi/extensions/validation-helper`
Detects likely validation/test commands and can run them with approval gates.

### `.pi/extensions/browser-debugger`
Provides website investigation tools using Playwright, including scan, DOM snapshot, repro probes, bounded step execution, and artifact comparison.

### `.pi/extensions/desktop-observer`
Provides local screenshot and active-app inspection tools for desktop debugging, lightweight accessibility-style UI snapshots, and approval-gated app opening.

### `.pi/extensions/screen-operator`
Provides guarded click/type/key tools plus exact PNG template matching for screen targeting.

### `.pi/extensions/simulator-tools`
Provides guarded Simulator workflows for listing devices, booting, opening URLs, screenshots, focusing, and typing.

### `.pi/extensions/task-inbox`
Stores queued tasks so long-running daemon sessions can process explicit backlog items.

### `.pi/extensions/approval-inbox`
Stores pending high-trust action requests in a project-local approval inbox and exposes review commands.

### `.pi/extensions/audit-log`
Writes tool and run events to local JSONL audit logs.

### `.pi/extensions/self-improver`
Adds structured self-improvement commands/tools so the agent can maintain this repo incrementally.

## Testability

Shared helper logic lives in:
- `apps/host/src/project-detection.ts`
- `apps/host/src/browser-artifacts.ts`
- `apps/host/src/approval-policy.ts`
- `apps/host/src/image-match.ts`
- `apps/host/src/task-queue.ts`

Unit tests live in:
- `tests/project-detection.test.ts`
- `tests/browser-artifacts.test.ts`
- `tests/task-queue.test.ts`
- `tests/image-match.test.ts`
- `tests/approval-policy.test.ts`

## Self-improvement model

Self-improvement here means **bounded repo maintenance**, not unrestricted recursive autonomy.

Allowed examples:
- tighten prompts and skills
- improve docs and scripts
- add tests and validations
- strengthen debugging workflows
- refactor extension code safely

Disallowed by default:
- broad machine-level changes
- weakening safety checks
- destructive cleanup outside this repo
- editing secrets or personal configs

## Local ops files

- `.pinchy-goals.json` — recurring daemon goals
- `.pinchy-watch.json` — watched paths and watcher-triggered review prompt
- `.pinchy-health.md` — recurring self-improvement hints
- `.pinchy-tasks.json` — queued tasks
- `.pinchy-approvals.json` — local approval inbox state
- `.pinchy-approval-policy.json` — persistent approval scopes
- `logs/pinchy-audit.jsonl` — local audit trail

## Suggested next upgrades

1. add OCR-based targeting in addition to exact template matching
2. add image-aware screenshot diffing beyond hash/size checks
3. add richer Simulator gesture helpers
4. add dashboard auth/token protection if exposed beyond localhost
5. add more extension-level tests and fixtures
