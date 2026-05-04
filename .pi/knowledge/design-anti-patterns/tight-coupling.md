---
slug: tight-coupling
name: Tight Coupling
aliases: [rigid coupling]
recommendedPatterns: [Dependency Injection, Adapter, Hexagonal Architecture]
---

## Summary
Modules depend directly on concrete details so changes ripple outward and testing becomes hard.

## Symptoms
- business code imports infrastructure classes directly
- small changes require many coordinated updates
- mocks are hard because interfaces are absent

## Why it hurts
- swapping implementations is expensive
- testability suffers
- boundaries become brittle

## Detection hints
- look for concrete provider imports in domain code
- notice constructors creating deep collaborator graphs internally

## Example
A domain service that directly new()s file stores, HTTP clients, and UI notifiers is tightly coupled.
