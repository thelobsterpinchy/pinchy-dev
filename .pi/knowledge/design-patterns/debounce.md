---
slug: debounce
name: Debounce
family: Architectural
aliases: [debouncing]
related: [throttle, backpressure]
---

## Summary
Wait for activity to settle before firing an action so noisy repeated triggers collapse into one call.

## Use when
- many rapid events should produce one final action
- you care about the last event after a quiet period
- duplicate work from rapid input is wasteful

## Avoid when
- every event matters individually
- added delay would hurt responsiveness

## Code smells
- search or save logic fires on every keystroke unnecessarily
- rapid repeated actions trigger duplicate expensive work

## Structure
- reset a timer on each trigger
- run only after inactivity threshold passes
- be explicit about leading versus trailing behavior

## Example
A settings autosave can debounce input changes so typing does not write on every keypress.
