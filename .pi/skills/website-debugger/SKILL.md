---
name: website-debugger
description: Investigates website bugs using reproduction steps, screenshots, console logs, network failures, DOM evidence, and targeted fixes. Use for local web app debugging.
---

# Website Debugger

Use this skill when asked to debug a website, page, frontend bug, or browser issue.

## Workflow

1. Reproduce the issue.
2. If Playwright Chromium readiness is in doubt, run `pinchy doctor` before deeper investigation.
3. Use `browser_debug_scan` to gather evidence first.
4. Capture:
   - screenshot
   - console warnings/errors
   - failing network requests
   - DOM evidence or visible symptoms when needed
   - page title and visible symptoms
5. Form a root-cause hypothesis.
6. Add or update a failing test or regression test when practical.
7. Implement the smallest fix.
8. Re-run tests and browser verification.
9. Summarize root cause, fix, and remaining risk.

## Rules

- Do not guess before collecting evidence.
- Prefer `browser_debug_scan` before making code changes.
- Use `browser_dom_snapshot` when saved DOM evidence will help explain or verify the issue.
- Preserve before/after artifacts when they help; use `browser_compare_artifacts` for screenshot or DOM comparisons.
- If the issue cannot be reproduced, say so clearly.
- Prefer small targeted diffs.
