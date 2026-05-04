---
slug: domain-model
name: Domain Model
family: Architectural
aliases: [rich domain model]
related: [aggregate, value-object]
---

## Summary
Represent important business concepts with behavior-rich objects instead of scattering rules across procedural services.

## Use when
- business rules are non-trivial
- entities need behavior tied to domain language
- anemic records are causing logic duplication

## Avoid when
- the app is simple CRUD with little domain behavior
- rich objects would just wrap data without adding invariants

## Code smells
- business logic spread across handlers and utilities
- entities are just bags of getters and setters

## Structure
- put invariants and behavior near the data they govern
- use services only for cross-aggregate orchestration
- keep domain terms explicit

## Example
A Run domain model owns legal status transitions instead of exposing raw mutable status strings everywhere.
