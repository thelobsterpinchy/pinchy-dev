---
slug: cache-aside
name: Cache-Aside
family: Architectural
aliases: [lazy cache]
related: [read-through, write-through]
---

## Summary
Read from cache first, load from the source on miss, then populate the cache explicitly.

## Use when
- reads dominate and some staleness is acceptable
- callers can manage cache miss behavior explicitly
- you want incremental caching without changing the source store

## Avoid when
- strict consistency is required
- cache invalidation would exceed the benefit

## Code smells
- repeated expensive reads with identical inputs
- ad hoc caching logic duplicated across callers

## Structure
- check cache before source access
- populate on miss
- invalidate intentionally on writes or expiry

## Example
Artifact metadata lookups can use cache-aside behavior to avoid rereading unchanged files repeatedly.
