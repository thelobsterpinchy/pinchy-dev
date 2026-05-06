---
name: app-debugger
description: Investigates local app problems by capturing desktop state, frontmost app information, logs, configs, and minimal fixes. Use for local desktop app debugging.
---

# App Debugger

Use this skill when debugging a local desktop app or a non-browser app workflow.

## Workflow

1. Capture current desktop or app state with `desktop_screenshot` first.
2. Identify the frontmost app/window with `active_app_info` and inspect visible controls with `desktop_ui_snapshot` before interacting.
3. Save and reference the resulting screenshot/JSON artifacts under `artifacts/` as durable evidence for the investigation.
4. Reproduce the problem consistently and inspect relevant logs/configs.
5. Create a hypothesis from observed evidence.
6. Add regression coverage where practical.
7. Apply the smallest viable fix.
8. Validate manually or automatically.
9. Summarize findings, evidence, and next steps.

## Rules

- Prefer screenshot and active-app inspection before acting.
- Treat `desktop_open_app` as approval-gated; only use it when opening the app is clearly helpful and explicitly approved.
- Avoid destructive UI automation unless explicitly approved.
- Keep investigation scoped to the relevant app and repository.
