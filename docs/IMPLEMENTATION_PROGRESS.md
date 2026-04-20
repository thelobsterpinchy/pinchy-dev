# Implementation Progress

This document summarizes current progress against `docs/PRODUCT_PLAN.md` and the main residual gaps.

## Completed bounded slices

### Foundation
- shared Pinchy contracts in `packages/shared/src/contracts.ts`
- file-backed Pinchy state for conversations, messages, runs, questions, replies, and deliveries
- initial localhost API for conversations, messages, runs, questions, replies, and health
- Pinchy-owned runtime config layer for provider/model/thinking defaults

### Pi integration
- Pinchy-owned Pi execution facade in `services/agent-worker/src/pi-run-executor.ts`
- Pi-backed fresh run execution using `prompt(...)`
- Pi-backed resume execution using `followUp(...)`
- persisted `piSessionPath` on runs for later resume

### Worker progress
- queued run processing
- reply-driven resume for `waiting_for_human` runs
- persisted agent messages after queued and resumed runs
- worker loop now attempts resumable runs before queued runs

### Async notification progress
- first notification adapter: Discord webhook notifier
- persistent notification delivery records
- sent and failed Discord delivery states covered by tests

## Still incomplete relative to the full plan

### Notification layer
- no inbound Discord reply ingestion yet
- no iMessage adapter yet
- no custom Pinchy app adapter yet
- no API surface yet for listing notification deliveries

### Worker orchestration
- no explicit question delivery scheduling integrated into the worker loop yet
- no approval-wait resume path yet
- no richer run-state lifecycle handling beyond the current bounded slices

### Dashboard / UI
- dashboard is not yet wired into persistent conversations/runs/questions/replies as a primary operator UI
- no dedicated delivery visibility in dashboard yet
- no question inbox or resume controls in the UI yet

### Autonomous QA scheduling
- daemon cycles are not yet fully represented as persisted Pinchy runs
- autonomous QA scheduling is not yet unified under the new run model

## Recommendation for next slices
1. add API support for listing notification deliveries and recent run/question state together
2. wire Discord question sending into blocked-run handling
3. add dashboard visibility for conversations, questions, replies, and deliveries
4. convert autonomous daemon QA cycles into persisted Pinchy runs
