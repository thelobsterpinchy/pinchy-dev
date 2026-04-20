# Implementation Checklist

This checklist focuses on the highest-value missing pieces in `pinchy-dev` based on the current codebase shape.

## Priority 1 — Harden what already exists

### 1. Real CI for the current runtime
Why:
- the repository already has a meaningful TypeScript codebase
- the repository already has passing tests
- the current GitHub Actions workflow is still a placeholder

Files:
- `.github/workflows/ci.yml`
- `package.json`

Recommended implementation:
- run `npm ci`
- run `npm run check`
- run `npm test`
- keep the workflow minimal and fast

Definition of done:
- pull requests fail on type or test regressions
- CI uses the existing repo scripts instead of echo placeholders

---

### 2. Shared contracts for host, dashboard, and future services
Why:
- `apps/host` and `apps/dashboard` already share common domain shapes
- future `apps/api` and `services/*` work will be cleaner with explicit contracts

Files to add:
- `packages/shared/src/contracts.ts`
- `tests/shared-contracts.test.ts`

Likely first contracts:
- `Task`
- `ApprovalRecord`
- `RunContext`
- `RunHistoryEntry`
- `DaemonHealth`
- `ReloadRequest`
- `DashboardState`

Recommended implementation:
- start with TypeScript-first contracts
- optionally add TypeBox schemas where runtime validation is helpful
- keep contracts focused on shapes already used by the app

Definition of done:
- at least two consumers import shared contracts instead of redefining them locally
- contracts are covered by focused tests

---

### 3. Add extension-level tests for existing product behavior
Why:
- much of the actual product capability lives in `.pi/extensions`
- extension behavior is higher leverage than building speculative services

Good first targets:
- `.pi/extensions/guardrails/index.ts`
- `.pi/extensions/validation-helper/index.ts`
- `.pi/extensions/model-router/index.ts`
- `.pi/extensions/approval-inbox/index.ts`
- `.pi/extensions/routines/index.ts`

Recommended implementation:
- extract small pure helpers where needed
- test policy decisions and prompt/tool wiring contracts
- avoid broad integration tests when narrow unit tests are enough

Definition of done:
- critical extension decisions are validated by tests
- behavior changes in extensions require regressions to pass

---

### 4. Refactor the dashboard backend into smaller modules
Why:
- `apps/host/src/dashboard.ts` currently mixes rendering, API, state assembly, actions, and SSE
- that makes future `apps/api` extraction harder

Files to split from `apps/host/src/dashboard.ts`:
- `apps/host/src/dashboard-state.ts`
- `apps/host/src/dashboard-actions.ts`
- `apps/host/src/dashboard-html.ts`
- `apps/host/src/dashboard-generated-tools.ts`

Recommended pattern:
- use a small facade in `dashboard.ts`
- keep domain/state helpers separate from HTTP orchestration

Definition of done:
- `dashboard.ts` becomes a thin composition root
- API state and action handlers are testable without booting the server

---

## Priority 2 — Expose a cleaner API boundary

### 5. Make `apps/api` real only as a thin control-plane API
Why:
- the repo already has an API surface inside the dashboard server
- a thin API is useful only if it reuses existing host logic instead of duplicating it

Files to add:
- `apps/api/src/server.ts`
- `apps/api/src/routes/*.ts`
- shared imports from `packages/shared`

Good minimal endpoints:
- `GET /state`
- `GET /tasks`
- `POST /tasks`
- `POST /approvals/:id/resolve`
- `GET /runs`
- `POST /reload-requests`

Definition of done:
- the API is thinner than the current dashboard server, not broader
- route contracts align with shared types

---

## Priority 3 — Platformization only after the local runtime is stable

### 6. `services/gateway`
Implement only after shared contracts and API boundaries are stable.

First useful slice:
- provider registry
- normalized model listing
- simple OpenAI-compatible pass-through endpoint

Recommended pattern:
- adapter per provider type

### 7. `services/desktop-bridge`
Implement only if desktop capabilities need a separate high-trust process.

First useful slice:
- screenshot capture
- active window metadata
- accessibility snapshot

Recommended pattern:
- narrow IPC facade around privileged operations

### 8. `services/agent-worker`
Implement only if the current daemon model becomes limiting.

First useful slice:
- consume explicit queued runs
- execute one bounded task lifecycle
- persist result and status transitions

Recommended pattern:
- orchestration loop separated from persistence and tool execution policy

---

## Priority 4 — UX shells

### 9. `apps/desktop`
Only after the runtime and API are stable.

### 10. `apps/web`
Only if it has a distinct role from `apps/dashboard`.

---

## Suggested execution order
1. Real CI
2. Shared contracts
3. Extension-level tests
4. Dashboard backend refactor
5. Thin control-plane API
6. Gateway
7. Desktop bridge
8. Agent worker
9. Desktop shell
10. Additional web shell
