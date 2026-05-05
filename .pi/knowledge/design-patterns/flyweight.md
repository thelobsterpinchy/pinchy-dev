---
slug: flyweight
name: Flyweight
family: Structural
aliases: [shared intrinsic state]
related: [proxy, composite]
---

## Summary
Share reusable intrinsic state across many similar objects to reduce memory or setup overhead.

## Use when
- you create huge numbers of similar objects
- most state is shared and only a small part varies externally
- memory or repeated setup cost is material

## Avoid when
- object counts are small
- shared state would make code harder to reason about than the savings justify

## Code smells
- thousands of repeated immutable objects
- duplicate caches of the same heavy configuration

## Structure
- separate shared intrinsic state from per-instance extrinsic state
- cache shared flyweights centrally
- pass varying state in from the caller

## Example
A syntax highlighter reuses token style objects instead of recreating identical style metadata per token.
