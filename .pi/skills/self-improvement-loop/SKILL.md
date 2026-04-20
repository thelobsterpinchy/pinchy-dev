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
4. Implement the change with minimal scope.
5. Validate if possible.
6. Record what improved and what remains.

If no safe improvement is justified, stop and explain why.
