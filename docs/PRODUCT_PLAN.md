# Product Plan

## Product definition

`pinchy-dev` should become a **local-first persistent autonomous coding shell** that users install as the product.

Pinchy is the user-facing system.
Pi is an embedded runtime dependency.

That means:
- users install and run **Pinchy**
- Pinchy ships the product behavior, orchestration, and UX
- Pinchy depends on `@mariozechner/pi-coding-agent` internally
- Pi remains the underlying coding-agent execution engine

Pinchy should feel like a complete product in the spirit of OpenClaw, Hermes, Codex, and Pi-powered local agents, while still relying on Pi for the core within-run agent execution model.

## Core architectural rule

**Pinchy wraps Pi. Pinchy does not replace Pi.**

Pinchy should be a custom wrapper shell and backend platform built on top of Pi.

Pi should continue to provide the general coding-agent runtime:
- session execution
- prompt/follow-up mechanics
- tool invocation
- extension loading
- skill loading
- within-run coding, QA, debugging, and decision-making behavior

Pinchy should provide the persistent shell around that runtime:
- conversations
- runs and tasks
- async question/reply handling
- notifications and messaging channels
- scheduling and background loops
- API/backend
- dashboard/app UX
- auditability and operator controls

## Product goal

Build a system where a user can:
1. submit a coding prompt into a persistent conversation
2. inspect progress, artifacts, summaries, logs, screenshots, and diffs
3. discuss follow-up work with the agent over time
4. receive asynchronous questions from the agent through Discord, iMessage, or a custom Pinchy app
5. reply later and have the blocked run resume correctly
6. leave the system running while offline so it can continue safe bugfix and QA work
7. operate all of this primarily on a local machine with durable local state

## Core product principles

### 1. Pinchy is the installed product
The user should think of the system as Pinchy.
Pi is an internal dependency, not the primary user-facing product surface.

### 2. Built on Pi, not a rewrite of Pi
Pinchy should reuse Pi for general coding-agent execution.
Pinchy should not grow a second independent agent runtime unless there is a compelling reason.

### 3. Local-first execution and persistence
- the primary runtime should run on the local machine
- local files and local services are the default persistence and control surface
- remote channels are adapters, not core dependencies

### 4. Persistent state
The system must preserve durable records for:
- conversations
- messages
- runs
- tasks
- questions
- replies
- approvals
- artifacts
- notification deliveries
- health and history

### 5. Async human loop
The user should not need to stay in the terminal.
Pinchy should support:
- blocked runs that wait for human input
- question delivery through external channels
- later replies that resume the same logical run

### 6. Explicit separation of concerns
Pinchy should keep clear boundaries between:
- shell orchestration and persistence
- Pi execution integration
- notification adapters
- API/backend
- UI clients

### 7. Repo-owned Pi resource strategy
Because Pinchy uses Pi as its execution backend, Pinchy can reuse valuable Pi skills, prompts, and extensions where appropriate.

However, Pinchy should prefer **repo-owned copies** over hidden machine-local dependencies.
That means:
- useful Pi skills may be imported into this repository
- imported skills should be adapted to Pinchy’s product model and terminology
- Pinchy should version and review those imported resources in-repo
- the repository should remain runnable without relying on a developer’s private Pi config state

### 8. Pinchy runtime configuration
Pinchy should support an explicit Pinchy-owned configuration layer for non-secret runtime defaults.

Good examples:
- default provider
- default model
- default thinking/reasoning profile
- default notification preferences
- default autonomy or scheduling preferences

These settings should be:
- explicit
- reviewable
- portable
- separate from secrets and credentials

Pinchy should **not** depend on copying machine-local Pi auth/session state into the repo.
In particular, Pinchy should not migrate:
- Pi auth tokens
- personal session history
- hidden machine-only state required for correctness

### 9. Safe autonomy
When the user is away, Pinchy should be able to continue bounded work safely by scheduling autonomous runs and allowing Pi to execute those runs.

