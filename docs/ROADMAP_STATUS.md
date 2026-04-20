# Roadmap Status

This file tracks execution progress for `docs/EXECUTION_ROADMAP.md`.

## Overall status
- currentPhase: 1
- currentTask: Roadmap Task 1
- overallState: queued
- lastUpdated: 2026-04-20T19:41:31.000Z

## Task checklist

### Task 1 — Structured run outcomes and worker transitions
- status: queued
- goal: add structured Pi/worker outcome handling for completed, waiting_for_human, waiting_for_approval, and failed runs
- validation: `npm test && npm run check`
- notes: requeued at the front of the roadmap execution order

### Task 2 — Blocked question delivery scheduling and delivery API visibility
- status: queued
- goal: deliver blocked questions, persist delivery attempts, and expose delivery visibility in the API
- validation: `npm test && npm run check`
- notes: pending

### Task 3 — Inbound reply normalization and resume-safe reply ingestion
- status: queued
- goal: normalize inbound replies and make reply ingestion safe for resume behavior
- validation: `npm test && npm run check`
- notes: pending

### Task 4 — Convert daemon autonomous work into queued Pinchy runs
- status: queued
- goal: make daemon autonomous work enqueue runs instead of directly executing Pi prompts for recurring autonomous work
- validation: `npm test && npm run check`
- notes: pending

### Task 5 — First-class autonomous QA run kind and scheduling
- status: queued
- goal: represent QA work as explicit run kinds processed through worker + Pi
- validation: `npm test && npm run check`
- notes: pending

### Task 6 — Expand API into main control plane
- status: queued
- goal: make the Pinchy API the primary backend control surface for dashboard/app clients
- validation: `npm test && npm run check`
- notes: pending

### Task 7 — Wire dashboard to conversations, runs, questions, and deliveries
- status: queued
- goal: make dashboard a primary operator UI over persistent shell state
- validation: `npm test && npm run check`
- notes: pending

### Task 8 — Finish first end-to-end async notification channel
- status: queued
- goal: complete one async channel end-to-end, prioritizing Discord outbound + inbound replies
- validation: `npm test && npm run check`
- notes: pending

### Task 9 — Operational hardening and observability
- status: queued
- goal: improve health visibility, audit clarity, run IDs, failure summaries, and ops docs
- validation: `npm test && npm run check`
- notes: pending

## Update rules
When working through the roadmap:
1. mark only one task as `in_progress` at a time
2. move a task to `done` only after validation passes
3. if a task is partially complete, record residual gaps in notes
4. update `currentPhase`, `currentTask`, `overallState`, and `lastUpdated`
5. do not skip ahead without recording why
