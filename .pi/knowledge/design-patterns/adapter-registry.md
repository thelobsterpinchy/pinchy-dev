---
slug: adapter-registry
name: Adapter Registry
family: Architectural
aliases: [handler registry]
related: [adapter, plugin]
---

## Summary
Register adapters by key so the system can look up the right integration without hard-coded branching.

## Use when
- many adapters are selected by type or provider
- new integrations should register themselves
- central branching is growing

## Avoid when
- there are only a couple of stable adapters
- a simple map literal already solves the need

## Code smells
- switch statements over provider names
- new adapters require edits in many files

## Structure
- store adapters in a keyed registry
- validate keys at registration time
- keep callers dependent on the registry contract

## Example
A model provider registry maps provider ids to adapters without a growing switch statement.
