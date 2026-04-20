# Pi Resource Audit

This document records the Phase 5 audit from `docs/PRODUCT_PLAN.md` for reusable Pi resources that could be safely adopted into `pinchy-dev`.

## Goal

Pinchy uses Pi as its execution backend, so it can benefit from useful Pi skills, prompts, and extensions.

However, Pinchy should prefer:
- repo-owned resources
- versioned resources
- reviewed resources
- portable resources

And it should avoid:
- hidden machine-local dependencies
- auth/session state
- personal config that is not reproducible in this repository

## Audit scope

The audit checked likely local Pi locations for non-sensitive reusable resources such as:
- `SKILL.md`
- prompts
- extension source files
- settings files

Sensitive paths like auth/session state were intentionally excluded.

## Audit result

### Machine-level Pi config found
- `~/.pi/agent/settings.json`

Observed non-secret defaults there:
- `defaultProvider`
- `defaultModel`
- `defaultThinkingLevel`

### Reusable skills/prompts/extensions found outside this repo
None were found in the accessible machine-level Pi config during this audit.

In particular, no external machine-level copies of:
- Pi skills
- Pi prompts
- Pi extensions

were found in a safe, reviewable form suitable for direct import.

## Current repo-local Pi resources already present

The repository already includes a strong repo-local `.pi` layer, including:
- skills in `.pi/skills/*`
- prompts in `.pi/prompts/*`
- extensions in `.pi/extensions/*`
- repo-local Pi settings in `.pi/settings.json`
- system guidance in `.pi/SYSTEM.md`

This means Pinchy already has a substantial repo-owned Pi resource surface.

## Decision

At this time, no external Pi skills/prompts/extensions were imported.

That is the safest outcome because:
- no high-value reusable external resources were found in a safe machine-level location
- importing nothing is better than creating an undocumented hidden dependency
- the repository already has a meaningful local `.pi` layer

## Follow-up policy

If useful Pi resources are discovered later outside this repo, Pinchy should only adopt them by:
1. copying them into this repository
2. adapting them to Pinchy terminology and architecture
3. reviewing them like normal code/docs changes
4. keeping them under version control here

## Runtime config implication

The only machine-level Pi artifact found that influenced planning was the presence of non-secret runtime defaults.

Those defaults support the plan for a future Pinchy-owned runtime config layer covering settings such as:
- provider
- model
- thinking profile

But Pinchy should still keep that config:
- explicit
- repo-owned or app-owned
- separate from machine-level auth/session state
