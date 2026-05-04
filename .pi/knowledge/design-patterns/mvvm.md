---
slug: mvvm
name: MVVM
family: Architectural
aliases: [model view viewmodel]
related: [presenter, mvc]
---

## Summary
Expose UI-ready state and commands through a view model so the view stays declarative and testable.

## Use when
- the UI framework binds well to derived state and commands
- presentation state is richer than the raw domain model
- you want UI logic testable without rendering

## Avoid when
- the UI is too small to justify view models
- the framework does not benefit from this separation

## Code smells
- components compute lots of derived state inline
- event handlers and display logic are tangled

## Structure
- keep view models framework-light when possible
- derive display-ready fields and commands centrally
- let the view stay mostly declarative

## Example
React dashboard selectors and derived panel state can be treated as MVVM-style view models.
