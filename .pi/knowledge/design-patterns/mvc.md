---
slug: mvc
name: MVC
family: Architectural
aliases: [model view controller]
related: [presenter, mvvm]
---

## Summary
Separate domain state, rendered views, and input handling so UI logic does not collapse into one layer.

## Use when
- a UI has meaningful rendering and input logic
- you need a classic separation between state, presentation, and control
- server or desktop UI boundaries benefit from explicit roles

## Avoid when
- the interface is tiny and one component is enough
- the framework already gives a better-fitting UI pattern

## Code smells
- UI handlers mix rendering and business decisions
- views know too much about persistence or transport

## Structure
- keep models ignorant of rendering concerns
- route user input through controllers
- keep views focused on display

## Example
A legacy dashboard server can be reasoned about as MVC with route handlers as controllers and HTML output as views.
