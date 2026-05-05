---
slug: singleton-abuse
name: Singleton Abuse
aliases: [global singleton]
recommendedPatterns: [Dependency Injection, Registry]
---

## Summary
A singleton is used as a convenience global for many unrelated concerns, making state hidden and tests brittle.

## Symptoms
- many modules read and mutate one global instance
- reset logic is needed between tests
- the singleton becomes a dumping ground

## Why it hurts
- global state obscures dependencies
- parallelism and tests get harder
- responsibility boundaries disappear

## Detection hints
- look for static getInstance calls everywhere
- see whether the singleton owns unrelated concerns

## Example
A global runtime manager storing config, caches, queues, and UI state is singleton abuse.
