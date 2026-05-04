---
slug: strategy
name: Strategy
family: Behavioral
aliases: [policy pattern]
related: [state, command]
---

## Summary
Swap interchangeable algorithms behind one interface so callers avoid branching on modes or types.

## Use when
- you have multiple interchangeable behaviors
- you want to remove large if else or switch blocks that choose behavior
- the caller should not care which algorithm runs

## Avoid when
- there are only one or two stable cases
- simple branching is clearer than another abstraction

## Code smells
- large mode-based conditional blocks choosing behavior
- duplicated algorithm variants selected by flags or types

## Structure
- define a strategy interface
- implement one class or function object per algorithm
- let the context receive or choose a strategy

## Example
Search provider selection uses separate strategies for Bing RSS and Open Library retrieval.
