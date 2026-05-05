---
slug: circuit-breaker
name: Circuit Breaker
family: Architectural
aliases: [breaker]
related: [retry, bulkhead]
---

## Summary
Stop calling an unhealthy dependency temporarily so failures fail fast and the system can recover without cascading load.

## Use when
- a dependency becomes unhealthy under repeated failure
- failing fast is better than repeated timeout cost
- you need recovery probing after cooldown

## Avoid when
- the dependency is highly reliable and local
- simple retries are enough

## Code smells
- the same failing dependency is called repeatedly
- timeouts cascade across many requests

## Structure
- track failures over time
- open the breaker when thresholds trip
- allow limited recovery attempts before closing again

## Example
A circuit breaker around a flaky model provider prevents every queued run from hanging on repeated timeouts.
