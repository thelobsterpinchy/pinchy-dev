---
name: playwright-investigation
description: Investigates browser issues with step-based Playwright-style probing, screenshots, DOM snapshots, and evidence-first debugging. Use for multi-step website bug reproduction.
---

# Playwright Investigation

Use this skill when a browser issue needs more than a single page scan.

## Workflow

1. Reproduce the issue with explicit steps.
2. If Playwright Chromium readiness is in doubt, run `pinchy doctor` before deeper investigation.
3. Start with `browser_debug_scan`, then use browser tools to capture:
   - screenshot
   - DOM snapshot
   - selector/text checks
   - console or network failures
4. Confirm the problem state before changing code.
5. Add regression coverage when practical.
6. Apply the smallest fix.
7. Re-run the browser checks.
8. Preserve before/after artifacts when verifying the fix.

## Rules

- Prefer evidence over speculation.
- Keep reproduction steps explicit and minimal.
- Use `browser_execute_steps` for bounded multi-step reproduction flows.
- Save artifacts when they help compare before/after state; use `browser_compare_artifacts` for screenshot or DOM comparisons.
