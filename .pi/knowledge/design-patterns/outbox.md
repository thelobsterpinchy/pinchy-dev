---
slug: outbox
name: Outbox
family: Architectural
aliases: [transactional outbox]
related: [domain-event, event-sourcing]
---

## Summary
Persist outbound messages alongside local state changes, then publish them asynchronously so cross-system delivery stays reliable.

## Use when
- state changes must trigger external messages reliably
- you need to avoid sending messages without committed local state
- event delivery can happen asynchronously

## Avoid when
- everything happens inside one process with no message reliability needs
- a direct call is acceptable and failure-tolerant

## Code smells
- messages sent before local commit succeeds
- manual reconciliation for lost webhooks or notifications

## Structure
- write the outbound event in the same local transaction as state changes
- publish from the outbox later with retries
- mark delivery status explicitly

## Example
Notification deliveries can be staged in an outbox and sent after question state is safely persisted.
