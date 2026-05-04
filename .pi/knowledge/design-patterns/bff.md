---
slug: bff
name: Backend for Frontend
family: Architectural
aliases: [backend-for-frontend]
related: [gateway, facade]
---

## Summary
Create a backend surface tailored to one frontend so the UI gets exactly the data and actions it needs without generic API contortions.

## Use when
- one frontend has specific composition needs
- generic APIs force wasteful client orchestration
- you want UI-driven endpoints without polluting core services

## Avoid when
- many clients genuinely share the same API shape
- a BFF would duplicate logic pointlessly

## Code smells
- frontend code stitches many endpoints together
- generic APIs expose too much or too little for one UI

## Structure
- shape endpoints around one frontend experience
- keep shared domain logic below the BFF layer
- avoid letting the BFF become the only business layer

## Example
The dashboard API acts like a BFF for the React dashboard experience.
