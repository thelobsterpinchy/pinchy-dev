---
slug: service-locator
name: Service Locator
aliases: [locator]
recommendedPatterns: [Dependency Injection, Factory Method]
---

## Summary
Code reaches into a global registry or container to pull dependencies instead of receiving them explicitly.

## Symptoms
- methods fetch collaborators from global state
- dependencies are hidden from constructors and function signatures
- tests must mutate shared registries to control behavior

## Why it hurts
- hidden coupling makes code harder to reason about
- test setup becomes fragile
- global state leaks across features

## Detection hints
- look for getService, resolve, or container usage deep inside business logic
- notice constructors with no dependencies but many hidden lookups

## Example
A worker that calls globalContainer.get("queue") and globalContainer.get("logger") internally exhibits Service Locator.
