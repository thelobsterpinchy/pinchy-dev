---
slug: plugin
name: Plugin
family: Architectural
aliases: [extension point]
related: [strategy, hexagonal-architecture]
---

## Summary
Define a stable extension contract so new capabilities can be added without editing the core every time.

## Use when
- third-party or local features should be loaded dynamically
- the core should stay stable while capabilities grow
- teams need clear extension boundaries

## Avoid when
- there will only ever be one implementation
- extension discovery would add more complexity than value

## Code smells
- core files edited for every new integration
- feature-specific conditionals scattered through startup code

## Structure
- define a small extension contract
- load implementations through registration or discovery
- keep the core dependent on the contract, not the plugin details

## Example
Pi extensions are plugins that register tools and commands against the shared runtime API.
