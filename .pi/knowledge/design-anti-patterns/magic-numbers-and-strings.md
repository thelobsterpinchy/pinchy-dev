---
slug: magic-numbers-and-strings
name: Magic Numbers and Strings
aliases: [magic values]
recommendedPatterns: [Value Object, Policy]
---

## Summary
Important meanings are encoded as unexplained literals scattered through the code.

## Symptoms
- repeated status strings and numeric thresholds appear inline
- callers must remember special literal meanings
- business rules depend on unexplained constants

## Why it hurts
- intent is hidden
- changes require hunting literals
- typos become bugs

## Detection hints
- search for repeated literals with semantic meaning
- notice thresholds and flags with no named explanation

## Example
Inline high, 3, and 1500 appearing throughout retry or thinking-level logic can be magic values.
