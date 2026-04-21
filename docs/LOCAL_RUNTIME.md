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

To pause recurring autonomous goal cycles without stopping the daemon entirely, set `PINCHY_DAEMON_AUTO_IMPROVEMENTS=false` or write `{ "enabled": false }` in `.pinchy-goals.json`. Watcher follow-ups, queued tasks, and reload requests can still be processed while goal cycles are paused.

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

For inbound Discord replies, Pinchy now exposes a local webhook-style API route:
- `POST /webhooks/discord/reply`

Expected JSON payload:

```json
{
  "questionId": "question-123",
  "conversationId": "conversation-123",
  "content": "Use JSON files first.",
  "messageId": "discord-message-123",
  "authorUsername": "operator-name",
  "channelId": "discord-channel-123"
}
```

This route is intentionally local-first and auditable: it normalizes the Discord payload, persists the reply through the shared inbound reply path, and stores the Discord metadata as raw payload on the resulting human reply record.

## Browser tooling readiness

Pinchy's browser-debugging tools use Playwright and require a local Chromium download in addition to the npm package itself.

Provision it with:

```bash
npm run playwright:install
```

The bootstrap flow now installs this automatically. If browser tools later fail with a missing Playwright executable after an upgrade, rerun the same command.

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
- inspect `.pinchy-daemon-health.json` and `logs/pinchy-audit.jsonl` after unattended runs

Useful local checks:

```bash
npm run playwright:install
```


```bash
cat .pinchy-daemon-health.json

tail -n 40 logs/pinchy-audit.jsonl
```

The daemon health file summarizes heartbeat and last error state.
The audit log is a local JSONL trail with worker run IDs, execution modes, outcome kinds, duration information, question delivery events, summaries, and failure details.
