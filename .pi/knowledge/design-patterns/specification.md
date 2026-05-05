---
slug: specification
name: Specification
family: Architectural
aliases: [business rule object]
related: [repository, strategy]
---

## Summary
Represent business rules and query criteria as reusable objects so rule logic can be combined, named, and tested independently.

## Use when
- eligibility or filtering rules are reused in multiple places
- business conditions should be composable
- query criteria and domain rules share the same language

## Avoid when
- there is only one tiny rule
- plain predicates are already clearer

## Code smells
- duplicated eligibility checks
- long boolean expressions copied across services or queries

## Structure
- encapsulate one rule per specification
- allow composition with and, or, and not operations where useful
- keep rule names aligned with domain language

## Example
A ready-to-run task specification identifies tasks whose dependencies are complete and status is pending.
