---
slug: mediator
name: Mediator
family: Behavioral
aliases: [coordination hub]
related: [observer, facade]
---

## Summary
Centralize collaboration rules between many peers so they stop depending on each other directly.

## Use when
- many components talk to each other in tangled ways
- coordination rules need one clear home
- you want peers to stay simple and decoupled

## Avoid when
- only two components interact
- the mediator would become a giant god object

## Code smells
- mesh-like dependencies between UI components or services
- state changes in one component trigger direct calls across many peers

## Structure
- let peers send intents to a mediator
- keep policy decisions inside the mediator
- limit the mediator to coordination, not domain ownership

## Example
A chat workspace mediator coordinates task panel, transcript, and utility rail state changes.
