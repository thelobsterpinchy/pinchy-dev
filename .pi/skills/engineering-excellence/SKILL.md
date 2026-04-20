---
name: engineering-excellence
description: Keeps implementation work disciplined around TDD, clean code, maintainable structure, and practical design patterns.
---

# Engineering Excellence

Use this skill before non-trivial coding work, especially when changing behavior or introducing structure.

## Required workflow

1. Restate the requested behavior and constraints.
2. Decide the smallest useful failing test or regression test.
3. Add or update that test first when practical.
4. Run the narrowest useful validation.
5. Implement the minimal change needed to pass.
6. Refactor only while tests stay green.
7. Summarize design choices, tradeoffs, and residual risk.

## Code quality rules

- Prefer small focused functions.
- Keep modules cohesive and avoid mixed responsibilities.
- Use explicit naming over cleverness.
- Prefer composition and adapters/facades/strategies only when they clearly simplify the design.
- Avoid speculative abstractions and incidental complexity.
- Remove dead branches and obvious duplication when already in the area.
- Preserve or improve readability with every change.

## TDD rules

- For bug fixes, prefer a regression test first.
- For new behavior, prefer a behavior-level test before implementation.
- If tests are impractical, explain why before changing implementation.
- Do not widen scope beyond what the tests justify.
