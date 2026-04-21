# Changelog

## 0.2.3

- add workspace-local `defaultBaseUrl` runtime support for local LLM and OpenAI-compatible endpoints
- expose `defaultBaseUrl` through the Pinchy config CLI, dashboard settings API, and Settings UI
- add local-server model discovery in Settings so a local `/models` endpoint can auto-detect and prefill the model name
- pass configured endpoint overrides through the Pi run executor by overriding resolved model `baseUrl`
- expand the Tools page from generated tools only to Pi-synced skills, extensions, and prompt resources
- preserve unsaved Settings form edits during live dashboard refreshes instead of clobbering in-progress changes

## 0.2.2

- add `pinchy doctor` for workspace/runtime/tooling checks
- add packaged install smoke validation via `npm run pinchy:install-smoke`
- fix published CLI packaging by moving `tsx` into runtime dependencies
- add `pinchy setup` for Playwright Chromium provisioning and optional local tool guidance
- add `pinchy version`
- improve `pinchy init` first-run guidance
- improve `pinchy status`, `pinchy down`, and `pinchy logs` operator UX
- codify workspace-local vs user-global Pinchy path boundaries
- add tag-based npm publish workflow and release documentation
