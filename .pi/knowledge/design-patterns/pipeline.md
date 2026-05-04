---
slug: pipeline
name: Pipeline
family: Architectural
aliases: [processing pipeline]
related: [chain-of-responsibility, template-method]
---

## Summary
Compose ordered processing stages so data flows through small focused transformations.

## Use when
- work naturally happens in sequential stages
- you want reusable processing steps
- each stage should stay simple and isolated

## Avoid when
- the workflow is too tiny for staged composition
- stages need too much shared mutable state

## Code smells
- one giant processing function with many phases
- copy-pasted pre and post processing logic

## Structure
- define clear stage input and output contracts
- run stages in explicit order
- keep each stage focused on one transformation

## Example
A prompt preparation pipeline can normalize input, attach guardrails, and add stack guidance in order.
