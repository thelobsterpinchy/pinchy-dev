---
slug: copy-paste-programming
name: Copy-Paste Programming
aliases: [copy paste]
recommendedPatterns: [Template Method, Strategy, Service Layer]
---

## Summary
Behavior is duplicated by cloning existing code and editing it slightly instead of extracting shared structure.

## Symptoms
- near-identical blocks recur across files
- bug fixes must be applied in multiple places
- naming drifts but structure remains the same

## Why it hurts
- defects spread across clones
- maintenance cost multiplies
- shared intent becomes hard to see

## Detection hints
- search for similar code blocks with small differences
- inspect repeated sequences of validation, logging, and branching

## Example
Duplicating three worker flows and changing only one line in each is Copy-Paste Programming.
