---
slug: ambassador
name: Ambassador
family: Architectural
aliases: [service proxy]
related: [sidecar, gateway]
---

## Summary
Use a local proxy on behalf of a service to handle outbound concerns such as routing, auth, timeouts, or retries.

## Use when
- outbound dependency policies should be centralized
- multiple callers need the same network behavior
- service code should stay ignorant of transport policy

## Avoid when
- one direct client is simpler and sufficient
- a proxy hop adds unjustified operational complexity

## Code smells
- every caller configures timeouts and auth differently
- outbound access policy is duplicated across services

## Structure
- place the ambassador near the calling service
- configure outbound policies once
- keep business code talking to a simple local endpoint

## Example
A model-serving ambassador can enforce timeouts and credentials for outbound provider traffic.
