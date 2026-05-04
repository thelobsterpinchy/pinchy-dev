---
slug: throttle
name: Throttle
family: Architectural
aliases: [throttling]
related: [debounce, rate-limiter]
---

## Summary
Allow an action at most once per interval so repeated triggers are sampled instead of fully processed.

## Use when
- you need periodic updates under heavy trigger frequency
- some intermediate events can be skipped safely
- continuous activity should still produce occasional output

## Avoid when
- only the final event matters
- precise per-event handling is required

## Code smells
- scroll or resize handlers run too often
- polling or status updates flood the system

## Structure
- track the last allowed execution time
- drop or defer triggers inside the interval
- decide whether trailing execution should run

## Example
A transcript scroll listener can throttle expensive layout updates during rapid scrolling.
