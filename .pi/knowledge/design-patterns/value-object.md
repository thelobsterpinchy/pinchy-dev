---
slug: value-object
name: Value Object
family: Architectural
aliases: [immutable value]
related: [domain-model, aggregate]
---

## Summary
Model concepts by their values instead of identity so equality, validation, and invariants stay explicit and local.

## Use when
- a concept is defined entirely by its data
- immutability improves safety and clarity
- validation should happen once at creation

## Avoid when
- identity and lifecycle matter more than value equality
- plain primitives are already sufficient and obvious

## Code smells
- primitive obsession
- duplicate validation and formatting logic for the same concept

## Structure
- wrap related primitives in a small immutable type
- enforce invariants in one place
- compare by value rather than instance identity

## Example
A ConversationId value object prevents mixing run ids, task ids, and conversation ids accidentally.
