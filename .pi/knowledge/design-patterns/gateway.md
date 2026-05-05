---
slug: gateway
name: Gateway
family: Architectural
aliases: [api gateway object]
related: [adapter, facade]
---

## Summary
Wrap an external service or subsystem with a domain-friendly gateway that hides transport details and request construction.

## Use when
- callers should not build raw HTTP or RPC requests
- external service access needs a stable boundary
- you want to mock integrations easily

## Avoid when
- the remote call is one tiny helper and unlikely to grow
- a gateway would only mirror one method

## Code smells
- raw fetch or client code scattered across the app
- transport details leak into business logic

## Structure
- define one gateway per cohesive external service
- hide transport and serialization details inside it
- return domain-friendly results

## Example
A search provider gateway can own query formatting and response parsing for external lookup APIs.
