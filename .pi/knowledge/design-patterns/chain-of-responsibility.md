---
slug: chain-of-responsibility
name: Chain of Responsibility
family: Behavioral
aliases: [pipeline handler]
related: [command, strategy]
---

## Summary
Pass a request through ordered handlers so each step can process, enrich, or stop it without a giant conditional block.

## Use when
- multiple checks may apply in sequence
- you need pluggable validation or policy steps
- each handler should stay isolated

## Avoid when
- processing order is trivial and fixed in one small function
- handlers require heavy shared mutable state

## Code smells
- nested if or switch statements for request processing
- hard-coded validation chains inside one method

## Structure
- define a common handler contract
- run handlers in order and stop when appropriate
- keep each handler focused on one responsibility

## Example
Guardrail checks form a chain that blocks dangerous shell commands before execution.
