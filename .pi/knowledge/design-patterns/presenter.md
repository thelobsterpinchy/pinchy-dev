---
slug: presenter
name: Presenter
family: Architectural
aliases: [presentation model]
related: [mvc, mvvm]
---

## Summary
Move presentation logic into a presenter so views stay passive and formatting decisions are testable.

## Use when
- views should be passive
- formatting and interaction mapping are non-trivial
- UI logic needs unit tests without rendering

## Avoid when
- the view already has minimal logic
- a presenter would duplicate framework features with little value

## Code smells
- formatting logic duplicated across views
- views call domain services directly

## Structure
- keep the presenter dependent on abstractions for the view
- centralize formatting and interaction mapping
- avoid leaking rendering details into domain code

## Example
Conversation transcript presentation helpers effectively act like presenters for message rows.
