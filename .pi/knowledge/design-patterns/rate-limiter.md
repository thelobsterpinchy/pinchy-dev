---
slug: rate-limiter
name: Rate Limiter
family: Architectural
aliases: [rate limit]
related: [token-bucket, throttle]
---

## Summary
Limit how quickly operations can proceed so shared resources stay protected and abuse or overload is bounded.

## Use when
- a dependency or workflow has throughput limits
- bursts need capping
- fairness or protection matters

## Avoid when
- load is already tiny and bounded
- hard limits would only add latency with no payoff

## Code smells
- resource exhaustion from request bursts
- manual sleeps and ad hoc counters scattered through code

## Structure
- centralize the rate policy
- identify the scope per user, key, or dependency
- surface limit state clearly

## Example
A web-search tool can apply a rate limiter per provider to avoid repeated 429 responses.
