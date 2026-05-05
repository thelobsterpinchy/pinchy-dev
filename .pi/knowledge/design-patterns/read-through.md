---
slug: read-through
name: Read-Through
family: Architectural
aliases: [read through cache]
related: [cache-aside, write-through]
---

## Summary
Hide cache misses behind the cache itself so callers always read through one abstraction.

## Use when
- callers should not manage cache miss logic
- the caching boundary deserves one abstraction
- read latency matters

## Avoid when
- cache behavior must stay highly explicit at call sites
- one-off caching is simpler

## Code smells
- every caller reimplements the same cache miss pattern
- source access and caching are tightly interwoven

## Structure
- make the cache responsible for loading missing values
- keep loader behavior centralized
- surface cache consistency expectations clearly

## Example
A model metadata cache can read through to discovery APIs when the entry is missing.
