# Discord Integration

Pinchy includes an experimental Discord bot gateway for local operator control.

## Setup

Create a Discord application and bot, then enable **Message Content Intent** in the Discord developer portal. Invite the bot to your server with permissions to:

- View channels
- Send messages
- Create public threads
- Send messages in threads
- Read message history

Configure Pinchy with environment variables:

```bash
export PINCHY_DISCORD_BOT_TOKEN="..."
export PINCHY_API_TOKEN="local-secret-token"
export PINCHY_DISCORD_ALLOWED_GUILD_IDS="1234567890"
export PINCHY_DISCORD_ALLOWED_CHANNEL_IDS="2345678901"
# Optional user allowlist:
export PINCHY_DISCORD_ALLOWED_USER_IDS="3456789012"
```

Then start the local stack:

```bash
pinchy up
pinchy status
pinchy logs discord
```

`pinchy up` starts the Discord gateway only when `PINCHY_DISCORD_BOT_TOKEN` is set. When `PINCHY_API_TOKEN` is set, Pinchy's API requires `Authorization: Bearer <token>` for every route except `GET /health`; the dashboard and Discord gateway forward it automatically from the environment.

## Usage

Mention the bot in an allowed channel:

```text
@Pinchy inspect the failing dashboard test and fix the smallest issue
```

Pinchy creates a Discord thread, maps that thread to a Pinchy conversation, records your prompt, and queues a `user_prompt` run. Replies in that mapped thread do one of two things:

- If Pinchy is waiting on a pending question, the reply answers that question.
- Otherwise, the reply becomes a new prompt in the same Pinchy conversation.

Pinchy acknowledges successful queue/reply actions in the thread.

## Troubleshooting

Run:

```bash
pinchy doctor
pinchy logs discord --tail 4000
```

Common issues:

- Missing Message Content Intent: the bot connects but never sees prompt text.
- Missing thread permissions: top-level mentions are received, but thread creation fails.
- Missing `PINCHY_API_TOKEN`: the gateway refuses to start because it cannot safely call the local API.
- Wrong allowlist IDs: messages are ignored and no Pinchy state is created.

Keep Discord bot tokens and API tokens in your shell, launch manager, or machine-level secret manager. Do not store them in `.pinchy-runtime.json`.
