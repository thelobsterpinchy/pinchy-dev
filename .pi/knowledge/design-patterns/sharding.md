---
slug: sharding
name: Sharding
family: Architectural
aliases: [partitioning]
related: [bulkhead, queue-based-load-leveling]
---

## Summary
Split data or workload across partitions so growth and contention are spread instead of centralized.

## Use when
- one store or queue is becoming a bottleneck
- work can be partitioned by a stable key
- independent scaling matters

## Avoid when
- the dataset or workload is small
- cross-shard coordination would be harder than the current bottleneck

## Code smells
- hotspots on one giant store or queue
- global contention for unrelated tenants or keys

## Structure
- choose a partition key deliberately
- keep shard routing explicit
- plan for rebalancing and cross-shard queries

## Example
Large multi-tenant task queues could shard by workspace id to reduce contention.
