---
slug: registry
name: Registry
family: Architectural
aliases: [service registry]
related: [adapter-registry, plugin]
---

## Summary
Keep a discoverable catalog of implementations, instances, or metadata that other parts of the system can query by key.

## Use when
- lookups by id are common
- dynamic registration matters
- many components need shared discovery

## Avoid when
- a registry would become hidden global state
- constructor injection is clearer for fixed dependencies

## Code smells
- many scattered maps of the same keyed resources
- hard-coded lookups in multiple modules

## Structure
- define clear registration and lookup APIs
- limit scope to one kind of thing
- avoid turning the registry into a dumping ground

## Example
Generated tools are effectively tracked through a registry of names and source files.
