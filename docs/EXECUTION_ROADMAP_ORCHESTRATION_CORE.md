# Orchestration Core Execution Roadmap

This roadmap tracks the migration to a **Pinchy-native orchestration core** where Pinchy owns context, memory, progress, human interaction, and child-agent lifecycle while Pi becomes an execution adapter.

## Slice goals
- keep changes additive and test-driven
- preserve current behavior while moving control-plane ownership into Pinchy
- clean up old orchestration code after each migrated slice instead of doing a big-bang rewrite
- leave Pi integration behind an adapter boundary

## Daemon-followable execution order

### Task 1 — Core contracts and spawn-ready-agents skeleton
Add the first orchestration-core types, ports, and a minimal `spawnReadyAgents` application service. Cover the new shared contracts and the first spawn flow with narrow tests. Keep the implementation adapter-free except for mockable ports.

### Task 2 — File-backed repositories and event log
Add file-backed orchestration repositories and an append-only orchestration event log. Wire the new core to persisted state without changing dashboard behavior yet.

### Task 3 — Pi executor adapter and polling bridge
Implement `PiAgentExecutor` plus a polling bridge that translates Pi state into Pinchy orchestration events. Keep Pi-specific translation logic isolated inside the adapter.

### Task 4 — Blocked questions, replies, and human guidance
Route blocked child questions through the orchestration core, persist them as first-class records, allow human replies/guidance to reach the correct child agent, and add regression tests for wake/resume behavior.

### Task 5 — Completion synthesis and progress queries
Add progress aggregation and parent wake-up when all child tasks finish. Generate Pinchy-native human summaries for delegated outcomes and expose query services for dashboard/API use.

### Task 6 — Cleanup old orchestration threading helpers
Remove or slim down superseded helpers in `orchestration-thread.ts`, `task-observability.ts`, and related state glue once equivalent orchestration-core behavior is live and validated.

## Definition of roadmap completion
Done means:
- Pinchy owns parent/child orchestration state and wake-up behavior
- Pi is optional infrastructure behind an executor port
- blocked questions, replies, guidance, cancellation, progress, and final synthesis flow through orchestration-core services
- old orchestration glue has been deleted or reduced to thin adapters
- targeted tests and `npm test`/`npm run check` are green for the completed slices
