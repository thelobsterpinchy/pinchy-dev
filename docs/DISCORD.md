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
export PINCHY_DISCORD_BOT_USER_ID="4567890123"
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

`PINCHY_DISCORD_BOT_USER_ID` is the bot user's numeric Discord ID. Pinchy uses it to make sure top-level channel messages wake Pinchy only when they mention your bot, not any arbitrary Discord user.

## Usage

Mention the bot in an allowed channel:

```text
@Pinchy inspect the failing dashboard test and fix the smallest issue
```

Pinchy creates a Discord thread, maps that thread to a Pinchy conversation, records your prompt, and queues a `user_prompt` run. Replies in that mapped thread do one of two things:

- If Pinchy is waiting on a pending question, the reply answers that question.
- Otherwise, the reply becomes a new prompt in the same Pinchy conversation.

Pinchy acknowledges successful queue/reply actions in the thread. Reply with:

```text
status
```

to see whether Pinchy is working, waiting for your answer, or ready for the next objective. Reply with:

```text
help
```

to see the available thread commands.

## Demo path

Use this path when validating a customer-facing setup:

1. Run `pinchy init`, then `pinchy doctor`.
2. Configure the Discord environment variables above.
3. Run `pinchy up` and confirm `pinchy status` shows the Discord gateway running.
4. Mention `@Pinchy` in an allowed channel with a small debugging or documentation task.
5. Open the created Discord thread and reply `status`.
6. If Pinchy asks a question, answer it in the Discord thread.
7. Open the dashboard and confirm the same thread shows current state, remote communication, delegated execution, and latest result.

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
