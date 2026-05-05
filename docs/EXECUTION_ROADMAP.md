# Execution Roadmap

This roadmap translates `docs/PRODUCT_PLAN.md` into the shortest path to a working end-to-end Pinchy shell built on top of Pi.

## Objective

Get these systems working together as one coherent product flow:
- Pinchy API
- Pinchy worker
- Pi integration facade
- async messaging
- autonomous QA / bugfix loop
- dashboard/operator visibility

The key idea is:
- **Pinchy owns orchestration, persistence, scheduling, and async messaging**
- **Pi owns within-run execution and decision-making**

## Current state summary

### Already present
- file-backed Pinchy state for conversations, messages, runs, questions, replies, and deliveries
- shared backend contracts
- initial local API
- initial worker loop
- Pi execution facade
- runtime config layer
- Discord outbound notifier
- dashboard and daemon infrastructure

### Main gap
The repo still has two orchestration models:
1. the older daemon prompt loop
2. the newer run/worker/API model

To finish the system, all meaningful work should converge on the **Pinchy run lifecycle**.

## Target operating model

### User-triggered flow
1. user submits prompt to Pinchy API
2. API persists conversation/message/run
3. worker picks queued run
4. worker invokes Pi facade
5. Pi executes the run
6. worker persists outcome
7. dashboard/app shows current run state and artifacts

### Blocked-question flow
1. worker/Pi execution determines clarification is needed
2. run becomes `waiting_for_human`
3. question is persisted
4. notifier sends question
5. delivery is persisted
6. user replies later via dashboard/API/adapter
7. reply is persisted
8. worker resumes the run through Pi

### Autonomous QA flow
1. scheduler/daemon creates a `qa_cycle` run
2. worker executes it through Pi
3. Pi performs QA/debugging/coding decisions within the run
4. worker persists completion, failure, or blocked question state
5. if blocked, async messaging loop takes over

## Design rules

### Rule 1: Runs are the universal execution unit
All meaningful work should become a Pinchy run.

Examples:
- user prompt run
- watcher follow-up run
- self-improvement run
- QA cycle run
- resume-after-reply run

### Rule 2: Worker executes, daemon schedules
- daemon should enqueue runs
- worker should execute runs
- daemon should stop prompting Pi directly for long-lived autonomous work

### Rule 3: Pi results must be normalized
The Pi facade should return structured execution outcomes that Pinchy can persist reliably.

### Rule 4: Questions and deliveries are first-class state
If a run blocks, the system must persist:
- the question
- the delivery attempt(s)
- the waiting run state
- the human reply
- the later resume

## Phase plan

## Phase 1 — Unify execution around run outcomes

### Goal
Teach the worker and Pi facade to communicate using structured run outcomes rather than only summary/message strings.

### Deliverables
- richer Pi facade result contract
- explicit run outcome types:
  - `completed`
  - `waiting_for_human`
  - `waiting_for_approval`
  - `failed`
- worker-side run transition handling module
- tests for run transitions and outcome handling

### File targets
- `services/agent-worker/src/pi-run-executor.ts`
- `services/agent-worker/src/worker.ts`
- add something like:
  - `services/agent-worker/src/run-outcomes.ts`
  - `services/agent-worker/src/run-transition-manager.ts`
- tests under `tests/`

### Success criteria
- worker can persist all major run outcomes
- `waiting_for_human` and `failed` are first-class handled outcomes
- no ad hoc inline transition logic spread through the worker

---

## Phase 2 — Complete blocked question lifecycle

### Goal
Make blocked runs actually deliver questions and become resumable through the same state model.

### Deliverables
- question delivery dispatcher
- worker integration for newly blocked questions
- API for listing deliveries
- optional aggregate endpoint for run/question/delivery state
- tests for delivery scheduling and blocked-run persistence

### File targets
- `services/notifiers/discord.ts`
- add something like:
  - `services/notifiers/dispatcher.ts`
  - `services/agent-worker/src/question-delivery.ts`
- `apps/api/src/server.ts`
- `apps/host/src/agent-state-store.ts`

### Success criteria
- blocked question leads to delivery attempt(s)
- delivery records are queryable through API
- run remains resumable after reply arrives

---

## Phase 3 — Add inbound reply normalization

### Goal
Make replies from external channels and UI clients flow into the same reply ingestion path.

### Deliverables
- stable API reply ingestion path
- adapter contract for external inbound replies
- Discord inbound normalization plan or minimal webhook endpoint
- tests for reply normalization into `HumanReply`

### File targets
- `apps/api/src/server.ts`
- add something like:
  - `services/notifiers/inbound-replies.ts`
  - `services/notifiers/discord-inbound.ts`

### Success criteria
- dashboard and external adapters can both create resumable replies
- replies always map back to a question/run cleanly

---

## Phase 4 — Convert daemon into a run producer

### Goal
Make the daemon produce Pinchy runs instead of directly running long-lived Pi prompts for autonomous work.

### Deliverables
- autonomous goals become queued runs
- watcher follow-ups become queued runs
- iteration/QA cycles become queued runs
- daemon keeps scheduling and health tracking
- worker becomes the single executor

