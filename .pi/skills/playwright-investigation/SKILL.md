---
name: playwright-investigation
description: Investigates browser issues with step-based Playwright-style probing, screenshots, DOM snapshots, and evidence-first debugging. Use for multi-step website bug reproduction.
---

# Playwright Investigation

Use this skill when a browser issue needs more than a single page scan.

## Workflow

1. Reproduce the issue with explicit steps.
2. Use browser tools to capture:
   - screenshot
   - DOM snapshot
   - selector/text checks
   - console or network failures
3. Confirm the problem state before changing code.
4. Add regression coverage when practical.
5. Apply the smallest fix.
6. Re-run the browser checks.

## Rules

- Prefer evidence over speculation.
- Keep reproduction steps explicit and minimal.
- Save artifacts when they help compare before/after state.
