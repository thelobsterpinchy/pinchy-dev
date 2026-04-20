# pinchy-dev

`pinchy-dev` is a local-first autonomous coding agent workspace built on the **Pi coding agent** framework.

It is designed to run on your own machine, use your local LLMs, debug websites/apps, and follow strict coding discipline such as TDD, design patterns, clean code, explicit structure, and safe refactoring.

## Included capabilities

### Continuous iteration
- scheduled defect-hunting cycles via `.pinchy-iteration.json`
- edge-case focused review prompts
- validation-aware iteration using detected test command
- bounded autonomous bug-finding and fixing loop
- daemon health and run timeline visibility via dashboard state files

### Browser debugging
- `browser_debug_scan`
- `browser_dom_snapshot`
- `browser_run_probe`
- `browser_execute_steps`
- `browser_compare_artifacts`

### Desktop and simulator debugging
- `desktop_click`
- `desktop_type_text`
- `desktop_press_keycode`
- `screen_find_template`
- `screen_click_template`
- `screen_ocr_extract`
- `screen_find_text`
- `screen_click_text`
- `window_bounds`
- `window_click_relative`
- `simulator_tap`
- `simulator_swipe`
- `simulator_type_text`

### Routines and control
- `save_routine`
- `list_routines`
- `queue_routine_run`
- `/routines`
- `/run-routine <name>`
- `/allow-session <scope>`
- `/allow-persistent <scope>`
- local dashboard with artifact gallery, filters, routine actions, and queue-task form

### Run metadata
- current run context stored in `.pinchy-run-context.json`
- artifact metadata can include tags and run labels
- `/current-run` to inspect the latest run context

## Dashboard usability

The dashboard is designed to be used as a real local operator UI:
- large action buttons
- responsive card layout
- artifact filtering by query/tool/tag
- visible task and approval summaries
- routine visibility and queue-run buttons
- queue-task form
- generated tool review with inline git diff and one-click runtime reload requests
- artifact previews that open in a modal or new tab
- live updates through the local dashboard API/SSE stream
- daemon health panel and recent run timeline visibility

There are now two dashboard surfaces:
- `npm run dashboard` — server-rendered local dashboard + API
- `npm run dashboard:web` — richer React/Vite dashboard app

The React dashboard can now issue one-click runtime reload requests. When the Pinchy daemon is running, it consumes the reload request and triggers `/reload-runtime` directly inside the Pi session.

## Runtime services

Current local entrypoints include:
- `npm run agent` — interactive Pi-backed Pinchy shell
- `npm run daemon` — recurring autonomous maintenance/debugging loop
- `npm run api` — Pinchy control-plane API on port `4320`
- `npm run worker` — Pi-backed Pinchy worker loop for queued and resumable runs
- `npm run dashboard` — server-rendered dashboard + local API on port `4310`
- `npm run dashboard:web` — React dashboard app on port `4311`

Pinchy can also load non-secret runtime defaults from `.pinchy-runtime.json`, including:
- `defaultProvider`
- `defaultModel`
- `defaultThinkingLevel`

For the first async notification adapter, Discord webhook delivery is supported through:
- `PINCHY_DISCORD_WEBHOOK_URL`

## Run locally

```bash
cd pinchy-dev
npm install
npm run agent
npm run daemon
npm run api
npm run worker
npm run dashboard
npm run dashboard:web
npm test
```
