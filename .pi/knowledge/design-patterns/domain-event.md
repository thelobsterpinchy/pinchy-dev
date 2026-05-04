---
slug: domain-event
name: Domain Event
family: Architectural
aliases: [business event]
related: [observer, event-sourcing]
---

## Summary
Capture something meaningful that happened in the domain so other parts of the system can react without tight coupling.

## Use when
- business-significant changes should trigger other behavior
- you want a shared domain language for state changes
- side effects should be decoupled from core state mutations

## Avoid when
- the event would only mirror technical plumbing with no domain meaning
- direct calls are simpler and sufficient

## Code smells
- after-save hooks with vague technical names
- tight coupling between state mutation and every downstream side effect

## Structure
- name events in domain language
- publish them after successful state changes
- keep payloads focused on what happened, not implementation internals

## Example
RunCompleted and QuestionAnswered domain events let notifications and dashboards react independently.
