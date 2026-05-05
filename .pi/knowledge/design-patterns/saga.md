---
slug: saga
name: Saga
family: Architectural
aliases: [process manager]
related: [unit-of-work, event-sourcing]
---

## Summary
Coordinate a long-running business process across multiple steps using local transactions and compensating actions instead of one distributed transaction.

## Use when
- a workflow spans multiple services or resources
- distributed transactions are impractical
- failures need compensating actions and clear progress tracking

## Avoid when
- everything fits inside one local transaction
- compensation logic would be more complex than the workflow itself

## Code smells
- cross-service workflows with fragile partial-failure handling
- manual recovery steps for half-completed operations

## Structure
- model each step and compensation explicitly
- persist saga progress and decisions
- trigger next steps from events or orchestration logic

## Example
A multi-system onboarding flow can create local records, send invitations, and roll back account state if delivery fails later.