### File targets
- `apps/host/src/pinchy-daemon.ts`
- `apps/host/src/task-queue.ts` or new run-enqueue helpers
- `apps/host/src/agent-state-store.ts`
- maybe add:
  - `apps/host/src/run-enqueue.ts`
  - `apps/host/src/autonomous-run-plans.ts`

### Success criteria
- daemon no longer prompts Pi directly for recurring autonomous work
- daemon creates persistent runs
- worker executes those runs
- run history reflects autonomous work in the same model as user work

---

## Phase 5 — Make autonomous QA a first-class run kind

### Goal
Represent autonomous QA and bugfix work explicitly inside the new run model.

### Deliverables
- run kinds / intent classification
- first-class `qa_cycle` run creation
- Pi-backed QA run prompts
- persisted summaries and blocked questions for QA runs

### Suggested run kinds
- `user_prompt`
- `qa_cycle`
- `watch_followup`
- `self_improvement`
- `resume_reply`

### File targets
- `packages/shared/src/contracts.ts`
- `apps/host/src/agent-state-store.ts`
- `apps/host/src/pinchy-daemon.ts`
- `services/agent-worker/src/pi-run-executor.ts`

### Success criteria
- autonomous QA runs are visible and queryable like any other run
- Pi remains the within-run QA/debugging engine

---

## Phase 6 — Upgrade API into the real control plane

### Goal
Make the API the primary backend surface for dashboard/app/operator tooling.

### Deliverables
- `GET /runs/:id`
- `GET /questions/:id`
- `GET /deliveries`
- `POST /runs/:id/cancel`
- aggregate state endpoint(s) for conversations and runs
- create-run convenience endpoint for conversations

### File targets
- `apps/api/src/server.ts`

### Success criteria
- dashboard/app can run almost entirely from Pinchy API
- clients do not need to read raw state files

---

## Phase 7 — Turn dashboard into the real operator UI

### Goal
Make the dashboard reflect the new persistent run system instead of mainly legacy task/approval views.

### Deliverables
- conversation list
- run list per conversation
- question inbox
- reply UI
- delivery visibility
- resumable run visibility

### File targets
- `apps/dashboard/src/main.tsx`
- optionally `apps/host/src/dashboard.ts` if server API/state expansion is needed

### Success criteria
- user can observe and interact with the new run lifecycle from dashboard
- blocked question and reply flow is visible

---

## Phase 8 — Expand notification system

### Goal
Make async messaging truly useful across channels.

### Deliverables
- keep Discord working end-to-end
- add iMessage adapter scaffolding
- add Pinchy app adapter scaffolding
- choose default channel selection rules from config/preferences

### File targets
- `services/notifiers/*`
- `apps/host/src/runtime-config.ts`
- maybe `packages/shared/src/contracts.ts`

### Success criteria
- at least one channel works outbound + inbound end-to-end
- channel preferences are configurable

---

## Phase 9 — Operational hardening

### Goal
Make the new shell reliable for daily unattended use.

### Deliverables
- improved health visibility
- richer audit/logging around run IDs and outcomes
- start/end timing around worker jobs
- failure summaries
- docs for recommended overnight operation

### File targets
- `apps/host/src/daemon-health.ts`
- `logs/pinchy-audit.jsonl` producers
- `docs/LOCAL_RUNTIME.md`
- `docs/OPERATIONS.md`

### Success criteria
- overnight unattended use is observable and debuggable

## Daemon-followable execution order

The daemon should process this roadmap in order as bounded tasks.

### Task 1
Implement Phase 1: structured run outcomes and worker transition handling.

### Task 2
Implement Phase 2: blocked question delivery scheduling and delivery API visibility.

### Task 3
Implement Phase 3: inbound reply normalization and resume-safe reply ingestion.

### Task 4
Implement Phase 4: convert daemon autonomous work into queued Pinchy runs.

### Task 5
Implement Phase 5: first-class autonomous QA run kind and scheduling.

### Task 6
Implement Phase 6: expand API into the main control plane.

### Task 7
Implement Phase 7: wire dashboard to conversations/runs/questions/deliveries.

### Task 8
Implement Phase 8: finish first end-to-end notification channel and scaffold others.

### Task 9
Implement Phase 9: operational hardening, audit clarity, and run observability.

## Step-by-step daemon guidance

When the daemon follows this roadmap, it should:
1. complete one task at a time
2. use TDD for each bounded behavior change
3. avoid broad rewrites across multiple phases in a single pass
4. re-run validation after each bounded slice
5. document residual gaps if a phase is only partially completed
6. queue the next roadmap task only after the current one is validated

## Definition of roadmap completion

This roadmap is complete when:
- all meaningful work is represented as Pinchy runs
- the worker is the single execution path for those runs
- the daemon schedules work instead of directly executing Pi prompts for autonomous loops
- blocked questions are delivered and resumable
- at least one async messaging channel works end-to-end
- dashboard reflects the persistent run lifecycle
- autonomous QA runs operate through the same Pi-backed run model
