---
slug: facade
name: Facade
family: Structural
aliases: [simplified interface]
related: [adapter, proxy]
---

## Summary
Provide one small entrypoint that hides a complicated subsystem behind a simpler workflow-focused API.

## Use when
- callers repeat the same multi-step subsystem orchestration
- a subsystem has too many concepts leaking upward
- you want one stable boundary for a messy area

## Avoid when
- the subsystem is already simple
- the facade would just mirror every method

## Code smells
- high-level code imports many low-level helpers from one subsystem
- repeated setup and teardown boilerplate

## Structure
- identify the common workflow callers actually need
- wrap the underlying subsystem interactions in a cohesive API
- keep deeper escape hatches available only when necessary

## Example
A browser debugging facade could expose scan, snapshot, and step execution without exposing Playwright internals.
