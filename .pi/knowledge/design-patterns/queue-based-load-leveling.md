---
slug: queue-based-load-leveling
name: Queue-Based Load Leveling
family: Architectural
aliases: [work queue]
related: [bulkhead, backpressure]
---

## Summary
Use a queue between producers and consumers so bursty traffic is smoothed and work can be processed at a controlled rate.

## Use when
- work arrives in spikes
- background processing is acceptable
- you want producers decoupled from immediate execution capacity

## Avoid when
- work must complete synchronously in-line
- queue delay would violate user expectations

## Code smells
- bursty traffic overwhelms synchronous handlers
- callers block on long-running operations that could be deferred

## Structure
- enqueue work units with enough context to execute later
- run consumers independently from producers
- monitor queue age and size

## Example
Pinchy queues tasks and background runs so interactive actions do not directly execute all work inline.
