---
slug: lease
name: Lease
family: Architectural
aliases: [time-limited ownership]
related: [object-pool, bulkhead]
---

## Summary
Grant temporary ownership of a resource with expiry so abandoned work cannot hold it forever.

## Use when
- resources must not be held indefinitely
- owners may crash or disappear
- time-based recovery is acceptable

## Avoid when
- ownership is already short and explicit
- expiry would cause more confusion than safety

## Code smells
- locks or resources linger forever after crashes
- manual cleanup is required for abandoned work

## Structure
- attach expiry metadata to ownership
- renew while healthy
- reclaim resources after expiration

## Example
A worker can claim a run with lease-like semantics so another worker can recover it later if needed.
