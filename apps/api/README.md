# apps/api

Control plane API for agents, tasks, runs, approvals, and telemetry.

Suggested stack:
- FastAPI + SQLModel/Postgres + Redis
- WebSocket support for live run streaming

Suggested endpoints:
- `POST /agents`
- `POST /runs`
- `GET /runs/:id`
- `POST /approvals/:id/resolve`
- `GET /models`
- `POST /gateway/chat/completions`
