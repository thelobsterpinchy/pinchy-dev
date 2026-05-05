---
slug: inappropriate-intimacy
name: Inappropriate Intimacy
aliases: [intimacy]
recommendedPatterns: [Facade, Aggregate, Mediator]
---

## Summary
Two modules know too much about each other’s internals and change together constantly.

## Symptoms
- friends access private-ish state through many getters
- changes in one module break the other frequently
- one object manages another object’s internal lifecycle

## Why it hurts
- encapsulation erodes
- responsibilities blur
- independent evolution becomes difficult

## Detection hints
- look for deep access chains between two recurring modules
- inspect pairs that are almost always changed together

## Example
A UI component that manipulates the storage internals of the run queue shows Inappropriate Intimacy.
