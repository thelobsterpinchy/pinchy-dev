---
slug: feature-envy
name: Feature Envy
aliases: [envy]
recommendedPatterns: [Domain Model, Value Object, Repository]
---

## Summary
A method spends more time using another object’s data than its own object’s state.

## Symptoms
- methods reach deeply into another object
- logic lives far from the data it reasons about
- getters dominate the implementation

## Why it hurts
- behavior drifts away from the natural owner
- encapsulation weakens
- refactoring gets harder because knowledge is misplaced

## Detection hints
- look for train-wreck access chains and repeated getters
- see whether another object supplies most of the method data

## Example
A formatter that pulls many raw fields from Run and manually computes transition validity may belong closer to the Run model.
