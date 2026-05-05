---
slug: callback-hell
name: Callback Hell
aliases: [pyramid of doom]
recommendedPatterns: [Pipeline, Orchestrator]
---

## Summary
Async flow nests deeply, making sequencing, errors, and state hard to follow.

## Symptoms
- nested callbacks grow to the right
- error handling is inconsistent across levels
- state is threaded manually through many closures

## Why it hurts
- control flow becomes unreadable
- failures leak or double-handle
- maintenance is psychologically expensive

## Detection hints
- look for deeply nested callbacks or chained anonymous functions
- notice repeated error branches in async code

## Example
A browser reproduction flow implemented as nested callbacks instead of clear steps is Callback Hell.
