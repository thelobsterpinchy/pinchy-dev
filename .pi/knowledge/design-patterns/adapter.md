---
slug: adapter
name: Adapter
family: Structural
aliases: [wrapper]
related: [facade, bridge]
---

## Summary
Translate one interface into another so existing code can use an incompatible dependency without invasive changes.

## Use when
- you must integrate an API with the wrong shape
- you want to isolate third-party quirks behind a stable interface
- you need to preserve existing callers while replacing an implementation

## Avoid when
- you control both sides and can rename directly
- the mismatch is tiny and unlikely to recur

## Code smells
- callers know too much about provider-specific response shapes
- one-off conversion code repeated at every call site

## Structure
- define the interface your code wants
- wrap the foreign dependency in an adapter that implements that interface
- keep translation logic inside the adapter boundary

## Example
A model-provider adapter converts multiple provider response formats into one canonical chat completion shape.
