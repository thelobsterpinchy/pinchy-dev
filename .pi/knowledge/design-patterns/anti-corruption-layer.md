---
slug: anti-corruption-layer
name: Anti-Corruption Layer
family: Architectural
aliases: [acl]
related: [adapter, hexagonal-architecture]
---

## Summary
Protect your domain model from a foreign model by translating data and concepts at a boundary instead of leaking external semantics inward.

## Use when
- an external system has awkward concepts or inconsistent naming
- you are integrating legacy or third-party domains
- you want to keep your internal model clean

## Avoid when
- the external model already fits well
- translation would just copy fields pointlessly

## Code smells
- internal code uses third-party enums and payload shapes everywhere
- legacy naming and concepts leak into new modules

## Structure
- place translation logic at the integration boundary
- map foreign concepts to internal ones explicitly
- keep external models from crossing deep into the core

## Example
A provider response layer translates multiple model APIs into one internal run outcome model.
