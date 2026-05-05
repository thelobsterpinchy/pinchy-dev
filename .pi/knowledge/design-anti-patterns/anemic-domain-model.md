---
slug: anemic-domain-model
name: Anemic Domain Model
aliases: [anemic model]
recommendedPatterns: [Domain Model, Aggregate, Policy]
---

## Summary
Domain objects hold data only, while all real business rules live elsewhere in procedural services.

## Symptoms
- entities are mostly getters and setters
- services own invariants and transitions
- state mutation is wide open

## Why it hurts
- rules are duplicated and easy to bypass
- domain language is weak
- objects do not protect their own consistency

## Detection hints
- look for services mutating entity fields directly
- watch for model classes with no meaningful behavior

## Example
If Run is just a record and every status rule lives in utilities, the model is anemic.
