---
name: design-pattern-review
description: Reviews or plans code changes with attention to design patterns, separation of concerns, and maintainability. Use when refactoring or introducing structure.
---

# Design Pattern Review

Use this skill when planning or reviewing structure-heavy changes.

## Workflow

1. Identify the current pain point.
2. Decide whether a known pattern actually simplifies the design.
3. Prefer the lightest pattern that solves the real problem.
4. Explain the chosen pattern briefly.
5. Avoid speculative abstractions.
6. Keep responsibilities explicit and separated.

## Pattern guidance

- Use strategy for swappable behavior.
- Use adapter for external/provider normalization.
- Use facade for simplifying a subsystem boundary.
- Use composition instead of deep inheritance.
- Prefer extracting cohesive modules before growing already-large files.
- Keep orchestration separate from domain logic and side effects.
- Avoid pattern cargo-culting.
