---
slug: composite
name: Composite
family: Structural
aliases: [tree object]
related: [decorator, iterator]
---

## Summary
Treat leaf objects and object groups uniformly when working with tree-like structures.

## Use when
- clients should handle single items and nested groups the same way
- you need recursive aggregation over a hierarchy
- tree operations are spreading conditional node-type checks

## Avoid when
- the structure is flat
- leaf and group behaviors are substantially different

## Code smells
- recursive code full of node-type switches
- special cases for one item versus many items

## Structure
- define a shared component contract
- implement leaf and composite nodes with the same surface
- let composites delegate to children recursively

## Example
A UI layout tree renders panels and individual controls through one component interface.
