# Operations

## Local dashboard

Run:

```bash
npm run dashboard
```

Default URL:
- `http://127.0.0.1:4310`

The dashboard is intended to be genuinely usable for day-to-day operation:
- big action buttons for approvals and tasks
- responsive multi-card layout
- artifact gallery with previews
- artifact filters by query, tool, and tag
- visible summary badges
- routine visibility

## Browser debugging

Useful tools:
- `browser_debug_scan`
- `browser_dom_snapshot`
- `browser_run_probe`
- `browser_execute_steps`
- `browser_compare_artifacts`

Suggested workflow:
1. run `browser_debug_scan` first to collect screenshot, console issues, and failing requests
2. use `browser_dom_snapshot` when you need saved HTML and visible-text evidence
3. use `browser_run_probe` for quick selector/text checks
4. use `browser_execute_steps` for bounded multi-step reproduction flows
5. save before/after screenshots or DOM snapshots when verifying a fix
6. use `browser_compare_artifacts` to compare before/after screenshots or DOM snapshots

Suggested evidence bundle for a reproducible bug:
- one `browser_debug_scan` screenshot
- one `browser_dom_snapshot` artifact when structure or visible text matters
- one `browser_execute_steps` screenshot for multi-step flows
- one `browser_compare_artifacts` result after a fix

This keeps website debugging evidence-first and aligned with the repo’s website investigation skills.

## Local app debugging

Useful tools:
- `desktop_screenshot`
- `active_app_info`
- `desktop_ui_snapshot`
- `desktop_open_app`

Suggested workflow:
1. capture a `desktop_screenshot` first for current app state
2. inspect the frontmost app/window with `active_app_info`
3. use `desktop_ui_snapshot` for lightweight control visibility before interacting
4. only use `desktop_open_app` when clearly helpful and after approval

This keeps local app debugging observation-first and aligned with the repo’s app-debugger workflow.

## OCR and screen targeting

Useful tools:
- `screen_ocr_extract`
- `screen_find_text`
- `screen_click_text`
- `screen_find_template`
- `screen_click_template`

`screen_click_text` now uses OCR bounding boxes and fuzzy matching for small OCR misses.

## Approval flows

Approval-related commands:
- `/approvals`
- `/approve <id>`
- `/deny <id>`
- `/allow-session <scope>`
- `/allow-persistent <scope>`

Use approvals to keep desktop/app actions reviewable instead of silently bypassing operator confirmation.

## Routine execution

Useful tools/commands:
- `save_routine`
- `list_routines`
- `queue_routine_run`
- `/routines`
- `/run-routine <name>`

`/run-routine` performs per-step approval before queueing each routine action.

## Artifact metadata and filtering

Artifacts are indexed in:
- `artifacts/index.json`

You can filter the dashboard gallery by:
- query
- tool name
- tag