## Responsibility split

## Pinchy owns
Pinchy should own the product shell behavior:
- persistent conversations
- run lifecycle management
- task queueing and scheduling
- async question/reply state
- approvals and operator controls
- audit trail and run history
- artifact indexing and operator visibility
- dashboard, app, and API surfaces
- notification delivery and reply ingestion
- autonomous scheduling for bugfix and QA runs
- worker orchestration and run resumption

## Pi owns
Pi should own the embedded coding-agent execution behavior inside a run:
- session lifecycle primitives
- prompt and follow-up execution
- tool invocation and tool orchestration
- extension and skill execution
- within-run planning
- within-run QA/debugging/coding decisions
- tactical decision-making about how to investigate, test, patch, and validate within a run

## Important implication
For autonomous QA and bugfix behavior:
- **Pinchy decides when to create, queue, pause, and resume a QA run**
- **Pi decides how to execute the QA/debugging/coding workflow within that run**

That means the actual QA agent behavior and within-run decision-making should come primarily from the Pi integration, not from a separate custom reasoning engine inside Pinchy.

## Target architecture

### A. `packages/shared`
Canonical contracts for Pinchy’s backend domain model.

Primary entities:
- `Conversation`
- `Message`
- `Run`
- `Task`
- `Question`
- `HumanReply`
- `Approval`
- `ArtifactRecord`
- `NotificationDelivery`
- `DaemonHealth`
- `DashboardState`

Purpose:
- define shared state contracts across Pinchy services and clients
- provide explicit run and question statuses
- keep Pinchy’s orchestration model consistent

### B. Pi integration layer
A Pinchy-owned adapter/facade around `@mariozechner/pi-coding-agent`.

Purpose:
- start or resume Pi-backed execution for a Pinchy run
- send prompts and follow-ups into Pi
- reuse Pi sessions where appropriate
- normalize Pi execution outputs into Pinchy-side run state
- support later resume after replies or approvals

This layer should hide direct Pi runtime details from higher-level Pinchy orchestration code.

### C. `apps/api`
A real local Pinchy control-plane API.

Responsibilities:
- conversations and messages
- runs and run status
- questions and replies
- tasks, approvals, and artifacts
- worker health and current state
- reply ingestion from dashboard/app/adapters

The API should expose Pinchy’s persistent shell state, not Pi internals directly.

### D. `services/agent-worker`
A persistent Pinchy orchestration worker.

Responsibilities:
- consume queued Pinchy runs and tasks
- decide which run to process next
- invoke the Pi integration layer for actual run execution
- persist run status transitions and summaries
- pause when waiting for human input or approvals
- resume runs when replies arrive
- schedule autonomous bugfix and QA runs when idle

The worker should orchestrate.
Pi should execute.

### E. Notification adapters
Channel adapters for:
- Discord
- iMessage
- custom Pinchy app

Responsibilities:
- send questions and run summaries
- deliver status updates
- ingest human replies
- normalize external messages into Pinchy reply records

### F. UI clients
Current:
- `apps/dashboard`

Future:
- custom Pinchy app
- richer operator UI for conversations, runs, questions, artifacts, approvals, and health

These clients should talk to Pinchy’s API and shell state.

### G. Repo-local Pi resources
Pinchy should maintain a strong repo-local `.pi` layer.

This includes:
- repo-local skills
- repo-local prompts
- repo-local extensions
- Pinchy-specific guidance layered on top of Pi capabilities

When useful skills already exist in an external or broader Pi configuration, Pinchy may import them into this repository, but should:
- review them before adoption
- adapt them to Pinchy’s architecture and workflow language
- keep them under version control here
- avoid depending on personal machine-only Pi configuration as a hidden runtime requirement

### H. Pinchy runtime config layer
Pinchy should maintain its own runtime config surface for non-secret defaults and operator preferences.

