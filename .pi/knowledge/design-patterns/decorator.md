---
slug: decorator
name: Decorator
family: Structural
aliases: [wrapper enhancement]
related: [proxy, composite]
---

## Summary
Wrap an object to add behavior without changing the wrapped object or creating many subclasses.

## Use when
- you want optional cross-cutting behavior around a stable interface
- features should compose at runtime
- subclassing for combinations is getting messy

## Avoid when
- behavior only applies once and can live in the base implementation
- wrapping layers would hide control flow too much

## Code smells
- logging, metrics, or retries duplicated around many call sites
- subclass explosion for feature combinations

## Structure
- keep the same interface as the wrapped object
- forward calls to the inner object after or before extra behavior
- stack multiple decorators only when the order is clear

## Example
A tool executor decorator records audit logs around the underlying tool call.
