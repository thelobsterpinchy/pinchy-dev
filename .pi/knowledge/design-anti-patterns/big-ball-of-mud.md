---
slug: big-ball-of-mud
name: Big Ball of Mud
aliases: [mud]
recommendedPatterns: [Hexagonal Architecture, Strangler Fig, Service Layer]
---

## Summary
The system lacks clear boundaries, so modules are tangled, inconsistent, and hard to evolve safely.

## Symptoms
- imports cross boundaries arbitrarily
- similar problems are solved differently in different areas
- architecture diagrams no longer reflect reality

## Why it hurts
- small changes have unpredictable impact
- new contributors copy accidental patterns
- cleanup work feels endless

## Detection hints
- look for cycles, mixed responsibilities, and inconsistent naming across layers
- notice when no one can explain the boundary model simply

## Example
A workspace where routes, state files, domain logic, and UI shaping all intermix freely trends toward Big Ball of Mud.
