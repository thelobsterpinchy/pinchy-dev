---
slug: proxy
name: Proxy
family: Structural
aliases: [surrogate]
related: [decorator, facade]
---

## Summary
Stand in for another object to control access, add lazy loading, or enforce policy while preserving the same interface.

## Use when
- you need authorization, caching, or lazy access around an object
- the caller should see the same interface
- access itself needs policy

## Avoid when
- you only need behavior enhancement without access control semantics
- a direct call is clearer and safe

## Code smells
- repeated permission checks at every call site
- eagerly loading expensive resources that may never be used

## Structure
- implement the same interface as the real subject
- decide when to delegate or block
- keep proxy-specific policy separate from the real subject logic

## Example
An approval-gated desktop action tool behaves like a proxy around the actual click or type operation.