Examples:
- preferred provider
- preferred model
- preferred thinking level/profile
- notification channel preferences
- local autonomy defaults

This config should be Pinchy-owned and distinct from machine-level Pi auth/session files.

## Mental model

A useful mental model is:
- **Pinchy = supervisor shell / persistent platform**
- **Pi = working agent / execution substrate**

Pinchy should decide:
- what run exists
- when a run should start
- when a run should pause
- when a run should resume
- which autonomous runs should be scheduled
- how humans interact asynchronously with the system

Pi should decide, within the active run:
- what debugging steps to take
- what tools to use
- how to investigate and validate
- whether to add tests first where practical
- how to implement or refine a fix
- how to carry out the local coding/QA/debugging work

## Domain model

### Conversation
An ongoing user-agent discussion persisted by Pinchy.

Suggested fields:
- `id`
- `title`
- `createdAt`
- `updatedAt`
- `status`
- `latestRunId?`

### Message
A human or agent message inside a conversation.

Suggested fields:
- `id`
- `conversationId`
- `role`
- `content`
- `createdAt`
- `runId?`

### Run
A Pinchy-managed execution unit that is carried out through Pi.

Suggested fields:
- `id`
- `conversationId`
- `goal`
- `status`
- `createdAt`
- `updatedAt`
- `startedAt?`
- `completedAt?`
- `blockedReason?`
- `summary?`
- `piSessionRef?`

Suggested statuses:
- `queued`
- `running`
- `waiting_for_human`
- `waiting_for_approval`
- `completed`
- `failed`
- `cancelled`

### Task
Queued Pinchy work not necessarily tied to a single chat turn.

Suggested fields:
- `id`
- `title`
- `prompt`
- `source`
- `status`
- `createdAt`
- `updatedAt`
- `conversationId?`
- `runId?`

### Question
A blocking or clarifying question raised during a Pinchy-managed run.

Suggested fields:
- `id`
- `runId`
- `conversationId`
- `prompt`
- `status`
- `priority`
- `createdAt`
- `resolvedAt?`
- `channelHints?`

Suggested statuses:
- `pending_delivery`
- `waiting_for_human`
- `answered`
- `expired`
- `cancelled`

### HumanReply
A human answer to a blocked run question.

Suggested fields:
- `id`
- `questionId`
- `conversationId`
- `channel`
- `content`
- `receivedAt`
- `rawPayload?`

### Approval
A risky-action approval state.

Suggested fields:
- `id`
- `runId?`
- `toolName`
- `reason`
- `status`
- `payload`
- `createdAt`
- `resolvedAt?`

### ArtifactRecord
A Pinchy-visible record for generated outputs.

Suggested fields:
- `id`
- `runId?`
- `conversationId?`
- `toolName?`
- `path`
- `kind`
- `note?`
- `tags`
- `createdAt`

### NotificationDelivery
Tracking for external notifications.

Suggested fields:
- `id`
- `questionId?`
- `runId?`
- `channel`
- `status`
- `sentAt?`
- `deliveredAt?`
- `failedAt?`
- `externalId?`
- `error?`

## State machine

### Run lifecycle
Pinchy should own explicit run state.

States:
- `queued`
- `running`
- `waiting_for_human`
- `waiting_for_approval`
- `completed`
- `failed`
- `cancelled`

Required transitions:
- `queued -> running`
- `running -> waiting_for_human`
- `running -> waiting_for_approval`
- `running -> completed`
- `running -> failed`
- `waiting_for_human -> running`
- `waiting_for_approval -> running`
- `waiting_for_human -> cancelled`
- `waiting_for_approval -> cancelled`

### Question lifecycle
States:
- `pending_delivery`
- `waiting_for_human`
- `answered`
- `expired`
- `cancelled`

Required transitions:
- `pending_delivery -> waiting_for_human`
- `waiting_for_human -> answered`
- `waiting_for_human -> expired`
- `waiting_for_human -> cancelled`

