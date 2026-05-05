---
slug: factory-method
name: Factory Method
family: Creational
aliases: [virtual constructor]
related: [abstract-factory, prototype]
---

## Summary
Move object creation behind a method so subclasses or strategies can decide which concrete type to instantiate.

## Use when
- creation varies by context but the product interface stays stable
- you need to centralize instantiation decisions
- callers should not know concrete classes

## Avoid when
- constructors are already simple and fixed
- you do not need polymorphic creation

## Code smells
- switch statements creating different concrete classes
- creation logic duplicated across subclasses or services

## Structure
- define the product interface
- delegate creation to a factory method or creator component
- use the product through its abstraction after creation

## Example
A provider resolver uses a factory method to create the right model client for the active backend.
