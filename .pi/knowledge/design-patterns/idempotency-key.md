---
slug: idempotency-key
name: Idempotency Key
family: Architectural
aliases: [idempotent request]
related: [retry, outbox]
---

## Summary
Attach a stable key to repeatable operations so retries or duplicate submissions do not perform the same side effect twice.

## Use when
- clients may retry requests
- duplicate submissions are possible
- side effects must happen at most once per logical intent

## Avoid when
- operations are naturally read-only
- duplicate side effects are harmless

## Code smells
- retrying causes duplicate records or notifications
- operators fear rerunning a stuck request

## Structure
- generate or accept a stable request key
- store completion results by key
- return the prior outcome for duplicates

## Example
Creating a task from a chat action can use an idempotency key so repeated clicks do not enqueue duplicates.
