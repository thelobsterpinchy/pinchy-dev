---
slug: write-through
name: Write-Through
family: Architectural
aliases: [write through cache]
related: [read-through, write-behind]
---

## Summary
Write to the cache and backing store in one path so the cache stays immediately consistent with writes.

## Use when
- read-after-write consistency with cache matters
- write latency is acceptable
- the cache should mirror committed state immediately

## Avoid when
- write latency must stay minimal
- temporary cache inconsistency is acceptable

## Code smells
- stale cache entries after writes
- manual dual writes scattered across code

## Structure
- route writes through one boundary that updates both cache and store
- handle failures consistently
- make the source of truth explicit

## Example
Runtime config updates can use write-through semantics to keep in-memory state aligned with disk immediately.
