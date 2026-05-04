---
slug: long-parameter-list
name: Long Parameter List
aliases: [parameter bloat]
recommendedPatterns: [Builder, Value Object, Dependency Injection]
---

## Summary
Functions or constructors take too many primitive parameters, obscuring intent and increasing call-site mistakes.

## Symptoms
- many same-typed arguments appear together
- call sites need comments to explain parameter order
- optional flags keep accumulating

## Why it hurts
- readability drops
- wrong argument ordering becomes easy
- shared concepts stay implicit

## Detection hints
- look for functions with many positional arguments
- notice repeated bundles of related inputs

## Example
A function taking workspaceId, conversationId, runId, userId, title, status, retries, timeout, and mode may need restructuring.
