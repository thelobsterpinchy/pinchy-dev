---
slug: null-object
name: Null Object
family: Behavioral
aliases: [do nothing object]
related: [strategy, proxy]
---

## Summary
Use a benign implementation instead of null checks so callers can rely on one interface and skip defensive branching.

## Use when
- the absence of behavior is a valid case
- callers are cluttered with null checks
- a safe default implementation exists

## Avoid when
- absence is exceptional and should fail loudly
- a silent no-op would hide bugs

## Code smells
- repeated if value exists before calling methods
- special-case branches for missing collaborators

## Structure
- implement the same interface as the real dependency
- make behavior explicit but harmless
- name the null object clearly so it is not mistaken for a real implementation

## Example
A no-op notifier implements the same notification interface for local development when external delivery is disabled.
