---
slug: event-bus
name: Event Bus
family: Architectural
aliases: [message bus]
related: [observer, message-bus]
---

## Summary
Route published events through a shared bus so producers and consumers stay decoupled in time and topology.

## Use when
- many components publish and subscribe to events
- direct observer wiring is getting tangled
- cross-cutting listeners should attach without editing producers

## Avoid when
- there are only one or two direct listeners
- an event bus would hide flow that should stay explicit

## Code smells
- producers import many concrete listeners
- event fan-out logic is duplicated across modules

## Structure
- define stable event envelopes
- publish and subscribe through one bus contract
- keep event names and payloads explicit

## Example
A local run event bus lets dashboard updates, audit logs, and notifications subscribe independently.
