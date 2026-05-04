---
slug: shotgun-surgery
name: Shotgun Surgery
aliases: [scattered change]
recommendedPatterns: [Facade, Service Layer, Domain Model]
---

## Summary
A small feature change forces edits across many scattered files because related behavior is not localized.

## Symptoms
- one change touches many modules
- coordination logic is duplicated across boundaries
- behavior is split by technical layer instead of cohesive responsibility

## Why it hurts
- safe changes become slow and error-prone
- teams miss one of the required edits
- understanding impact takes too long

## Detection hints
- inspect commits that modify many files for one behavior change
- look for repeated orchestration snippets

## Example
Adding one new run status should not require editing serializers, UI mappings, workers, validators, and analytics in many places.
