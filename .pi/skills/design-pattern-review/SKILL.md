---
name: design-pattern-review
description: Reviews or plans code changes with attention to design patterns, separation of concerns, and maintainability. Use when refactoring or introducing structure.
---

# Design Pattern Review

Use this skill when planning or reviewing structure-heavy changes.

## Default stance

- Prefer simple code unless a pattern clearly helps.
- If code feels unhealthy or structurally suspicious, call `detect_design_anti_patterns` first to name the likely anti-pattern.
- For the strongest anti-pattern match, call `get_design_anti_pattern` and note the recommended replacement patterns.
- Before introducing a structural abstraction, call `search_design_patterns` with the code smell or design problem.
- If one pattern looks promising, call `get_design_pattern` for the exact card before changing structure.
- Retrieve only the most relevant references instead of dragging large theory dumps into context.
- Explain the chosen pattern briefly, why it fits, and which anti-pattern or smell it helps avoid.
- If no pattern clearly helps, say so and keep the design simpler.

## Workflow

1. Identify the current pain point.
2. Describe it in plain language or code-smell form.
3. If the code may contain an anti-pattern, use `detect_design_anti_patterns` to retrieve 1–3 likely matches.
4. Use `get_design_anti_pattern` for the strongest anti-pattern match and inspect its recommended patterns.
5. Use `search_design_patterns` to retrieve 1–3 likely healthy patterns for the problem.
6. Use `get_design_pattern` for the best match before planning the refactor.
7. Prefer the lightest documented pattern that solves the real problem.
8. Explain the chosen pattern briefly.
9. Avoid speculative abstractions.
10. Keep responsibilities explicit and separated.

## Family index

- Creational: Factory Method, Abstract Factory, Builder, Prototype, Singleton
- Structural: Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy
- Behavioral: Strategy, Observer, Command, State, Template Method, Visitor, Chain of Responsibility, Mediator, Memento, Iterator, Interpreter, Null Object
- Common architectural references also available: Dependency Injection, Repository, Unit of Work, Specification, Service Layer, Hexagonal Architecture, Anti-Corruption Layer, CQRS, Event Sourcing, Saga, Value Object, Domain Model, Aggregate, Domain Event, Policy, Plugin, Retry, Circuit Breaker, Bulkhead, Outbox, Strangler Fig, Feature Toggle, Idempotency Key, Backpressure, Queue-Based Load Leveling, Event Bus, Message Bus, Pipeline, Orchestrator, Coordinator, MVC, MVVM, Presenter, Gateway, BFF, Adapter Registry, Registry, Monostate, Object Pool, Lease, Sharding, Sidecar, Ambassador, Rate Limiter, Token Bucket, Debounce, Throttle, Cache-Aside, Read-Through, Write-Through, Write-Behind

## Anti-pattern awareness

Common anti-pattern references include: God Object, Service Locator, Primitive Obsession, Golden Hammer, Shotgun Surgery, Feature Envy, Anemic Domain Model, Big Ball of Mud, Copy-Paste Programming, Tight Coupling, Callback Hell, Leaky Abstraction, Inappropriate Intimacy, Circular Dependencies, Long Parameter List, Temporal Coupling, Dead Code, Overengineering, Magic Numbers and Strings, Singleton Abuse, Spaghetti Code, and Lava Flow.

When an anti-pattern is detected, do not stop at naming it. Follow through to a documented healthier pattern or explicit simplification.

## Pattern guidance

- Use Strategy for swappable behavior.
- Use Adapter for external/provider normalization.
- Use Facade for simplifying a subsystem boundary.
- Use Dependency Injection to keep construction and side-effect wiring near the composition root.
- Use composition instead of deep inheritance.
- Prefer extracting cohesive modules before growing already-large files.
- Keep orchestration separate from domain logic and side effects.
- Avoid pattern cargo-culting.
