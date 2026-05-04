---
slug: spaghetti-code
name: Spaghetti Code
aliases: [spaghetti]
recommendedPatterns: [Pipeline, Service Layer, Orchestrator]
---

## Summary
Control flow is tangled, ad hoc, and hard to trace because structure has eroded.

## Symptoms
- logic jumps unpredictably between branches and helpers
- naming and sequencing feel inconsistent
- understanding one path requires following many special cases

## Why it hurts
- maintainers lose confidence
- bugs hide in edge cases
- refactoring risk feels high

## Detection hints
- look for long functions with many branches, flags, and exits
- inspect code where no clear primary path emerges

## Example
A giant worker loop with nested conditionals, early exits, and inline retries can drift into spaghetti code.
