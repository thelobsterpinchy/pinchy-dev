---
slug: golden-hammer
name: Golden Hammer
aliases: [favorite tool syndrome]
recommendedPatterns: [Strategy, Adapter, Facade]
---

## Summary
One familiar pattern or technology is forced onto many problems even when it does not fit.

## Symptoms
- the same abstraction appears everywhere regardless of need
- simple cases get complex frameworks or patterns
- teams defend one solution before examining the problem

## Why it hurts
- complexity rises without proportional benefit
- local optimizations distort the design
- maintenance requires understanding unnecessary indirection

## Detection hints
- look for a repeated pattern introduced even in tiny cases
- notice explanations that start with the tool rather than the problem

## Example
Using an event bus for every local callback, even inside one small module, is a Golden Hammer smell.
