---
name: website-debugger
description: Investigates website bugs using reproduction steps, screenshots, console logs, network failures, DOM evidence, and targeted fixes. Use for local web app debugging.
---

# Website Debugger

Use this skill when asked to debug a website, page, frontend bug, or browser issue.

## Workflow

1. Reproduce the issue.
2. Use browser debugging tools to gather evidence first.
3. Capture:
   - screenshot
   - console warnings/errors
   - failing network requests
   - page title and visible symptoms
4. Form a root-cause hypothesis.
5. Add or update a failing test when practical.
6. Implement the smallest fix.
7. Re-run tests and browser verification.
8. Summarize root cause, fix, and remaining risk.

## Rules

- Do not guess before collecting evidence.
- Prefer `browser_debug_scan` before making code changes.
- If the issue cannot be reproduced, say so clearly.
- Prefer small targeted diffs.
