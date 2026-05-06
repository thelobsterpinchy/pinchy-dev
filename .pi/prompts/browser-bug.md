Debug the current website issue using an evidence-first workflow.

Requirements:
- Use `/skill:website-debugger` if helpful.
- Reproduce before fixing.
- Use `pinchy doctor` when browser tooling readiness is in doubt or Playwright Chromium may be missing.
- Start with `browser_debug_scan` to capture screenshot, console issues, and failing requests.
- Use `browser_dom_snapshot` for saved HTML and visible-text evidence.
- Use `browser_run_probe` for quick selector or text checks.
- Use `browser_execute_steps` for bounded multi-step reproduction flows.
- Preserve before/after evidence when validating a fix; use `browser_compare_artifacts` when screenshots or DOM snapshots should be compared.
- If a code fix is needed, prefer a regression test first.
- Summarize root cause, fix, and validation.
