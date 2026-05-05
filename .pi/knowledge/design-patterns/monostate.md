---
slug: monostate
name: Monostate
family: Architectural
aliases: [borg pattern]
related: [singleton, registry]
---

## Summary
Share state across many instances while keeping instance creation cheap, but use sparingly because it still behaves like global state.

## Use when
- you need shared process-wide state without enforcing one object instance
- the lifecycle is truly global

## Avoid when
- explicit dependency injection would be clearer
- tests need isolated state per instance

## Code smells
- hidden global state with surprising instance behavior
- objects appear independent but mutate the same backing store

## Structure
- store shared state in one backing location
- document that instances share state
- prefer explicit globals only when justified

## Example
A monostate config holder would still be global, which is why injected config is usually safer.
