---
slug: abstract-factory
name: Abstract Factory
family: Creational
aliases: [family factory]
related: [factory-method, builder]
---

## Summary
Create families of related objects behind one factory interface so callers stay decoupled from concrete product classes.

## Use when
- you need compatible product families
- you want to swap whole product suites together
- construction logic currently leaks concrete classes into orchestration code

## Avoid when
- you only create one product type
- simple constructors already keep coupling low

## Code smells
- scattered new calls for related object families
- conditionals selecting UI or provider families

## Structure
- define a factory interface with one method per product kind
- implement one concrete factory per product family
- keep consumers dependent on product interfaces, not concrete implementations

## Example
A dashboard theme factory creates matching button, dialog, and icon implementations for web or desktop skins.
