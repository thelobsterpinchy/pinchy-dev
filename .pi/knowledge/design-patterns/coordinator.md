---
slug: coordinator
name: Coordinator
family: Architectural
aliases: [coordination object]
related: [mediator, orchestrator]
---

## Summary
Coordinate peers around shared state or timing without owning the full business workflow.

## Use when
- several peers need lightweight coordination
- the interaction is narrower than a full orchestrator
- timing or ordering matters between components

## Avoid when
- a direct call graph is already clear
- the coordinator would only forward calls mechanically

## Code smells
- UI or subsystem peers poke each other directly
- timing coordination logic is scattered

## Structure
- keep the coordinator focused on interaction rules
- avoid owning domain state unnecessarily
- let peers remain simple

## Example
A conversation UI coordinator can keep transcript scrolling, unread state, and activity panes in sync.
