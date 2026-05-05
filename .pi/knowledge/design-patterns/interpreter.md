---
slug: interpreter
name: Interpreter
family: Behavioral
aliases: [grammar evaluator]
related: [visitor, iterator]
---

## Summary
Represent a simple language or grammar in objects so expressions can be parsed and evaluated consistently.

## Use when
- you have a small DSL or query language
- grammar rules are stable and explicit
- you need to evaluate expressions repeatedly

## Avoid when
- the grammar is large or evolving quickly
- a parser library or plain table-driven approach is clearer

## Code smells
- ad hoc string parsing spread across the codebase
- business rules encoded as brittle regex chains

## Structure
- model grammar rules as expression objects
- evaluate expressions through a shared context
- keep the grammar small and focused

## Example
A filter expression interpreter evaluates simple task query strings against run metadata.
