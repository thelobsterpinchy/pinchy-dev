---
slug: observer
name: Observer
family: Behavioral
aliases: [publish subscribe, pub sub]
related: [mediator, state]
---

## Summary
Notify dependent listeners when a subject changes so producers and consumers stay loosely coupled.

## Use when
- multiple consumers react to the same event
- producers should not know subscriber details
- state changes need fan-out notifications

## Avoid when
- there is only one direct consumer
- event ordering and lifecycle would become hard to trace

## Code smells
- manual callback lists spread across modules
- tight coupling between event producers and every consumer

## Structure
- define a subject or event source
- allow observers to subscribe and unsubscribe
- publish stable event payloads instead of leaking internals

## Example
Run state changes notify dashboard listeners, logs, and task updates through event subscribers.
