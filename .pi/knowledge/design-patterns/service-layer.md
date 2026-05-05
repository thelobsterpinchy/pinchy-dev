---
slug: service-layer
name: Service Layer
family: Architectural
aliases: [application service]
related: [repository, facade]
---

## Summary
Organize business use cases behind explicit services so controllers, tools, and transports stay thin and orchestration remains centralized.

## Use when
- multiple entrypoints trigger the same use case
- transport or UI code is getting business logic mixed in
- you want clear use-case boundaries

## Avoid when
- the app is tiny and one function is enough
- a service layer would become vague pass-through code

## Code smells
- business rules in HTTP handlers or UI actions
- duplicate orchestration across commands, workers, and routes

## Structure
- define one service per cohesive use-case area
- inject repositories and collaborators into the service
- keep handlers responsible only for mapping input and output

## Example
A conversation service owns run creation, guidance application, and thread updates while the API layer stays thin.
