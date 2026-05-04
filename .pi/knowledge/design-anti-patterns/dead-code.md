---
slug: dead-code
name: Dead Code
aliases: [unused code]
recommendedPatterns: [Strangler Fig, Feature Toggle]
---

## Summary
Unused branches, modules, or abstractions remain in the codebase after the original need has vanished.

## Symptoms
- paths are never called
- flags and branches remain long after rollout
- helpers exist only for historical reasons

## Why it hurts
- noise hides live behavior
- maintenance and onboarding slow down
- stale branches invite accidental reuse

## Detection hints
- look for unreferenced modules, stale toggles, or always-false branches
- inspect comments describing long-removed scenarios

## Example
An old dashboard branch preserved after the new React flow fully replaced it is Dead Code.
