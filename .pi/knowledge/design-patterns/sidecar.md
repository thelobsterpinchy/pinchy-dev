---
slug: sidecar
name: Sidecar
family: Architectural
aliases: [companion service]
related: [ambassador, gateway]
---

## Summary
Attach supporting capabilities alongside a primary service so concerns like proxying, metrics, or auth stay out of core code.

## Use when
- cross-cutting infrastructure should be deployed separately from the main app
- a service needs local helper capabilities with shared lifecycle

## Avoid when
- the environment is too simple for extra runtime pieces
- in-process composition already works well

## Code smells
- main service code owns infrastructure glue that could be delegated
- cross-cutting concerns complicate the core deployment

## Structure
- run the helper next to the primary service
- keep the contract between them explicit
- avoid letting the sidecar own core business logic

## Example
A local proxy sidecar could add auth and rate control in front of a model server.
