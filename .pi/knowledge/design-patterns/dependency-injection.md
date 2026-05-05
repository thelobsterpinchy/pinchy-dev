---
slug: dependency-injection
name: Dependency Injection
family: Architectural
aliases: [di, inversion of control]
related: [factory-method, strategy]
---

## Summary
Provide dependencies from the outside so classes depend on abstractions and stay easy to test, swap, and compose.

## Use when
- a class currently creates collaborators internally
- you want isolated tests with stubs or fakes
- runtime environments need different implementations

## Avoid when
- the dependency is a tiny value object or pure helper with no lifecycle
- introducing interfaces would only add ceremony

## Code smells
- new Logger or new Client inside domain logic
- hard-to-test code coupled to concrete services
- hidden singleton dependencies

## Structure
- accept collaborators through constructor, parameters, or a small composition root
- inject interfaces or focused function dependencies where practical
- keep object assembly near the app boundary

## Example
A worker receives clock, queue store, and executor dependencies instead of constructing them internally.
