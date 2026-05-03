---
name: self-improvement-loop
description: Runs a bounded self-improvement cycle for this repository, focusing on docs, tests, prompts, skills, extensions, and safe refactors. Use for local agent self-maintenance.
---

# Self Improvement Loop

Use this skill when asked to improve `pinchy-dev` itself.

## Scope

Allowed focus areas:
- documentation
- prompts and system instructions
- skills and extension workflows
- tests and validation
- small safe refactors
- developer ergonomics for local operation

Avoid by default:
- weakening safety restrictions
- broad rewrites
- touching secrets or personal machine config
- changing unrelated repositories

## Workflow

1. Inspect the current repo state.
2. Pick one small, high-leverage improvement.
3. Prefer tests/docs/guardrails before deeper behavior changes.
4. If the worktree already has unrelated in-progress work, avoid editing those files unless the improvement clearly depends on them; prefer isolated docs/tests/guardrail changes that will not clobber local work.
5. Implement the change with minimal scope.
6. Validate if possible.
7. Record what improved and what remains.

If no safe improvement is justified, stop and explain why.
