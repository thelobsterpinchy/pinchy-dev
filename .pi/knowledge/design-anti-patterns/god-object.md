---
slug: god-object
name: God Object
aliases: [blob]
recommendedPatterns: [Facade, Service Layer, Hexagonal Architecture]
---

## Summary
One class or module accumulates too many responsibilities, knows too much, and becomes the default place to add more behavior.

## Symptoms
- one large file or class keeps growing
- many unrelated methods and fields live together
- changes to one concern frequently touch the same module

## Why it hurts
- high coupling and low cohesion slow every change
- testing becomes broad and brittle
- ownership boundaries disappear

## Detection hints
- look for large modules importing many unrelated collaborators
- watch for classes changed by many unrelated tickets
- notice files that orchestrate and implement domain logic at once

## Example
A giant controller that validates input, performs business rules, reads storage, formats responses, and sends notifications is a God Object.
