---
slug: object-pool
name: Object Pool
family: Architectural
aliases: [pool]
related: [flyweight, lease]
---

## Summary
Reuse expensive objects instead of creating them repeatedly when creation cost or scarcity matters.

## Use when
- objects are expensive to create
- resource count must be bounded
- reused instances can be safely reset

## Avoid when
- objects are cheap and stateless
- pooling would risk stale state bugs

## Code smells
- repeated expensive construction under load
- resource exhaustion from too many simultaneous objects

## Structure
- acquire and release objects through the pool
- reset pooled instances before reuse
- bound pool size explicitly

## Example
A browser session pool could reuse expensive Chromium contexts if startup cost became significant.
