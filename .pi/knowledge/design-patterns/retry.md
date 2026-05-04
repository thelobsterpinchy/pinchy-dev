---
slug: retry
name: Retry
family: Architectural
aliases: [retry pattern]
related: [circuit-breaker, bulkhead]
---

## Summary
Re-attempt transient failures in a controlled way so temporary outages do not immediately fail user workflows.

## Use when
- failures are often transient
- idempotent operations can be retried safely
- backoff and limits are acceptable

## Avoid when
- operations are not idempotent
- retries would amplify load or hide systemic failures

## Code smells
- temporary network failures immediately break workflows
- copy-pasted retry loops with inconsistent limits

## Structure
- centralize retry policy
- use bounded attempts with backoff or jitter
- classify which errors are retryable

## Example
A web-search provider can retry rate-limit or transient network errors before surfacing a failure.