## Persistence strategy

### Phase 1
Use local file-backed Pinchy persistence first.

Why:
- matches the local-first product goal
- simpler than introducing a DB too early
- good enough for the first version of the shell/backend model

Likely paths:
- `.pinchy/conversations/*.json` or collection JSON files
- `.pinchy/messages/*.json`
- `.pinchy/runs/*.json`
- `.pinchy/questions/*.json`
- `.pinchy/replies/*.json`
- `.pinchy/approvals/*.json`
- `.pinchy/tasks/*.json`
- `.pinchy/artifacts/index.json`
- `.pinchy/deliveries/*.json`

### Later phases
- SQLite if file-backed persistence becomes too limiting
- avoid premature remote multi-service persistence

## Pi integration plan

Pinchy needs an explicit Pi execution facade.

Responsibilities:
- create or resume a Pi session for a Pinchy run
- submit the initial run prompt to Pi
- submit follow-ups or replies to Pi
- capture structured results, summaries, and state transitions where possible
- map Pi execution back into Pinchy run records
- support later continuation of the same logical run
- ensure repo-local `.pi` skills, prompts, and extensions are part of the effective Pinchy runtime surface

The goal is to make the worker Pi-backed without leaking raw Pi runtime details throughout Pinchy.

## API plan

The first real Pinchy API should support:

### Conversations
- `POST /conversations`
- `GET /conversations`
- `GET /conversations/:id`

### Messages
- `POST /conversations/:id/messages`
- `GET /conversations/:id/messages`

### Runs
- `POST /runs`
- `GET /runs`
- `GET /runs/:id`
- `POST /runs/:id/cancel`
- later: `POST /runs/:id/resume`

### Questions
- `GET /questions`
- `GET /questions/:id`
- `POST /questions/:id/reply`

### Tasks
- `GET /tasks`
- `POST /tasks`

### Approvals
- `GET /approvals`
- `POST /approvals/:id/resolve`

### State and health
- `GET /artifacts`
- `GET /state`
- `GET /health`

## Worker plan

The Pinchy worker should be a long-lived orchestration service.

It should:
- consume queued tasks and runs
- choose the next run to execute
- invoke Pi for actual run execution
- persist progress and summaries incrementally
- persist blocked questions and approval waits
- resume Pi-backed runs after replies
- schedule autonomous QA/bugfix runs when idle

The worker should **not** become a second general coding-agent runtime.

## Autonomous QA and bugfix plan

Pinchy should support offline autonomous QA and bugfix work by scheduling and managing autonomous runs.

### Pinchy should do
- decide when to launch an autonomous QA run
- define the run goal and scope
- track run state and auditability
- persist artifacts and summaries
- notify the human if blocked or risky
- resume later when replies arrive

### Pi should do
Within that autonomous run, Pi should carry out the actual QA/debugging/coding decision process, including:
- inspecting failures
- choosing investigation steps
- deciding how to validate
- using tools to reproduce issues
- deciding whether tests should be added first where practical
- applying and validating small fixes

This preserves the correct product split:
- Pinchy schedules and supervises autonomous work
- Pi performs the underlying agent reasoning and execution inside that work

## Async communication plan

Each notification channel should act as an adapter with behavior like:
- `sendQuestion`
- `sendRunUpdate`
- `sendSummary`
- `parseIncomingReply`

Recommended order:
1. Discord
2. iMessage
3. custom Pinchy app

Normalized flow:
1. Pinchy worker creates or persists a blocked question
2. notification adapter sends it
3. delivery record is stored
4. user replies later
5. reply is normalized into a `HumanReply`
6. Pinchy resumes the blocked run through the Pi integration layer

## UI plan

The dashboard and future app should expose Pinchy’s shell state clearly.

