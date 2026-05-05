---
slug: unit-of-work
name: Unit of Work
family: Architectural
aliases: [transaction boundary]
related: [repository, saga]
---

## Summary
Track a set of related changes and commit them together so persistence stays consistent across one business operation.

## Use when
- multiple repositories must commit together
- one workflow needs a clear transaction boundary
- you need coordinated save and rollback semantics

## Avoid when
- writes are isolated and independent
- the extra abstraction would only wrap one save call

## Code smells
- partial updates when one persistence step fails
- transaction logic repeated across handlers

## Structure
- collect changes within one boundary object
- commit or rollback at the end of the use case
- keep repositories focused on aggregates while the unit of work owns transaction lifetime

## Example
A billing workflow updates invoice and payment records through one unit of work to avoid partial persistence.
