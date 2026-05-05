---
slug: token-bucket
name: Token Bucket
family: Architectural
aliases: [leaky bucket]
related: [rate-limiter, throttle]
---

## Summary
Allow bursts up to a bucket size while enforcing an average refill rate over time.

## Use when
- short bursts are acceptable but average rate must be bounded
- you want a concrete rate-limiting algorithm

## Avoid when
- a simple fixed delay is enough
- the system does not need burst tolerance

## Code smells
- spiky request patterns overwhelm a dependency
- naive counters block too aggressively or too loosely

## Structure
- track tokens and refill over time
- consume tokens per operation
- reject or delay when empty

## Example
A token bucket can allow brief bursts of search requests while keeping provider usage under control.
