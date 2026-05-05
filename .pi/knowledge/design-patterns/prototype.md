---
slug: prototype
name: Prototype
family: Creational
aliases: [clone pattern]
related: [builder, factory-method]
---

## Summary
Create new objects by cloning a configured prototype instead of rebuilding them from scratch.

## Use when
- setup is expensive or highly configurable
- you need many similar objects with small variations
- copying is simpler than reconstructing

## Avoid when
- objects have tricky shared mutable state
- copy semantics would be surprising

## Code smells
- repeated setup code for near-identical objects
- expensive initialization copied across creation sites

## Structure
- prepare a prototype instance or template
- clone it for new objects
- apply only the small differences per instance

## Example
A test fixture generator clones a base run object and tweaks only scenario-specific fields.
