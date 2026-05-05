---
slug: singleton
name: Singleton
family: Creational
aliases: [single instance]
related: [dependency-injection, factory-method]
---

## Summary
Ensure one shared instance exists, but use sparingly because hidden global state often harms testability and clarity.

## Use when
- there is a truly process-wide resource with one lifecycle
- you can clearly justify global uniqueness

## Avoid when
- you only want convenient access
- tests or multiple environments may need different instances

## Code smells
- hidden global state
- hard-to-reset shared resources in tests

## Structure
- centralize instance ownership if you must
- prefer explicit composition roots over ad hoc global access
- document lifecycle and reset rules clearly

## Example
A process-wide cache can be singleton-like, but injecting the cache is usually safer.
