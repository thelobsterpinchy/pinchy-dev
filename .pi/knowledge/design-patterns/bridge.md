---
slug: bridge
name: Bridge
family: Structural
aliases: [implementation bridge]
related: [adapter, strategy]
---

## Summary
Separate an abstraction from its implementation so both can vary independently without subclass explosion.

## Use when
- you have two orthogonal dimensions of variation
- subclass combinations are multiplying
- you need runtime switching of an implementation detail

## Avoid when
- there is only one real axis of change
- composition would be overkill for a tiny class

## Code smells
- combinatorial subclasses like LocalDarkButton and CloudLightButton
- platform-specific branches spread across core abstractions

## Structure
- keep the high-level abstraction small
- delegate implementation work to a separate interface
- compose the abstraction with an implementation instance

## Example
A notification abstraction delegates transport details to email, Discord, or local inbox senders.
