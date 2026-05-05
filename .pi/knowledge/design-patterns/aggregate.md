---
slug: aggregate
name: Aggregate
family: Architectural
aliases: [aggregate root]
related: [domain-model, repository]
---

## Summary
Cluster related domain objects around one consistency boundary with a root that enforces invariants for the whole group.

## Use when
- invariants span multiple child objects
- you need a clear transactional boundary
- external code should not mutate nested parts directly

## Avoid when
- relationships are loose and do not require one consistency boundary
- the aggregate would become too large and chatty

## Code smells
- callers modify nested entities directly
- invariants break because updates bypass a central rule owner

## Structure
- choose one aggregate root as the access point
- guard child mutations through the root
- persist and load the aggregate through one repository boundary

## Example
A Conversation aggregate could own messages, runs, questions, and replies under one root interface.
