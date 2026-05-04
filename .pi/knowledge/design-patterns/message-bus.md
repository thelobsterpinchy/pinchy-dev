---
slug: message-bus
name: Message Bus
family: Architectural
aliases: [command bus]
related: [event-bus, command]
---

## Summary
Dispatch commands or messages through one transport-aware boundary so senders do not know concrete handlers.

## Use when
- commands need centralized dispatch and middleware
- transport concerns should stay outside business handlers
- cross-cutting behaviors like logging or retries belong around dispatch

## Avoid when
- simple direct calls are clearer
- one handler is permanently bound and no middleware is needed

## Code smells
- senders know concrete handlers everywhere
- dispatch middleware is duplicated

## Structure
- define message contracts
- route messages through a bus with middleware
- keep handlers focused on one message type

## Example
A message bus can dispatch queue commands and apply logging, retries, and authorization consistently.
