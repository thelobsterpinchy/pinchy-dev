---
slug: memento
name: Memento
family: Behavioral
aliases: [snapshot]
related: [command, state]
---

## Summary
Capture and restore object state without exposing the object’s internal structure to the outside world.

## Use when
- you need undo, rollback, or resumable checkpoints
- state snapshots should remain encapsulated
- history management matters

## Avoid when
- state is tiny and a plain copy is enough
- history is unnecessary

## Code smells
- manual field-by-field rollback code
- external code poking into private state to save checkpoints

## Structure
- let the originator create and restore snapshots
- store snapshots separately in a caretaker
- avoid mutating snapshot contents externally

## Example
A settings draft keeps a snapshot so unsaved edits can be restored after a refresh.
