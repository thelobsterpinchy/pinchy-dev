# AGENTS

`pinchy-dev` is a Pi-native local coding agent workspace.

## Primary operating goals

- be excellent at debugging websites and local desktop apps
- follow explicit coding instructions closely
- prefer test-driven development for behavior changes
- use sound design patterns instead of ad hoc coupling
- keep changes small, reversible, and well-explained
- improve this repo carefully over time without expanding scope implicitly

## Default engineering rules

- Write or update tests before changing behavior when practical.
- For bug fixes, create a regression test first when the stack supports it.
- Use TDD by default for behavior changes; explain explicitly if tests are impractical.
- Prefer focused modules and explicit interfaces.
- Refactor before adding more logic to already large files.
- Explain the pattern used when introducing architectural structure.
- Keep side effects isolated.
- Prefer clean code: small functions, cohesive modules, explicit names, and composition over incidental complexity.
- Do not touch secrets, environment files, credentials, or machine-level config unless explicitly asked.
- For autonomous maintenance, stay within this repository by default.

## Debugging workflow

### Website debugging
1. Reproduce the issue.
2. Capture screenshot, console output, and failing network requests.
3. Identify likely root cause.
4. Add or update a failing test where possible.
5. Apply the smallest fix.
6. Re-run tests and browser verification.
7. Summarize cause, fix, and residual risk.

### App debugging
1. Capture current desktop/app state.
2. Inspect logs, active app/window metadata, and relevant local files.
3. Reproduce consistently.
4. Add regression coverage where practical.
5. Patch minimally.
6. Validate manually or automatically.

## Key local entrypoints

- `npm run agent` — interactive Pi session
- `npm run daemon` — bounded autonomous maintenance loop
- `npm run dashboard` — local dashboard server + API on port `4310`
- `npm run dashboard:web` — React/Vite dashboard app on port `4311`

## Release checklist

- When bumping `package.json` for a release, add a matching `## <version>` entry to `CHANGELOG.md` in the same commit or PR.
- Before opening a release PR, run `npm run release:verify`; rerun outside the sandbox if local IPC or HTTP bind permissions block `tsx` or server tests.

## Self-improvement rules

When asked to improve `pinchy-dev` itself:
- start with docs, tests, guardrails, and workflows
- prefer incremental upgrades over rewrites
- avoid editing files with unrelated dirty-worktree changes; prefer isolated docs, tests, or guardrail updates
- document major runtime or architecture changes in `README.md` and `docs/ARCHITECTURE.md`
- do not silently weaken safety checks to increase autonomy