The dashboard should evolve into an operator UI for:
- conversations
- message threads
- active and blocked runs
- pending questions
- artifacts by run
- approvals
- worker and backend health

A future Pinchy app should support:
- question inbox
- quick replies
- run summaries
- approval actions
- artifact links

## Implementation phases

### Phase 0 — align the product shape
Deliverables:
- this product plan
- architecture updates
- explicit Pinchy/Pi responsibility split
- prioritized implementation order

### Phase 1 — shared Pinchy contracts
Deliverables:
- `packages/shared/src/contracts.ts`
- tests for shared contracts
- migrate existing consumers to shared types

### Phase 2 — local Pinchy persistence layer
Deliverables:
- repository modules for conversations, messages, runs, questions, and replies

### Phase 3 — real Pinchy API
Deliverables:
- `apps/api/src/server.ts`
- initial localhost control-plane endpoints

### Phase 4 — Pi integration facade
Deliverables:
- explicit Pinchy-to-Pi execution adapter
- session create/resume behavior
- normalized execution result handling
- clear loading path for repo-local Pinchy `.pi` resources

### Phase 5 — repo-local Pi skill import and adaptation
Deliverables:
- audit existing useful Pi skills/prompts/extensions available for reuse
- import the best candidates into this repository where appropriate when safe resources are actually found
- adapt imported resources to Pinchy terminology and workflow boundaries
- keep imported resources versioned and reviewed in-repo
- document the audit result when no safe external resources are available for import

### Phase 6 — Pinchy runtime config layer
Deliverables:
- define a Pinchy-owned config surface for non-secret runtime defaults
- support provider/model/thinking-profile defaults
- keep config separate from auth/session secrets and machine-private state

### Phase 7 — Pinchy worker service
Deliverables:
- `services/agent-worker/src/worker.ts`
- run orchestration using the Pi integration layer
- blocked question creation and reply-driven resume support

### Phase 8 — dashboard/app integration
Deliverables:
- dashboard reads and writes through Pinchy’s API
- dashboard supports prompts and replies against persistent runs

### Phase 9 — autonomous QA loops
Deliverables:
- first-class autonomous QA/bugfix run scheduling in Pinchy
- Pi-backed execution of those autonomous runs
- persisted summaries and run records

### Phase 10 — first notification adapter
Deliverables:
- Discord question delivery and reply ingestion

### Phase 11 — additional channels
Deliverables:
- iMessage support
- custom Pinchy app support

### Phase 12 — UX refinement
Deliverables:
- better conversation threading
- better artifact browsing
- clearer async state visibility
- stronger operator controls

## Recommended implementation order now
1. keep the product plan aligned with the Pinchy/Pi split
2. implement and refine shared Pinchy contracts
3. complete file-backed Pinchy repositories for core entities
4. implement a fuller real Pinchy API
5. add the Pi integration facade
6. audit and import the highest-value reusable Pi skills/prompts into the repo-local Pinchy `.pi` layer
7. add a Pinchy-owned runtime config layer for non-secret defaults
8. make the worker fully Pi-backed
9. wire dashboard to the API and run model
10. add reply-driven run resume behavior
11. add the first async notification adapter
12. add autonomous QA scheduling around Pi-backed runs

## Definition of success

Pinchy succeeds when:
1. a user installs Pinchy as the product
2. Pinchy uses Pi internally as its execution dependency
3. a user can submit a coding prompt into a persistent conversation
4. Pinchy creates and tracks a durable run
5. Pi executes the actual coding/debugging/QA work within that run
6. Pinchy persists progress, artifacts, and summaries
7. the agent can ask clarifying questions asynchronously
8. the user can reply later through Discord, iMessage, or a Pinchy app
9. Pinchy resumes the run correctly through the Pi integration
10. when the user is away, Pinchy schedules safe autonomous bugfix and QA runs, while Pi performs the underlying run execution and decision-making
11. the full system remains primarily local-first and auditable
