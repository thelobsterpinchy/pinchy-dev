---
slug: state
name: State
family: Behavioral
aliases: [state machine object]
related: [strategy, observer]
---

## Summary
Represent state-specific behavior with separate objects so behavior changes cleanly as state changes.

## Use when
- behavior depends heavily on current state
- state transitions are explicit and meaningful
- conditionals are multiplying around lifecycle stages

## Avoid when
- only a couple of simple branches exist
- state transitions are not central to the design

## Code smells
- many if or switch branches on status fields
- lifecycle logic scattered across methods

## Structure
- define a state interface for behavior
- create one object per meaningful state
- let the context delegate behavior to the current state and manage transitions

## Example
A run entity behaves differently in queued, running, waiting, and failed states.
