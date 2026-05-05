---
slug: orchestrator
name: Orchestrator
family: Architectural
aliases: [workflow orchestrator]
related: [mediator, saga]
---

## Summary
Centralize multi-step workflow coordination in one component that sequences tasks and reacts to outcomes.

## Use when
- a workflow spans several collaborators
- step ordering and retries matter
- you need one place to reason about progress

## Avoid when
- the process is only one or two direct calls
- an orchestrator would become a vague god object

## Code smells
- workflow sequencing scattered across many modules
- no single place explains the end-to-end process

## Structure
- keep orchestration separate from domain rules and leaf operations
- model step transitions explicitly
- surface progress and failure state clearly

## Example
The worker already acts as an orchestrator for queued runs, questions, and follow-up state transitions.
