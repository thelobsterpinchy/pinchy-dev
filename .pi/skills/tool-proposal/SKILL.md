---
name: tool-proposal
description: Decides when Pinchy should create a new repo-local tool instead of repeating brittle manual steps. Use when recurring workflows, missing capabilities, or repeated debugging actions suggest a new tool is warranted.
---

# Tool Proposal

Use this skill when a recurring workflow would be safer, clearer, or more reusable as a dedicated Pi tool.

## When to propose a tool

- the same manual multi-step action repeats often
- a task requires brittle prompt-only coordination
- screen/simulator/browser workflows need a reusable helper
- validation or repo maintenance needs a dedicated wrapper
- a new tool would reduce risk compared to ad hoc commands

## Workflow

1. Explain why the current workflow is repetitive or brittle.
2. Define the smallest useful tool boundary.
3. Prefer repo-local generated tool scaffolds over large abstractions.
4. Use `scaffold_tool_extension` to create the tool scaffold if justified.
5. Keep the first implementation minimal and inspectable.
6. Reload only after the tool file is reviewed or intentionally accepted.

## Rules

- Do not create tools speculatively.
- Prefer narrow tool contracts.
- Keep generated tools inside this repository.
- Document why the tool exists.
