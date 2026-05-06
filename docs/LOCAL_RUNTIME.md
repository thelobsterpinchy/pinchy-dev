# Local Runtime

## Installable CLI mode

Pinchy can now be installed as a CLI and used outside the source checkout.

Published package install:

```bash
npm install -g pinchy-dev
```

GitHub fallback:

```bash
npm install -g github:pinchy-dev/pinchy-dev
```

Then use it from the target repository:

```bash
cd /path/to/your/repo
pinchy init
pinchy up
pinchy status
pinchy agent
```

`pinchy init` copies the packaged `.pi/` resources into the target repository and creates default `.pinchy-runtime.json`, `.pinchy-goals.json`, and `.pinchy-watch.json` files when missing. Pinchy uses the Submarine runtime by default for both new and existing workspaces unless `submarine.enabled` is explicitly set to `false`.

Recommended first-run flow:

```bash
pinchy init
pinchy setup
pinchy doctor
pinchy up
pinchy agent
```

`pinchy setup` installs Playwright Chromium for browser tooling, checks optional local tools, and offers an interactive setup helper when run in a terminal. The helper can persist non-secret runtime choices, recommends Submarine for new dogfood workspaces, and still keeps the standard Pi runtime as an explicit fallback. It does not write secrets or tokens outside the workspace-local `.pinchy/env`.

`pinchy doctor` checks workspace initialization, core config presence, Playwright browser readiness, local model provider availability, Submarine launchability, and optional local tooling such as `cliclick` and `tesseract`.

Pinchy ships a bundled copy of the Submarine Python package under `vendor/submarine-python` and adds it to `PYTHONPATH` when launching `submarine.serve_stdio`. Users should not need to separately install the Submarine package just to start the default runtime. The remaining runtime prerequisites are Python itself and the configured OpenAI-compatible supervisor/subagent model endpoints.

To roll back a workspace to the standard Pi runtime, set the runtime flag to `false`:

```json
{
  "submarine": {
    "enabled": false
  }
}
```

Initialized workspaces include an `internet_search` Pi tool for narrow public web lookups. It is available to both the main orchestration session and delegated subagent sessions through the shared `.pi/extensions` workspace tools. When `EXA_API_KEY` is set, `internet_search` uses Exa `/search` with `type: "auto"` and highlights content. Without an Exa key, it falls back to lightweight public provider adapters. Each result set is saved as a JSON artifact under `artifacts/`.

Use `pinchy setup`, `.pinchy/env`, or your shell environment to set:

```bash
export EXA_API_KEY="your-exa-api-key"
```

## Interactive mode

```bash
pinchy agent
# or from the source checkout
npm run agent
```

This starts a Pi interactive session using the initialized project `.pi/` resources.

## Daemon mode

```bash
pinchy daemon
# or from the source checkout
PINCHY_DAEMON_INTERVAL_MS=900000 npm run daemon
```

Default interval is 30 minutes. `PINCHY_DAEMON_*` environment overrides apply to both `pinchy daemon` and `npm run daemon`.

Optional multi-goal format:

```bash
export PINCHY_DAEMON_GOALS="Run a website debugging maintenance pass for the local app.||Run a safe self-improvement cycle for this repository."
```

To pause recurring autonomous goal cycles without stopping the daemon entirely, set `PINCHY_DAEMON_AUTO_IMPROVEMENTS=false` or write `{ "enabled": false }` in `.pinchy-goals.json`. Watcher follow-ups, queued tasks, and reload requests can still be processed while goal cycles are paused.

## Runtime defaults

Pinchy can load non-secret runtime defaults from `.pinchy-runtime.json`.

For quick inspection or updates, you can also use the CLI instead of editing the file manually:

```bash
pinchy config view
pinchy config set defaultProvider ollama
pinchy config set defaultModel qwen3-coder
pinchy config set defaultBaseUrl http://127.0.0.1:11434/v1
pinchy config set orchestrationProvider ollama
pinchy config set orchestrationModel qwen3-coder
pinchy config set orchestrationBaseUrl http://127.0.0.1:11434/v1
pinchy config set subagentProvider ollama
pinchy config set subagentModel deepseek-coder
pinchy config set subagentBaseUrl http://127.0.0.1:1234/v1
```

`pinchy config view` is a quick summary of the core connection defaults that Pinchy resolves for the active workspace.
Use `pinchy config set` for simple top-level runtime keys only.

Supported `pinchy config set` keys:
- `defaultProvider`
- `defaultModel`
- `defaultThinkingLevel`
- `defaultBaseUrl`
- `orchestrationProvider`
- `orchestrationModel`
- `orchestrationBaseUrl`
- `subagentProvider`
- `subagentModel`
- `subagentBaseUrl`
- `autoDeleteEnabled` — boolean (`true` / `false`)
- `autoDeleteDays` — positive integer
- `toolRetryWarningThreshold` — positive integer
- `toolRetryHardStopThreshold` — positive integer
- `dangerModeEnabled` — boolean (`true` / `false`)

For nested structures such as `modelOptions` or `savedModelConfigs`, and for a full raw view of every workspace-local field, edit `.pinchy-runtime.json` directly or use the dashboard Settings page.

Example:

