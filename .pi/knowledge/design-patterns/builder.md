---
slug: builder
name: Builder
family: Creational
aliases: [fluent builder]
related: [abstract-factory, prototype]
---

## Summary
Construct complex objects step by step so creation logic stays readable and partially configurable.

## Use when
- an object has many optional pieces or validation steps
- construction order matters
- you want a readable setup API

## Avoid when
- the object has only a few required fields
- plain object literals are already clearer

## Code smells
- telescoping constructors
- large setup methods with many optional parameters

## Structure
- create a builder that stores incremental state
- validate or finalize in one build step
- keep the built object independent from the builder lifecycle

## Example
A run request builder assembles goal, model overrides, approvals, and metadata before enqueueing.
