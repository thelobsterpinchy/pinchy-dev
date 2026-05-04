---
slug: command
name: Command
family: Behavioral
aliases: [action object]
related: [strategy, chain-of-responsibility]
---

## Summary
Represent an action as an object so you can queue it, log it, retry it, or execute it later.

## Use when
- actions need scheduling, auditing, or undo semantics
- callers should trigger work without knowing implementation details
- you need to persist user intent

## Avoid when
- the action is simple and immediate with no lifecycle needs
- function callbacks are sufficient

## Code smells
- switch statements dispatching string action names
- ad hoc queues storing half-structured payloads

## Structure
- capture all inputs needed to perform the action
- route execution through a handler or executor
- keep orchestration separate from the command payload

## Example
Queued background tasks act like commands that workers execute later.
