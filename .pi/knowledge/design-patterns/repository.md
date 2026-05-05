---
slug: repository
name: Repository
family: Architectural
aliases: [data repository]
related: [unit-of-work, specification]
---

## Summary
Hide persistence details behind a collection-like interface so domain logic is not coupled to queries, tables, or transport details.

## Use when
- domain logic should not know storage details
- you need to swap persistence mechanisms or mock data access in tests
- query logic is leaking across services

## Avoid when
- the application is thin CRUD and direct queries are already clear
- the repository would only mirror one ORM method per line

## Code smells
- SQL or ORM details inside domain orchestration
- duplicate query logic across services and handlers

## Structure
- define a domain-facing repository interface
- keep mapping and persistence details in infrastructure implementations
- return domain-friendly objects or records

## Example
A task repository loads and saves queued tasks without exposing JSON file layout or database calls to the worker.
