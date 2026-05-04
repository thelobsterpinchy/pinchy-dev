---
slug: iterator
name: Iterator
family: Behavioral
aliases: [cursor]
related: [composite, visitor]
---

## Summary
Traverse a collection without exposing its internal representation to callers.

## Use when
- clients should walk a structure in multiple ways
- you want traversal logic separated from storage details
- collections may change representation later

## Avoid when
- native language iteration already fully solves the problem
- the collection is trivial and local

## Code smells
- callers reach into collection internals to traverse
- duplicated traversal loops with representation-specific knowledge

## Structure
- provide a traversal interface or generator
- keep collection internals hidden
- allow multiple traversal strategies only if needed

## Example
A run-history API exposes paged iteration over records instead of leaking raw file parsing details.
