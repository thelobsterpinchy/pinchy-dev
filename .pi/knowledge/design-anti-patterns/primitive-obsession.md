---
slug: primitive-obsession
name: Primitive Obsession
aliases: [primitive obsession]
recommendedPatterns: [Value Object, Domain Model]
---

## Summary
Domain concepts are represented by bare strings, numbers, and booleans instead of meaningful types.

## Symptoms
- many loosely related primitives travel together
- validation and formatting repeat across modules
- invalid combinations are easy to create

## Why it hurts
- business rules leak across the system
- names and constraints stay implicit
- mixing identifiers and units becomes easy

## Detection hints
- look for repeated regex or range validation on the same primitive fields
- watch for long parameter lists of strings and numbers

## Example
Passing raw conversationId, runId, and taskId strings everywhere instead of typed wrappers is Primitive Obsession.
