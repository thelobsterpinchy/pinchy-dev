---
slug: cqrs
name: CQRS
family: Architectural
aliases: [command query responsibility segregation]
related: [event-sourcing, repository]
---

## Summary
Separate write models from read models when commands and queries have different scaling, consistency, or design needs.

## Use when
- reads and writes have very different shapes
- read performance or projection needs dominate
- one model is becoming awkward for both mutation and querying

## Avoid when
- the domain is simple CRUD
- eventual consistency would add more confusion than value

## Code smells
- one bloated model trying to serve both writes and reporting
- read queries forcing compromises in write-side design

## Structure
- keep command handling focused on state changes and invariants
- build query-side projections optimized for reads
- be explicit about consistency boundaries

## Example
A run system writes canonical state transitions while the dashboard reads from projection-friendly summaries and activity views.
