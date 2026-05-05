---
slug: overengineering
name: Overengineering
aliases: [accidental complexity]
recommendedPatterns: [Facade, Service Layer, Null Object]
---

## Summary
The design contains more abstraction, configurability, or indirection than the real problem requires.

## Symptoms
- tiny problems have many layers
- simple changes require understanding many abstractions
- the design optimizes hypothetical future cases

## Why it hurts
- delivery slows down
- teams fear touching code
- abstractions stop matching real usage

## Detection hints
- look for unused extension points and one-implementation interfaces everywhere
- notice complexity justified only by possible future scale

## Example
Building a full CQRS plus event-sourcing stack for one local config file is overengineering.
