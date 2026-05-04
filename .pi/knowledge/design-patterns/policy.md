---
slug: policy
name: Policy
family: Architectural
aliases: [business policy]
related: [strategy, specification]
---

## Summary
Encapsulate a business decision rule in one named object or module so the rule stays explicit, testable, and reusable.

## Use when
- a domain decision needs a stable name
- rules may vary by environment or product tier
- business logic should read like business language

## Avoid when
- the rule is one trivial line with no reuse
- the policy would just rename a tiny helper

## Code smells
- business decisions hidden in conditionals
- same approval or eligibility logic repeated across workflows

## Structure
- give the rule a clear business-focused name
- keep the decision API small and deterministic
- compose with other policies only when necessary

## Example
An approval policy decides whether a desktop action requires human confirmation.
