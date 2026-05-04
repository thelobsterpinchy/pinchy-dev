---
slug: event-sourcing
name: Event Sourcing
family: Architectural
aliases: [event log model]
related: [cqrs, memento]
---

## Summary
Persist domain events as the source of truth so state can be rebuilt, audited, and projected from those events.

## Use when
- audit history is first-class
- rebuilding projections from historical changes is valuable
- domain events matter more than final row snapshots

## Avoid when
- simple current-state storage is enough
- event versioning and replay complexity are not justified

## Code smells
- important history is lost after each update
- audit requirements force awkward append-only side tables

## Structure
- append immutable events
- rebuild aggregate state from the event stream when needed
- derive read models from projections rather than mutating one canonical row in place

## Example
A workflow engine can store every run transition as events and derive the current dashboard state from projections.
