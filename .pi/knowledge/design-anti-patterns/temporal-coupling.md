---
slug: temporal-coupling
name: Temporal Coupling
aliases: [order dependency]
recommendedPatterns: [Builder, Template Method, State]
---

## Summary
Code only works if methods are called in a hidden order that the API does not make explicit.

## Symptoms
- initialization steps must happen in sequence
- objects are invalid until several calls complete
- bugs come from missing one setup call

## Why it hurts
- APIs become trap-filled
- callers must memorize lifecycle order
- partial initialization bugs occur

## Detection hints
- look for comments saying must call X before Y
- inspect objects with setup followed by start or finalize methods

## Example
A run object that requires setModel, setContext, setPermissions, then start in the right order has temporal coupling.
