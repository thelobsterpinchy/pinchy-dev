---
slug: template-method
name: Template Method
family: Behavioral
aliases: [algorithm skeleton]
related: [strategy, factory-method]
---

## Summary
Define the overall algorithm skeleton once and let specific steps vary in subclasses or injected hooks.

## Use when
- multiple workflows share the same high-level sequence
- variation happens at a few well-defined steps
- you want to avoid duplicating orchestration

## Avoid when
- inheritance would complicate a composition-friendly design
- the workflow is too small to justify a template

## Code smells
- duplicated workflow shells with small step differences
- copy-pasted methods that differ in a few lines

## Structure
- fix the outer algorithm in one method
- delegate selected steps to overridable hooks or collaborators
- keep invariant sequencing in one place

## Example
A base validation workflow defines detect, run, and summarize steps while project-specific detectors vary.
