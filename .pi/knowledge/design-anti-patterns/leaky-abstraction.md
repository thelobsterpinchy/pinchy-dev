---
slug: leaky-abstraction
name: Leaky Abstraction
aliases: [leak]
recommendedPatterns: [Facade, Adapter, Gateway]
---

## Summary
An abstraction claims to hide details, but callers must still know the hidden system’s quirks to use it correctly.

## Symptoms
- callers branch on implementation details anyway
- abstraction-specific caveats leak into many sites
- the generic API exposes provider terms

## Why it hurts
- false simplicity misleads callers
- switching implementations is still painful
- bugs appear at boundary seams

## Detection hints
- look for comments like except on provider X at call sites
- inspect generic APIs exposing vendor-specific flags

## Example
A supposedly generic search API that requires callers to know Bing-specific challenge behavior is leaky.