```json
{
  "defaultProvider": "openai",
  "defaultModel": "gpt-5.4",
  "defaultThinkingLevel": "medium",
  "defaultBaseUrl": "http://127.0.0.1:11434/v1",
  "orchestrationProvider": "ollama",
  "orchestrationModel": "qwen3-coder",
  "orchestrationBaseUrl": "http://127.0.0.1:11434/v1",
  "subagentProvider": "openai",
  "subagentModel": "deepseek-coder",
  "subagentBaseUrl": "http://127.0.0.1:1234/v1",
  "modelOptions": {
    "temperature": 0.2,
    "topP": 0.95,
    "maxTokens": 4096
  },
  "savedModelConfigs": [
    {
      "id": "local-ollama",
      "name": "Local Ollama",
      "provider": "openai",
      "model": "llama3.1:8b",
      "baseUrl": "http://127.0.0.1:11434/v1"
    }
  ],
  "autoDeleteEnabled": true,
  "autoDeleteDays": 30,
  "toolRetryWarningThreshold": 6,
  "toolRetryHardStopThreshold": 12,
  "dangerModeEnabled": false
}
```

Environment defaults are also supported:
- `PINCHY_DEFAULT_PROVIDER`
- `PINCHY_DEFAULT_MODEL`
- `PINCHY_DEFAULT_THINKING_LEVEL`
- `PINCHY_DEFAULT_BASE_URL`
- `PINCHY_ORCHESTRATION_PROVIDER`
- `PINCHY_ORCHESTRATION_MODEL`
- `PINCHY_ORCHESTRATION_BASE_URL`
- `PINCHY_SUBAGENT_PROVIDER`
- `PINCHY_SUBAGENT_MODEL`
- `PINCHY_SUBAGENT_BASE_URL`

Pinchy resolves runtime defaults for the active workspace in this order:
1. workspace `.pinchy-runtime.json`
2. `PINCHY_DEFAULT_*` environment defaults
3. Pi agent global settings for `defaultProvider`, `defaultModel`, and `defaultThinkingLevel`

`defaultBaseUrl` currently falls back through workspace config and `PINCHY_DEFAULT_BASE_URL`, but not Pi agent global settings.
This keeps the workspace settings screen authoritative for the active repo while still allowing machine-level defaults where supported.

Only the core provider/model/thinking defaults participate in Pi-agent global fallback resolution.
Role-specific LLM routing lets you use one server/provider for the main orchestration thread and another for delegated subagents. If a role-specific provider, model, or base URL is unset, Pinchy falls back to the corresponding `default*` value.
Other `.pinchy-runtime.json` fields such as `modelOptions`, `savedModelConfigs`, `autoDeleteEnabled`, `autoDeleteDays`, `toolRetryWarningThreshold`, `toolRetryHardStopThreshold`, and `dangerModeEnabled` remain workspace-local.

These defaults are intended for portable runtime preferences and local guardrails only.
`dangerModeEnabled` is workspace-local and should only be enabled for sandboxed local debugging where risky actions such as desktop interaction, simulator control, and validation runs are acceptable.
Do not put secrets, auth tokens, or private session state in `.pinchy-runtime.json`.

## API mode

```bash
pinchy api
# or from the source checkout
npm run api
```

Default port:
- `4320` — Pinchy control-plane API

## Worker mode

```bash
pinchy worker
# or from the source checkout
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

Pinchy also supports a first-class Discord bot gateway. `pinchy up` starts the gateway only when `PINCHY_DISCORD_BOT_TOKEN` is present. Configure:

- `PINCHY_DISCORD_BOT_TOKEN`
- `PINCHY_API_TOKEN`
- `PINCHY_DISCORD_BOT_USER_ID`
- `PINCHY_DISCORD_ALLOWED_GUILD_IDS` (optional; unset allows any invited server)
- `PINCHY_DISCORD_ALLOWED_CHANNEL_IDS` (optional; unset allows any channel the bot can access)
- `PINCHY_DISCORD_ALLOWED_USER_IDS` (optional)

When `PINCHY_API_TOKEN` is set, every API route except `GET /health` requires `Authorization: Bearer <token>`. The dashboard proxy and Discord gateway forward this token from the local environment.

The bot flow is thread-based: an allowed mention creates a Discord thread and a mapped Pinchy conversation; messages in that thread answer the latest pending question or become new Pinchy prompt runs.

This route is intentionally local-first and auditable: it normalizes the Discord payload, persists the reply through the shared inbound reply path, and stores the Discord metadata as raw payload on the resulting human reply record.

## Browser tooling readiness

Pinchy's browser-debugging tools use Playwright and require a local Chromium download in addition to the npm package itself.

Provision it with:

```bash
npm run playwright:install
```

The bootstrap flow now installs this automatically. If browser tools later fail with a missing Playwright executable after an upgrade, rerun the same command.

The dashboard settings screen also supports saved model configurations and reusable tuning presets for provider/model/base URL, thinking level, and common local-model sampling options such as temperature, top-p, top-k, min-p, seed, stop sequences, max tokens, repetition penalty, and context window.

## Dashboard mode

Server/API:

```bash
pinchy dashboard
# or from the source checkout
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

## Stack lifecycle helpers

```bash
pinchy version
pinchy setup
pinchy doctor
pinchy config view
pinchy config set <key> <value>
pinchy up
pinchy restart
pinchy down
pinchy status
pinchy api
pinchy worker
pinchy daemon
pinchy logs
pinchy logs api
pinchy logs worker
pinchy logs dashboard
pinchy logs daemon
pinchy smoke
npm run pinchy:install-smoke
```

## Runtime boundary

Workspace-local paths:
- `.pi/`
- `.pinchy-runtime.json`
- `.pinchy-goals.json`
- `.pinchy-watch.json`
- `.pinchy-daemon-health.json`
- `.pinchy/run/`
- `.pinchy/state/`
- `logs/`

User-global paths reserved for install-safe cache/temp data:
- `~/.pinchy/cache`
- `~/.pinchy/tmp`

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
