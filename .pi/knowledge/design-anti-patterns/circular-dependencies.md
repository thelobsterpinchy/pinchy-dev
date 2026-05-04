---
slug: circular-dependencies
name: Circular Dependencies
aliases: [dependency cycle]
recommendedPatterns: [Hexagonal Architecture, Service Layer, Mediator]
---

## Summary
Modules depend on each other in loops, making initialization, reuse, and testing harder.

## Symptoms
- A imports B and B imports A indirectly or directly
- startup order becomes fragile
- small refactors trigger cycle errors

## Why it hurts
- boundaries lose direction
- reuse and packaging become harder
- mental models become tangled

## Detection hints
- inspect import graphs and module cycles
- notice components that cannot be understood in isolation

## Example
If dashboard state helpers import API route code and API code imports dashboard helpers, there is a circular dependency.
