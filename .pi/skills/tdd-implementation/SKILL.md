---
name: tdd-implementation
description: Implements code changes with a test-first workflow, small diffs, and explicit validation. Use when asked to build or change behavior with high reliability.
---

# TDD Implementation

Use this skill when implementing new behavior or fixing bugs.

## Workflow

1. Clarify the desired behavior.
2. Identify the narrowest useful automated test.
3. Write or update the failing test first.
4. Run the targeted test if possible.
5. Make the minimal code change required to pass.
6. Re-run tests.
7. Refactor carefully while keeping tests green.
8. Summarize the behavior change and validation.

## Rules

- Do not skip tests unless the user explicitly allows it or the stack makes it impractical.
- Prefer regression tests for bug fixes.
- Keep implementation changes smaller than the tests that justify them.
- Run the narrowest useful validation before widening scope.
- Refactor only after the new or updated tests are green.
- If you must proceed without a test, say why explicitly before changing implementation.
