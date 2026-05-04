---
slug: hexagonal-architecture
name: Hexagonal Architecture
family: Architectural
aliases: [ports and adapters, ports-and-adapters]
related: [adapter, dependency-injection]
---

## Summary
Keep domain logic at the center with explicit ports for inbound and outbound interactions, then plug adapters around that core.

## Use when
- you need strong isolation between domain logic and infrastructure
- multiple transports or providers talk to the same core use cases
- tests should run against the domain without real infrastructure

## Avoid when
- the system is small and infrastructure coupling is not a real pain point
- you would create too many layers with no payoff

## Code smells
- domain logic imports framework or provider code directly
- business rules are hard to test without booting the whole stack

## Structure
- define inbound and outbound ports around the core
- implement adapters at the edges for files, HTTP, browser tools, or providers
- assemble dependencies in a composition root

## Example
A task-processing core depends on queue and notification ports while file storage and dashboard delivery live in adapters.
