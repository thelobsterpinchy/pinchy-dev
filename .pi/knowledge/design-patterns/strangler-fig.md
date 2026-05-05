---
slug: strangler-fig
name: Strangler Fig
family: Architectural
aliases: [incremental replacement]
related: [anti-corruption-layer, hexagonal-architecture]
---

## Summary
Replace legacy behavior gradually by routing one slice at a time to new code instead of rewriting everything at once.

## Use when
- a rewrite is too risky to do in one step
- legacy and new systems must coexist temporarily
- you can route traffic by feature or boundary

## Avoid when
- the old system is small enough for direct replacement
- dual-running would create more confusion than value

## Code smells
- big-bang rewrite plans with high failure risk
- legacy code can only be replaced safely in slices

## Structure
- put a routing boundary in front of old and new implementations
- move one capability at a time to the new path
- track remaining legacy surface explicitly

## Example
A legacy dashboard endpoint can be strangled gradually by routing selected pages to the new React app first.
