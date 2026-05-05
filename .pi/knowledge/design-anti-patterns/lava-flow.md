---
slug: lava-flow
name: Lava Flow
aliases: [fossilized code]
recommendedPatterns: [Strangler Fig, Feature Toggle]
---

## Summary
Old unfinished or abandoned code remains embedded in active paths because no one feels safe removing it.

## Symptoms
- commented-out code and half-used abstractions remain
- ancient flags and branches linger indefinitely
- nobody knows whether a stale path is still needed

## Why it hurts
- new design must route around old residue
- fear of removal accumulates
- clarity decays over time

## Detection hints
- look for obsolete TODOs, disabled branches, and do not touch comments
- inspect modules nobody claims to own

## Example
An old generated tool loading path kept alive just in case after a replacement shipped is Lava Flow.
