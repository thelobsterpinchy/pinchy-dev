---
slug: bulkhead
name: Bulkhead
family: Architectural
aliases: [resource isolation]
related: [retry, circuit-breaker]
---

## Summary
Isolate resources so one failing or overloaded part cannot consume all capacity and sink the whole system.

## Use when
- one workload can starve others
- resource pools need hard boundaries
- latency-sensitive paths need isolation

## Avoid when
- the system is small and single-threaded
- the overhead of isolation exceeds the risk

## Code smells
- one queue or dependency outage blocks unrelated work
- all requests share one saturated worker pool

## Structure
- split capacity by workload or dependency class
- enforce independent queues or pools
- monitor saturation at each boundary

## Example
Separate worker capacity for interactive user prompts and background maintenance keeps chat responsive.
