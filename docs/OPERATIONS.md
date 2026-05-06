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
- daemon health visibility
- audit tail visibility for recent local runtime events

## Overnight observability

For unattended runs, the most useful local files are:
- `.pinchy-daemon-health.json` — latest daemon heartbeat, status, current activity, last completion time, and last error
- `logs/pinchy-audit.jsonl` — newline-delimited local audit entries for worker run starts, finishes, question deliveries, summaries, and errors

Suggested checks:

```bash
cat .pinchy-daemon-health.json

tail -n 40 logs/pinchy-audit.jsonl
```

What to look for:
- `status: "error"` or a stale `heartbeatAt` in daemon health
- `worker_run_finished` entries with `outcomeKind: "failed"`
- repeated `worker_question_delivery_finished` failures on the same run/question
- summaries and `runId` values you can correlate back to dashboard/API state

## Browser debugging

Useful tools:
- `browser_debug_scan`
- `browser_dom_snapshot`
- `browser_run_probe`
- `browser_execute_steps`
- `browser_compare_artifacts`
- `npm run playwright:install` when Playwright browser binaries are missing

Suggested workflow:
0. run `pinchy doctor` when you want a quick readiness check for Playwright Chromium and related local browser tooling
1. if Playwright reports a missing browser executable, run `npm run playwright:install`
2. run `browser_debug_scan` first to collect screenshot, console issues, and failing requests
3. use `browser_dom_snapshot` when you need saved HTML and visible-text evidence
4. use `browser_run_probe` for quick selector/text checks
5. use `browser_execute_steps` for bounded multi-step reproduction flows
6. save before/after screenshots or DOM snapshots when verifying a fix
7. use `browser_compare_artifacts` to compare before/after screenshots or DOM snapshots

Suggested evidence bundle for a reproducible bug:
- one `browser_debug_scan` screenshot
- one `browser_dom_snapshot` artifact when structure or visible text matters
- one `browser_execute_steps` screenshot for multi-step flows
- one `browser_compare_artifacts` result after a fix

This keeps website debugging evidence-first and aligned with the repo’s website investigation skills.

## Internet search

Useful tools:
- `internet_search`

Suggested workflow:
1. use `internet_search` for narrow external lookups that need current web evidence
2. keep queries specific and do not include secrets, credentials, or private workspace-only data in the query
3. inspect the returned URLs/snippets before relying on them
4. treat provider outages, rate limits, and result relevance as possible failure modes
5. use the saved JSON artifact when you want a durable record of what the search returned; it is also indexed in `artifacts/index.json`

Set `EXA_API_KEY` in `.pinchy/env` or the process environment to use Exa-backed search. The same `internet_search` tool is loaded from `.pi/extensions` for orchestrator and subagent sessions.

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

`active_app_info` and `desktop_ui_snapshot` now also save JSON artifacts under `artifacts/` and index them in `artifacts/index.json`, so app-debugging investigations keep durable observation evidence alongside screenshots.

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

Pinchy now defaults this repo to lower-friction persistent scopes for common local work:
- `desktop.actions`
- `simulator.actions`
- `validation.exec`
- `routine.exec`

You can still disable any scope with `/allow-persistent <scope>` via the dashboard policy toggles or by writing `.pinchy-approval-policy.json`.

For sandboxed local debugging, you can also enable the workspace-local `dangerModeEnabled` flag in `.pinchy-runtime.json` or from the dashboard Settings page. This advertises that risky local actions are acceptable in this workspace, but it does not override host-level approval enforcement outside this repo.

## Routine execution

Useful tools/commands:
- `save_routine`
- `list_routines`
- `queue_routine_run`
- `/routines`
- `/run-routine <name>`

`/run-routine` respects the `routine.exec` approval scope. In this repo that scope now defaults to enabled, but it can still be turned off when you want step-by-step confirmations again.

## Artifact metadata and filtering

Artifacts are indexed in:
- `artifacts/index.json`

You can filter the dashboard gallery by:
- query
- tool name
- tag
