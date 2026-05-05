---
slug: write-behind
name: Write-Behind
family: Architectural
aliases: [write back cache]
related: [write-through, outbox]
---

## Summary
Acknowledge writes quickly in the cache and flush them to the backing store asynchronously later.

## Use when
- write latency matters more than immediate persistence
- temporary buffering is acceptable
- you can tolerate controlled eventual consistency

## Avoid when
- data loss risk is unacceptable
- flush complexity outweighs performance benefits

## Code smells
- slow backing writes dominate response time
- callers block on persistence that could be delayed

## Structure
- buffer writes in the cache
- flush asynchronously with retries
- track dirty state and failure handling explicitly

## Example
A metrics accumulator can use write-behind semantics before flushing aggregated counters to disk.
