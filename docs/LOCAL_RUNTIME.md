# Local Runtime

## Interactive mode

```bash
npm run agent
```

This starts a Pi interactive session using the local project `.pi/` resources.

## Daemon mode

```bash
PINCHY_DAEMON_INTERVAL_MS=900000 npm run daemon
```

Default interval is 30 minutes.

Optional multi-goal format:

```bash
export PINCHY_DAEMON_GOALS="Run a website debugging maintenance pass for the local app.||Run a safe self-improvement cycle for this repository."
```

## Runtime defaults

Pinchy can load non-secret runtime defaults from `.pinchy-runtime.json`.

Example:

```json
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-5.4",
  "defaultThinkingLevel": "medium"
}
```

Environment overrides are also supported:
- `PINCHY_DEFAULT_PROVIDER`
- `PINCHY_DEFAULT_MODEL`
- `PINCHY_DEFAULT_THINKING_LEVEL`

These defaults are intended for portable runtime preferences only.
Do not put secrets, auth tokens, or private session state in `.pinchy-runtime.json`.

## API mode

```bash
npm run api
```

Default port:
- `4320` — Pinchy control-plane API

## Worker mode

```bash
npm run worker
```

This runs the Pi-backed Pinchy worker loop for queued runs and resumable waiting runs.

## Notification defaults

The first async notification adapter currently supported is Discord via webhook:
- `PINCHY_DISCORD_WEBHOOK_URL`

If this variable is not configured, Discord delivery attempts are recorded as failed delivery records instead of silently succeeding.

## Dashboard mode

Server/API:

```bash
npm run dashboard
```

React dashboard app:

```bash
npm run dashboard:web
```

Default ports:
- `4310` — dashboard server + JSON/SSE API
- `4311` — React dashboard app

Run both if you want the richer operator UI with live updates, generated-tool review + git diff, artifact modal viewing, daemon health, run timeline visibility, API-backed task/approval controls, and one-click runtime reload requests.

## Suggested local supervision

- run in `tmux`
- or wrap with `launchd`
- keep autonomous scope constrained to this repository by default
- review session history periodically
