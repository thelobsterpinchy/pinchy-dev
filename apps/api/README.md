# apps/api

Local Pinchy control-plane API for conversations, runs, questions, replies, and deliveries.

Current endpoints:
- `GET /health`
- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:id/messages`
- `POST /conversations/:id/messages`
- `GET /conversations/:id/state`
- `POST /conversations/:id/runs`
- `GET /runs`
- `POST /runs`
- `GET /runs/:id`
- `POST /runs/:id/cancel`
- `GET /questions`
- `POST /questions`
- `GET /questions/:id`
- `POST /questions/:id/reply`
- `POST /webhooks/discord/reply`
- `GET /replies`
- `GET /deliveries`

Notes:
- the API is intended to be the primary backend surface for dashboard/app clients
- when `PINCHY_API_TOKEN` is set, all routes except `GET /health` require `Authorization: Bearer <token>`
- clients can stay on API contracts instead of reading raw state files directly
- conversation-scoped state aggregates are available through `GET /conversations/:id/state`
- Discord inbound replies can be ingested through `POST /webhooks/discord/reply` using a local relay payload with `questionId`, `conversationId`, `content`, and optional Discord metadata such as `messageId`, `authorUsername`, and `channelId`
