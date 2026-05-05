---
slug: backpressure
name: Backpressure
family: Architectural
aliases: [load shedding]
related: [bulkhead, queue]
---

## Summary
Slow, reject, or buffer upstream producers when consumers are overloaded so the system degrades predictably instead of collapsing.

## Use when
- producers can outpace consumers
- queues grow without bound under load
- you need controlled overload behavior

## Avoid when
- workloads are tiny and naturally bounded
- backpressure would complicate a simple script unnecessarily

## Code smells
- unbounded queues and memory growth
- workers lag further behind without signaling callers

## Structure
- measure queue depth or processing lag
- apply limits, buffering, or explicit rejection
- surface overload state clearly to callers

## Example
A daemon can pause enqueuing new self-improvement runs when the run backlog exceeds a threshold.
