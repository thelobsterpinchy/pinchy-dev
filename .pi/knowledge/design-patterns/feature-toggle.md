---
slug: feature-toggle
name: Feature Toggle
family: Architectural
aliases: [feature flag]
related: [strangler-fig, plugin]
---

## Summary
Turn behavior on or off at runtime so you can ship incrementally, test safely, and roll back risky changes quickly.

## Use when
- you need staged rollout or fast rollback
- new behavior should be tested in production gradually
- one codebase must support multiple release states temporarily

## Avoid when
- flags would become permanent clutter
- the change can be released safely without runtime control

## Code smells
- hard-to-revert releases
- branches kept alive for long periods waiting for launch

## Structure
- name flags clearly by behavior
- keep evaluation near the orchestration boundary
- remove stale flags once rollout is complete

## Example
A feature toggle can gate a new design-pattern retrieval scoring algorithm while it is being evaluated.
