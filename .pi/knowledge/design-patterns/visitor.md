---
slug: visitor
name: Visitor
family: Behavioral
aliases: [double dispatch]
related: [iterator, composite]
---

## Summary
Separate operations from object structures when you need to add new operations frequently across a stable node hierarchy.

## Use when
- the object structure is stable but operations keep growing
- you need type-specific behavior without giant instanceof chains
- cross-cutting analysis over a tree matters

## Avoid when
- new node types are added often
- simple polymorphism already works

## Code smells
- many external switches over node types
- new operations touching every node class indirectly

## Structure
- define a visitor interface with one method per node type
- each node accepts a visitor
- keep operations in visitor implementations instead of the nodes

## Example
An AST analysis pass uses visitors to collect metrics, formatting hints, and dependency data.
