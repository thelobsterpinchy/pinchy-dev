---
name: design-pattern-review
description: Reviews or plans code changes with attention to design patterns, separation of concerns, and maintainability. Use when refactoring or introducing structure. Contains full embedded knowledge cards for all patterns and anti-patterns.
---

# Design Pattern Review

Use this skill when planning or reviewing structure-heavy changes.

## Default stance

- Prefer simple code unless a pattern clearly helps.
- If code feels unhealthy or structurally suspicious, identify the likely anti-pattern first by name below.
- Before introducing a structural abstraction, pick a fitting documented pattern that matches the design problem or code smell.
- Explain the chosen pattern briefly, why it fits, and which anti-pattern or smell it helps avoid.
- If no pattern clearly helps, say so and keep the design simpler.

## Workflow

1. Identify the current pain point.
2. Describe it in plain language or code-smell form.
3. If the code may contain an anti-pattern, name 1–3 likely matches from the Anti-Pattern Catalog below.
4. For the strongest anti-pattern match, look at its recommended replacement patterns from the catalog.
5. Pick 1–3 likely healthy patterns from the Pattern Catalog for the problem.
6. Load the best matching pattern card for exact guidance before planning the refactor.
7. Prefer the lightest documented pattern that solves the real problem.
8. Explain the chosen pattern briefly and how it addresses the problem.
9. Avoid speculative abstractions.
10. Keep responsibilities explicit and separated.

## Pattern Guidance

- Use Strategy for swappable behavior.
- Use Adapter for external/provider normalization.
- Use Facade for simplifying a subsystem boundary.
- Use Dependency Injection to keep construction and side-effect wiring near the composition root.
- Use composition instead of deep inheritance.
- Prefer extracting cohesive modules before growing already-large files.
- Keep orchestration separate from domain logic and side effects.
- Avoid pattern cargo-culting.

---

# Pattern Catalog

Below are all reference cards embedded for lookup by name or alias.

---

## Creational Patterns

### Abstract Factory

**Family:** Creational
**Aliases:** abstract factory
**Related:** factory-method, prototype

**Summary**
Provide one interface for creating families of related objects without tying callers to concrete classes.

**Use when**
- you need families or groups of related products created together
- variants must stay compatible with each other
- callers should not know concrete product classes

**Avoid when**
- there is only one product type or no family structure
- factory-method or direct constructors are already clear

**Code smells**
- callers manually coordinate multiple new() calls across related classes
- variant compatibility bugs caused by mismatched construction

**Structure**
- define a factory interface per product family
- implement one factory per variant
- let callers create products through the factory abstraction

**Example**
A UI toolkit factory creates matching button, checkbox, and menu components for light and dark themes.

---

### Factory Method

**Family:** Creational
**Aliases:** virtual constructor
**Related:** abstract-factory, prototype

**Summary**
Move object creation behind a method so subclasses or strategies can decide which concrete type to instantiate.

**Use when**
- creation varies by context but the product interface stays stable
- you need to centralize instantiation decisions
- callers should not know concrete classes

**Avoid when**
- constructors are already simple and fixed
- you do not need polymorphic creation

**Code smells**
- switch statements creating different concrete classes
- creation logic duplicated across subclasses or services

**Structure**
- define the product interface
- delegate creation to a factory method or creator component
- use the product through its abstraction after creation

**Example**
A provider resolver uses a factory method to create the right model client for the active backend.

---

### Builder

**Family:** Creational
**Aliases:** [none listed]
**Related:** factory-method, abstract-factory

**Summary**
Construct complex objects step by step so the same construction process can create different representations and callers hide internal details.

**Use when**
- object setup requires many optional or ordered steps
- you want readers to see construction intent clearly
- immutable results are preferred

**Avoid when**
- constructors are already simple and readable
- a factory method covers creation cleanly

**Code smells**
- telescoping constructors with many parameters
- repeated partial-setup sequences at call sites

**Structure**
- define step methods or a fluent builder API
- accumulate state internally
- return an immutable result on build

**Example**
A search query builder lets callers chain filters, sorting rules, and pagination options before producing a final query object.

---

### Prototype

**Family:** Creational
**Aliases:** clone pattern
**Related:** builder, factory-method

**Summary**
Create new objects by cloning a configured prototype instead of rebuilding them from scratch.

**Use when**
- setup is expensive or highly configurable
- you need many similar objects with small variations
- copying is simpler than reconstructing

**Avoid when**
- objects have tricky shared mutable state
- copy semantics would be surprising

**Code smells**
- repeated setup code for near-identical objects
- expensive initialization copied across creation sites

**Structure**
- prepare a prototype instance or template
- clone it for new objects
- apply only the small differences per instance

**Example**
A test fixture generator clones a base run object and tweaks only scenario-specific fields.

---

### Singleton

**Family:** Creational
**Aliases:** single instance
**Related:** dependency-injection, factory-method

**Summary**
Ensure one shared instance exists, but use sparingly because hidden global state often harms testability and clarity.

**Use when**
- there is a truly process-wide resource with one lifecycle
- you can clearly justify global uniqueness

**Avoid when**
- you only want convenient access
- tests or multiple environments may need different instances

**Code smells**
- hidden global state
- hard-to-reset shared resources in tests

**Structure**
- centralize instance ownership if you must
- prefer explicit composition roots over ad hoc global access
- document lifecycle and reset rules clearly

**Example**
A process-wide cache can be singleton-like, but injecting the cache is usually safer.

---

## Structural Patterns

### Adapter

**Family:** Structural
**Aliases:** [none listed]
**Related:** facade, wrapper

**Summary**
Translate one interface into another so incompatible components can work together without changing their existing code.

**Use when**
- an external or legacy component has the wrong interface for your needs
- you want to isolate callers from provider or transport specifics
- swapping implementations should stay local

**Avoid when**
- the component already matches what callers expect
- a thin wrapper that just forwards calls would not add clarity

**Code smells**
- callers branch on provider names or version quirks
- transport details leak into business logic

**Structure**
- define a domain-friendly target interface
- implement an adapter that translates between the old interface and the new one
- hide provider-specific headers, error codes, or format differences inside the adapter

**Example**
A search provider adapter wraps Bing RSS responses in a unified result shape so callers never see raw XML.

---

### Bridge

**Family:** Structural
**Aliases:** [none listed]
**Related:** strategy, decorator

**Summary**
Separate an abstraction from its implementations so both can vary independently instead of growing into one massive class hierarchy.

**Use when**
- a class would otherwise multiply across multiple dimensions of variation
- you need implementations swappable without touching the abstraction
- cross-product combinations would explode class counts

**Avoid when**
- there is only one dimension of variation and a simple strategy suffices
- the added indirection complicates reading flow

**Code smells**
- exponential subclass trees for orthogonal feature combinations
- implementation details leaking into abstraction methods

**Structure**
- define an abstraction interface and keep it separate from implementation details
- delegate work to an implementor object received at construction time
- vary abstraction and implementor independently along their own axes

**Example**
A multi-platform renderer defines rendering logic in the abstraction while platform-specific drawing calls live in separate backends.

---

### Composite

**Family:** Structural
**Aliases:** [none listed]
**Related:** decorator, visitor

**Summary**
Compose objects into tree structures so callers treat individual items and groups uniformly through one interface.

**Use when**
- you have a hierarchy of objects that should be manipulated the same way
- operations need to recurse through nested structures naturally
- grouping and individual handling should share an API

**Avoid when**
- the structure is flat or shallow enough that direct calls are simpler
- groups and individuals require fundamentally different APIs anyway

**Code smells**
- repeated tree-walking logic with special-case grouping branches
- callers maintaining separate lists for individual and grouped items

**Structure**
- define a component interface shared by leaves and composite nodes
- let composites hold children and forward operations recursively
- keep leaf implementations minimal and focused

**Example**
A task panel renders individual tasks and nested subtask groups through one list renderer without branching on type.

---

### Decorator

**Family:** Structural
**Aliases:** [none listed]
**Related:** proxy, facade

**Summary**
Wrap objects to add behavior dynamically so responsibilities stay separated and wrappers can stack in clear order.

**Use when**
- you need to attach extra behavior like logging, caching, or retries around existing calls
- decorators should compose cleanly without subclass explosion
- callers expect the same interface before and after decoration

**Avoid when**
- wrapping layers would hide control flow too much
- behavior is fixed and better expressed in the core class

**Code smells**
- logging, metrics, or retries duplicated around many call sites
- subclass explosion for feature combinations

**Structure**
- keep the same interface as the wrapped object
- forward calls to the inner object after or before extra behavior
- stack multiple decorators only when the order is clear

**Example**
A tool executor decorator records audit logs around the underlying tool call.

---

### Facade

**Family:** Structural
**Aliases:** simplified interface
**Related:** adapter, proxy

**Summary**
Provide one small entrypoint that hides a complicated subsystem behind a simpler workflow-focused API.

**Use when**
- callers repeat the same multi-step subsystem orchestration
- a subsystem has too many concepts leaking upward
- you want one stable boundary for a messy area

**Avoid when**
- the subsystem is already simple
- the facade would just mirror every method

**Code smells**
- high-level code imports many low-level helpers from one subsystem
- repeated setup and teardown boilerplate

**Structure**
- identify the common workflow callers actually need
- wrap the underlying subsystem interactions in a cohesive API
- keep deeper escape hatches available only when necessary

**Example**
A browser debugging facade could expose scan, snapshot, and step execution without exposing Playwright internals.

---

### Flyweight

**Family:** Structural
**Aliases:** shared intrinsic state
**Related:** proxy, composite

**Summary**
Share reusable intrinsic state across many similar objects to reduce memory or setup overhead.

**Use when**
- you create huge numbers of similar objects
- most state is shared and only a small part varies externally
- memory or repeated setup cost is material

**Avoid when**
- object counts are small
- shared state would make code harder to reason about than the savings justify

**Code smells**
- thousands of repeated immutable objects
- duplicate caches of the same heavy configuration

**Structure**
- separate shared intrinsic state from per-instance extrinsic state
- cache shared flyweights centrally
- pass varying state in from the caller

**Example**
A syntax highlighter reuses token style objects instead of recreating identical style metadata per token.

---

### Proxy

**Family:** Structural
**Aliases:** surrogate
**Related:** decorator, facade

**Summary**
Stand in for another object to control access, add lazy loading, or enforce policy while preserving the same interface.

**Use when**
- you need authorization, caching, or lazy access around an object
- the caller should see the same interface
- access itself needs policy

**Avoid when**
- you only need behavior enhancement without access control semantics
- a direct call is clearer and safe

**Code smells**
- repeated permission checks at every call site
- eagerly loading expensive resources that may never be used

**Structure**
- implement the same interface as the real subject
- decide when to delegate or block
- keep proxy-specific policy separate from the real subject logic

**Example**
An approval-gated desktop action tool behaves like a proxy around the actual click or type operation.

---

## Behavioral Patterns

### Strategy

**Family:** Behavioral
**Aliases:** policy pattern
**Related:** state, command

**Summary**
Swap interchangeable algorithms behind one interface so callers avoid branching on modes or types.

**Use when**
- you have multiple interchangeable behaviors
- you want to remove large if else or switch blocks that choose behavior
- the caller should not care which algorithm runs

**Avoid when**
- there are only one or two stable cases
- simple branching is clearer than another abstraction

**Code smells**
- large mode-based conditional blocks choosing behavior
- duplicated algorithm variants selected by flags or types

**Structure**
- define a strategy interface
- implement one class or function object per algorithm
- let the context receive or choose a strategy

**Example**
Search provider selection uses separate strategies for Bing RSS and Open Library retrieval.

---

### Observer

**Family:** Behavioral
**Aliases:** publish subscribe, pub sub
**Related:** mediator, state

**Summary**
Notify dependent listeners when a subject changes so producers and consumers stay loosely coupled.

**Use when**
- multiple consumers react to the same event
- producers should not know subscriber details
- state changes need fan-out notifications

**Avoid when**
- there is only one direct consumer
- event ordering and lifecycle would become hard to trace

**Code smells**
- manual callback lists spread across modules
- tight coupling between event producers and every consumer

**Structure**
- define a subject or event source
- allow observers to subscribe and unsubscribe
- publish stable event payloads instead of leaking internals

**Example**
Run state changes notify dashboard listeners, logs, and task updates through event subscribers.

---

### Command

**Family:** Behavioral
**Aliases:** [none listed]
**Related:** strategy, template-method

**Summary**
Wrap an action or request as a named object so you can parameterize callers, queue operations, or support undo logic.

**Use when**
- requests need to be queued, logged, or reversed
- you want sender and receiver to stay decoupled
- actions should carry their own metadata like timestamps or user context

**Avoid when**
- calls are immediate and simple with no queuing or reversal needs
- a direct method call is already clear

**Code smells**
- scattered callback closures that repeat setup and error handling
- callbacks carrying too much contextual baggage

**Structure**
- define an invoke interface for the command
- store parameters, context, and metadata inside the command object
- keep receivers focused on executing the action without knowing who sent it

**Example**
A desktop action command captures click coordinates, timestamp, and user so the executor can replay or audit it later.

---

### State

**Family:** Behavioral
**Aliases:** state machine object
**Related:** strategy, observer

**Summary**
Represent state-specific behavior with separate objects so behavior changes cleanly as state changes.

**Use when**
- behavior depends heavily on current state
- state transitions are explicit and meaningful
- conditionals are multiplying around lifecycle stages

**Avoid when**
- only a couple of simple branches exist
- state transitions are not central to the design

**Code smells**
- many if or switch branches on status fields
- lifecycle logic scattered across methods

**Structure**
- define a state interface for behavior
- create one object per meaningful state
- let the context delegate behavior to the current state and manage transitions

**Example**
A run entity behaves differently in queued, running, waiting, and failed states.

---

### Template Method

**Family:** Behavioral
**Aliases:** algorithm skeleton
**Related:** strategy, factory-method

**Summary**
Define the overall algorithm skeleton once and let specific steps vary in subclasses or injected hooks.

**Use when**
- multiple workflows share the same high-level sequence
- variation happens at a few well-defined steps
- you want to avoid duplicating orchestration

**Avoid when**
- inheritance would complicate a composition-friendly design
- the workflow is too small to justify a template

**Code smells**
- duplicated workflow shells with small step differences
- copy-pasted methods that differ in a few lines

**Structure**
- fix the outer algorithm in one method
- delegate selected steps to overridable hooks or collaborators
- keep invariant sequencing in one place

**Example**
A base validation workflow defines detect, run, and summarize steps while project-specific detectors vary.

---

### Visitor

**Family:** Behavioral
**Aliases:** double dispatch
**Related:** iterator, composite

**Summary**
Separate operations from object structures when you need to add new operations frequently across a stable node hierarchy.

**Use when**
- the object structure is stable but operations keep growing
- you need type-specific behavior without giant instanceof chains
- cross-cutting analysis over a tree matters

**Avoid when**
- new node types are added often
- simple polymorphism already works

**Code smells**
- many external switches over node types
- new operations touching every node class indirectly

**Structure**
- define a visitor interface with one method per node type
- each node accepts a visitor
- keep operations in visitor implementations instead of the nodes

**Example**
An AST analysis pass uses visitors to collect metrics, formatting hints, and dependency data.

---

### Chain of Responsibility

**Family:** Behavioral
**Aliases:** [none listed]
**Related:** strategy, command

**Summary**
Pass requests through a chain of handlers so multiple objects get a chance to process or transform the request without hard-coded coupling.

**Use when**
- more than one object may handle a request and the actual handler is not known upfront
- you want to add or reorder handlers without changing existing ones
- requests might need sequential transformation steps

**Avoid when**
- there is clearly one right handler for every request
- chains would become long enough to hurt readability or performance

**Code smells**
- giant dispatch functions routing based on request type or flags
- hard-to-follow branching that decides which logic runs

**Structure**
- define a handler interface and a next-handler link
- each handler decides whether to process the request or pass it forward
- keep chains short and purpose-focused

**Example**
A task pipeline applies validation, enrichment, and sanitization handlers in sequence before dispatching work.

---

### Mediator

**Family:** Behavioral
**Aliases:** coordination hub
**Related:** observer, facade

**Summary**
Centralize collaboration rules between many peers so they stop depending on each other directly.

**Use when**
- many components talk to each other in tangled ways
- coordination rules need one clear home
- you want peers to stay simple and decoupled

**Avoid when**
- only two components interact
- the mediator would become a giant god object

**Code smells**
- mesh-like dependencies between UI components or services
- state changes in one component trigger direct calls across many peers

**Structure**
- let peers send intents to a mediator
- keep policy decisions inside the mediator
- limit the mediator to coordination, not domain ownership

**Example**
A chat workspace mediator coordinates task panel, transcript, and utility rail state changes.

---

### Memento

**Family:** Behavioral
**Aliases:** snapshot
**Related:** command, state

**Summary**
Capture and restore object state without exposing the object's internal structure to the outside world.

**Use when**
- you need undo, rollback, or resumable checkpoints
- state snapshots should remain encapsulated
- history management matters

**Avoid when**
- state is tiny and a plain copy is enough
- history is unnecessary

**Code smells**
- manual field-by-field rollback code
- external code poking into private state to save checkpoints

**Structure**
- let the originator create and restore snapshots
- store snapshots separately in a caretaker
- avoid mutating snapshot contents externally

**Example**
A settings draft keeps a snapshot so unsaved edits can be restored after a refresh.

---

### Iterator

**Family:** Behavioral
**Aliases:** cursor
**Related:** composite, visitor

**Summary**
Traverse a collection without exposing its internal representation to callers.

**Use when**
- clients should walk a structure in multiple ways
- you want traversal logic separated from storage details
- collections may change representation later

**Avoid when**
- native language iteration already fully solves the problem
- the collection is trivial and local

**Code smells**
- callers reach into collection internals to traverse
- duplicated traversal loops with representation-specific knowledge

**Structure**
- provide a traversal interface or generator
- keep collection internals hidden
- allow multiple traversal strategies only if needed

**Example**
A run-history API exposes paged iteration over records instead of leaking raw file parsing details.

---

### Interpreter

**Family:** Behavioral
**Aliases:** grammar evaluator
**Related:** visitor, iterator

**Summary**
Represent a simple language or grammar in objects so expressions can be parsed and evaluated consistently.

**Use when**
- you have a small DSL or query language
- grammar rules are stable and explicit
- you need to evaluate expressions repeatedly

**Avoid when**
- the grammar is large or evolving quickly
- a parser library or plain table-driven approach is clearer

**Code smells**
- ad hoc string parsing spread across the codebase
- business rules encoded as brittle regex chains

**Structure**
- model grammar rules as expression objects
- evaluate expressions through a shared context
- keep the grammar small and focused

**Example**
A filter expression interpreter evaluates simple task query strings against run metadata.

---

### Null Object

**Family:** Behavioral
**Aliases:** do nothing object
**Related:** strategy, proxy

**Summary**
Use a benign implementation instead of null checks so callers can rely on one interface and skip defensive branching.

**Use when**
- the absence of behavior is a valid case
- callers are cluttered with null checks
- a safe default implementation exists

**Avoid when**
- absence is exceptional and should fail loudly
- a silent no-op would hide bugs

**Code smells**
- repeated if value exists before calling methods
- special-case branches for missing collaborators

**Structure**
- implement the same interface as the real dependency
- make behavior explicit but harmless
- name the null object clearly so it is not mistaken for a real implementation

**Example**
A no-op notifier implements the same notification interface for local development when external delivery is disabled.

---

## Architectural / System Design Patterns

### Dependency Injection

**Family:** Architectural
**Aliases:** di, inversion of control
**Related:** factory-method, strategy

**Summary**
Provide dependencies from the outside so classes depend on abstractions and stay easy to test, swap, and compose.

**Use when**
- a class currently creates collaborators internally
- you want isolated tests with stubs or fakes
- runtime environments need different implementations

**Avoid when**
- the dependency is a tiny value object or pure helper with no lifecycle
- introducing interfaces would only add ceremony

**Code smells**
- new Logger or new Client inside domain logic
- hard-to-test code coupled to concrete services
- hidden singleton dependencies

**Structure**
- accept collaborators through constructor, parameters, or a small composition root
- inject interfaces or focused function dependencies where practical
- keep object assembly near the app boundary

**Example**
A worker receives clock, queue store, and executor dependencies instead of constructing them internally.

---

### Domain Event

**Family:** Architectural
**Aliases:** business event
**Related:** observer, event-sourcing

**Summary**
Capture something meaningful that happened in the domain so other parts of the system can react without tight coupling.

**Use when**
- business-significant changes should trigger other behavior
- you want a shared domain language for state changes
- side effects should be decoupled from core state mutations

**Avoid when**
- the event would only mirror technical plumbing with no domain meaning
- direct calls are simpler and sufficient

**Code smells**
- after-save hooks with vague technical names
- tight coupling between state mutation and every downstream side effect

**Structure**
- name events in domain language
- publish them after successful state changes
- keep payloads focused on what happened, not implementation internals

**Example**
RunCompleted and QuestionAnswered domain events let notifications and dashboards react independently.

---

### Domain Model

**Family:** Architectural
**Aliases:** rich domain model
**Related:** aggregate, value-object

**Summary**
Represent important business concepts with behavior-rich objects instead of scattering rules across procedural services.

**Use when**
- business rules are non-trivial
- entities need behavior tied to domain language
- anemic records are causing logic duplication

**Avoid when**
- the app is simple CRUD with little domain behavior
- rich objects would just wrap data without adding invariants

**Code smells**
- business logic spread across handlers and utilities
- entities are just bags of getters and setters

**Structure**
- put invariants and behavior near the data they govern
- use services only for cross-aggregate orchestration
- keep domain terms explicit

**Example**
A Run domain model owns legal status transitions instead of exposing raw mutable status strings everywhere.

---

### Event Bus

**Family:** Architectural
**Aliases:** message bus
**Related:** observer, message-bus

**Summary**
Route published events through a shared bus so producers and consumers stay decoupled in time and topology.

**Use when**
- many components publish and subscribe to events
- direct observer wiring is getting tangled
- cross-cutting listeners should attach without editing producers

**Avoid when**
- there are only one or two direct listeners
- an event bus would hide flow that should stay explicit

**Code smells**
- producers import many concrete listeners
- event fan-out logic is duplicated across modules

**Structure**
- define stable event envelopes
- publish and subscribe through one bus contract
- keep event names and payloads explicit

**Example**
A local run event bus lets dashboard updates, audit logs, and notifications subscribe independently.

---

### Event Sourcing

**Family:** Architectural
**Aliases:** event log model
**Related:** cqrs, memento

**Summary**
Persist domain events as the source of truth so state can be rebuilt, audited, and projected from those events.

**Use when**
- audit history is first-class
- rebuilding projections from historical changes is valuable
- domain events matter more than final row snapshots

**Avoid when**
- simple current-state storage is enough
- event versioning and replay complexity are not justified

**Code smells**
- important history is lost after each update
- audit requirements force awkward append-only side tables

**Structure**
- append immutable events
- rebuild aggregate state from the event stream when needed
- derive read models from projections rather than mutating one canonical row in place

**Example**
A workflow engine can store every run transition as events and derive the current dashboard state from projections.

---

### Gateway

**Family:** Architectural
**Aliases:** api gateway object
**Related:** adapter, facade

**Summary**
Wrap an external service or subsystem with a domain-friendly gateway that hides transport details and request construction.

**Use when**
- callers should not build raw HTTP or RPC requests
- external service access needs a stable boundary
- you want to mock integrations easily

**Avoid when**
- the remote call is one tiny helper and unlikely to grow
- a gateway would only mirror one method

**Code smells**
- raw fetch or client code scattered across the app
- transport details leak into business logic

**Structure**
- define one gateway per cohesive external service
- hide transport and serialization details inside it
- return domain-friendly results

**Example**
A search provider gateway can own query formatting and response parsing for external lookup APIs.

---

### Hexagonal Architecture

**Family:** Architectural
**Aliases:** ports and adapters, ports-and-adapters
**Related:** adapter, dependency-injection

**Summary**
Keep domain logic at the center with explicit ports for inbound and outbound interactions, then plug adapters around that core.

**Use when**
- you need strong isolation between domain logic and infrastructure
- multiple transports or providers talk to the same core use cases
- tests should run against the domain without real infrastructure

**Avoid when**
- the system is small and infrastructure coupling is not a real pain point
- you would create too many layers with no payoff

**Code smells**
- domain logic imports framework or provider code directly
- business rules are hard to test without booting the whole stack

**Structure**
- define inbound and outbound ports around the core
- implement adapters at the edges for files, HTTP, browser tools, or providers
- assemble dependencies in a composition root

**Example**
A task-processing core depends on queue and notification ports while file storage and dashboard delivery live in adapters.

---

### Idempotency Key

**Family:** Architectural
**Aliases:** idempotent request
**Related:** retry, outbox

**Summary**
Attach a stable key to repeatable operations so retries or duplicate submissions do not perform the same side effect twice.

**Use when**
- clients may retry requests
- duplicate submissions are possible
- side effects must happen at most once per logical intent

**Avoid when**
- operations are naturally read-only
- duplicate side effects are harmless

**Code smells**
- retrying causes duplicate records or notifications
- operators fear rerunning a stuck request

**Structure**
- generate or accept a stable request key
- store completion results by key
- return the prior outcome for duplicates

**Example**
Creating a task from a chat action can use an idempotency key so repeated clicks do not enqueue duplicates.

---

### Lease

**Family:** Architectural
**Aliases:** time-limited ownership
**Related:** object-pool, bulkhead

**Summary**
Grant temporary ownership of a resource with expiry so abandoned work cannot hold it forever.

**Use when**
- resources must not be held indefinitely
- owners may crash or disappear
- time-based recovery is acceptable

**Avoid when**
- ownership is already short and explicit
- expiry would cause more confusion than safety

**Code smells**
- locks or resources linger forever after crashes
- manual cleanup is required for abandoned work

**Structure**
- attach expiry metadata to ownership
- renew while healthy
- reclaim resources after expiration

**Example**
A worker can claim a run with lease-like semantics so another worker can recover it later if needed.

---

### Message Bus

**Family:** Architectural
**Aliases:** command bus
**Related:** event-bus, command

**Summary**
Dispatch commands or messages through one transport-aware boundary so senders do not know concrete handlers.

**Use when**
- commands need centralized dispatch and middleware
- transport concerns should stay outside business handlers
- cross-cutting behaviors like logging or retries belong around dispatch

**Avoid when**
- simple direct calls are clearer
- one handler is permanently bound and no middleware is needed

**Code smells**
- senders know concrete handlers everywhere
- dispatch middleware is duplicated

**Structure**
- define message contracts
- route messages through a bus with middleware
- keep handlers focused on one message type

**Example**
A message bus can dispatch queue commands and apply logging, retries, and authorization consistently.

---

### Monostate

**Family:** Architectural
**Aliases:** borg pattern
**Related:** singleton, registry

**Summary**
Share state across many instances while keeping instance creation cheap, but use sparingly because it still behaves like global state.

**Use when**
- you need shared process-wide state without enforcing one object instance
- the lifecycle is truly global

**Avoid when**
- explicit dependency injection would be clearer
- tests need isolated state per instance

**Code smells**
- hidden global state with surprising instance behavior
- objects appear independent but mutate the same backing store

**Structure**
- store shared state in one backing location
- document that instances share state
- prefer explicit globals only when justified

**Example**
A monostate config holder would still be global, which is why injected config is usually safer.

---

### MVC

**Family:** Architectural
**Aliases:** model view controller
**Related:** presenter, mvvm

**Summary**
Separate domain state, rendered views, and input handling so UI logic does not collapse into one layer.

**Use when**
- a UI has meaningful rendering and input logic
- you need a classic separation between state, presentation, and control
- server or desktop UI boundaries benefit from explicit roles

**Avoid when**
- the interface is tiny and one component is enough
- the framework already gives a better-fitting UI pattern

**Code smells**
- UI handlers mix rendering and business decisions
- views know too much about persistence or transport

**Structure**
- keep models ignorant of rendering concerns
- route user input through controllers
- keep views focused on display

**Example**
A legacy dashboard server can be reasoned about as MVC with route handlers as controllers and HTML output as views.

---

### MVVM

**Family:** Architectural
**Aliases:** model view viewmodel
**Related:** presenter, mvc

**Summary**
Expose UI-ready state and commands through a view model so the view stays declarative and testable.

**Use when**
- the UI framework binds well to derived state and commands
- presentation state is richer than the raw domain model
- you want UI logic testable without rendering

**Avoid when**
- the UI is too small to justify view models
- the framework does not benefit from this separation

**Code smells**
- components compute lots of derived state inline
- event handlers and display logic are tangled

**Structure**
- keep view models framework-light when possible
- derive display-ready fields and commands centrally
- let the view stay mostly declarative

**Example**
React dashboard selectors and derived panel state can be treated as MVVM-style view models.

---

### Object Pool

**Family:** Architectural
**Aliases:** pool
**Related:** flyweight, lease

**Summary**
Reuse expensive objects instead of creating them repeatedly when creation cost or scarcity matters.

**Use when**
- objects are expensive to create
- resource count must be bounded
- reused instances can be safely reset

**Avoid when**
- objects are cheap and stateless
- pooling would risk stale state bugs

**Code smells**
- repeated expensive construction under load
- resource exhaustion from too many simultaneous objects

**Structure**
- acquire and release objects through the pool
- reset pooled instances before reuse
- bound pool size explicitly

**Example**
A browser session pool could reuse expensive Chromium contexts if startup cost became significant.

---

### Orchestrator

**Family:** Architectural
**Aliases:** workflow orchestrator
**Related:** mediator, saga

**Summary**
Centralize multi-step workflow coordination in one component that sequences tasks and reacts to outcomes.

**Use when**
- a workflow spans several collaborators
- step ordering and retries matter
- you need one place to reason about progress

**Avoid when**
- the process is only one or two direct calls
- an orchestrator would become a vague god object

**Code smells**
- workflow sequencing scattered across many modules
- no single place explains the end-to-end process

**Structure**
- keep orchestration separate from domain rules and leaf operations
- model step transitions explicitly
- surface progress and failure state clearly

**Example**
The worker already acts as an orchestrator for queued runs, questions, and follow-up state transitions.

---

### Outbox

**Family:** Architectural
**Aliases:** transactional outbox
**Related:** domain-event, event-sourcing

**Summary**
Persist outbound messages alongside local state changes, then publish them asynchronously so cross-system delivery stays reliable.

**Use when**
- state changes must trigger external messages reliably
- you need to avoid sending messages without committed local state
- event delivery can happen asynchronously

**Avoid when**
- everything happens inside one process with no message reliability needs
- a direct call is acceptable and failure-tolerant

**Code smells**
- messages sent before local commit succeeds
- manual reconciliation for lost webhooks or notifications

**Structure**
- write the outbound event in the same local transaction as state changes
- publish from the outbox later with retries
- mark delivery status explicitly

**Example**
Notification deliveries can be staged in an outbox and sent after question state is safely persisted.

---

### Pipeline

**Family:** Architectural
**Aliases:** processing pipeline
**Related:** chain-of-responsibility, template-method

**Summary**
Compose ordered processing stages so data flows through small focused transformations.

**Use when**
- work naturally happens in sequential stages
- you want reusable processing steps
- each stage should stay simple and isolated

**Avoid when**
- the workflow is too tiny for staged composition
- stages need too much shared mutable state

**Code smells**
- one giant processing function with many phases
- copy-pasted pre and post processing logic

**Structure**
- define clear stage input and output contracts
- run stages in explicit order
- keep each stage focused on one transformation

**Example**
A prompt preparation pipeline can normalize input, attach guardrails, and add stack guidance in order.

---

### Plugin

**Family:** Architectural
**Aliases:** extension point
**Related:** strategy, hexagonal-architecture

**Summary**
Define a stable extension contract so new capabilities can be added without editing the core every time.

**Use when**
- third-party or local features should be loaded dynamically
- the core should stay stable while capabilities grow
- teams need clear extension boundaries

**Avoid when**
- there will only ever be one implementation
- extension discovery would add more complexity than value

**Code smells**
- core files edited for every new integration
- feature-specific conditionals scattered through startup code

**Structure**
- define a small extension contract
- load implementations through registration or discovery
- keep the core dependent on the contract, not the plugin details

**Example**
Pi extensions are plugins that register tools and commands against the shared runtime API.

---

### Policy

**Family:** Architectural
**Aliases:** business policy
**Related:** strategy, specification

**Summary**
Encapsulate a business decision rule in one named object or module so the rule stays explicit, testable, and reusable.

**Use when**
- a domain decision needs a stable name
- rules may vary by environment or product tier
- business logic should read like business language

**Avoid when**
- the rule is one trivial line with no reuse
- the policy would just rename a tiny helper

**Code smells**
- business decisions hidden in conditionals
- same approval or eligibility logic repeated across workflows

**Structure**
- give the rule a clear business-focused name
- keep the decision API small and deterministic
- compose with other policies only when necessary

**Example**
An approval policy decides whether a desktop action requires human confirmation.

---

### Presenter

**Family:** Architectural
**Aliases:** presentation model
**Related:** mvc, mvvm

**Summary**
Move presentation logic into a presenter so views stay passive and formatting decisions are testable.

**Use when**
- views should be passive
- formatting and interaction mapping are non-trivial
- UI logic needs unit tests without rendering

**Avoid when**
- the view already has minimal logic
- a presenter would duplicate framework features with little value

**Code smells**
- formatting logic duplicated across views
- views call domain services directly

**Structure**
- keep the presenter dependent on abstractions for the view
- centralize formatting and interaction mapping
- avoid leaking rendering details into domain code

**Example**
Conversation transcript presentation helpers effectively act like presenters for message rows.

---

### Queue-Based Load Leveling

**Family:** Architectural
**Aliases:** work queue
**Related:** bulkhead, backpressure

**Summary**
Use a queue between producers and consumers so bursty traffic is smoothed and work can be processed at a controlled rate.

**Use when**
- work arrives in spikes
- background processing is acceptable
- you want producers decoupled from immediate execution capacity

**Avoid when**
- work must complete synchronously in-line
- queue delay would violate user expectations

**Code smells**
- bursty traffic overwhelms synchronous handlers
- callers block on long-running operations that could be deferred

**Structure**
- enqueue work units with enough context to execute later
- run consumers independently from producers
- monitor queue age and size

**Example**
Pinchy queues tasks and background runs so interactive actions do not directly execute all work inline.

---

### Rate Limiter

**Family:** Architectural
**Aliases:** rate limit
**Related:** token-bucket, throttle

**Summary**
Limit how quickly operations can proceed so shared resources stay protected and abuse or overload is bounded.

**Use when**
- a dependency or workflow has throughput limits
- bursts need capping
- fairness or protection matters

**Avoid when**
- load is already tiny and bounded
- hard limits would only add latency with no payoff

**Code smells**
- resource exhaustion from request bursts
- manual sleeps and ad hoc counters scattered through code

**Structure**
- centralize the rate policy
- identify the scope per user, key, or dependency
- surface limit state clearly

**Example**
A web-search tool can apply a rate limiter per provider to avoid repeated 429 responses.

---

### Read-Through

**Family:** Architectural
**Aliases:** read through cache
**Related:** cache-aside, write-through

**Summary**
Hide cache misses behind the cache itself so callers always read through one abstraction.

**Use when**
- callers should not manage cache miss logic
- the caching boundary deserves one abstraction
- read latency matters

**Avoid when**
- cache behavior must stay highly explicit at call sites
- one-off caching is simpler

**Code smells**
- every caller reimplements the same cache miss pattern
- source access and caching are tightly interwoven

**Structure**
- make the cache responsible for loading missing values
- keep loader behavior centralized
- surface cache consistency expectations clearly

**Example**
A model metadata cache can read through to discovery APIs when the entry is missing.

---

### Registry

**Family:** Architectural
**Aliases:** service registry
**Related:** adapter-registry, plugin

**Summary**
Keep a discoverable catalog of implementations, instances, or metadata that other parts of the system can query by key.

**Use when**
- lookups by id are common
- dynamic registration matters
- many components need shared discovery

**Avoid when**
- a registry would become hidden global state
- constructor injection is clearer for fixed dependencies

**Code smells**
- many scattered maps of the same keyed resources
- hard-coded lookups in multiple modules

**Structure**
- define clear registration and lookup APIs
- limit scope to one kind of thing
- avoid turning the registry into a dumping ground

**Example**
Generated tools are effectively tracked through a registry of names and source files.

---

### Repository

**Family:** Architectural
**Aliases:** data repository
**Related:** unit-of-work, specification

**Summary**
Hide persistence details behind a collection-like interface so domain logic is not coupled to queries, tables, or transport details.

**Use when**
- domain logic should not know storage details
- you need to swap persistence mechanisms or mock data access in tests
- query logic is leaking across services

**Avoid when**
- the application is thin CRUD and direct queries are already clear
- the repository would only mirror one ORM method per line

**Code smells**
- SQL or ORM details inside domain orchestration
- duplicate query logic across services and handlers

**Structure**
- define a domain-facing repository interface
- keep mapping and persistence details in infrastructure implementations
- return domain-friendly objects or records

**Example**
A task repository loads and saves queued tasks without exposing JSON file layout or database calls to the worker.

---

### Retry

**Family:** Architectural
**Aliases:** retry pattern
**Related:** circuit-breaker, bulkhead

**Summary**
Re-attempt transient failures in a controlled way so temporary outages do not immediately fail user workflows.

**Use when**
- failures are often transient
- idempotent operations can be retried safely
- backoff and limits are acceptable

**Avoid when**
- operations are not idempotent
- retries would amplify load or hide systemic failures

**Code smells**
- temporary network failures immediately break workflows
- copy-pasted retry loops with inconsistent limits

**Structure**
- centralize retry policy
- use bounded attempts with backoff or jitter
- classify which errors are retryable

**Example**
A web-search provider can retry rate-limit or transient network errors before surfacing a failure.

---

### Saga

**Family:** Architectural
**Aliases:** process manager
**Related:** unit-of-work, event-sourcing

**Summary**
Coordinate a long-running business process across multiple steps using local transactions and compensating actions instead of one distributed transaction.

**Use when**
- a workflow spans multiple services or resources
- distributed transactions are impractical
- failures need compensating actions and clear progress tracking

**Avoid when**
- everything fits inside one local transaction
- compensation logic would be more complex than the workflow itself

**Code smells**
- cross-service workflows with fragile partial-failure handling
- manual recovery steps for half-completed operations

**Structure**
- model each step and compensation explicitly
- persist saga progress and decisions
- trigger next steps from events or orchestration logic

**Example**
A multi-system onboarding flow can create local records, send invitations, and roll back account state if delivery fails later.

---

### Service Layer

**Family:** Architectural
**Aliases:** application service
**Related:** repository, facade

**Summary**
Organize business use cases behind explicit services so controllers, tools, and transports stay thin and orchestration remains centralized.

**Use when**
- multiple entrypoints trigger the same use case
- transport or UI code is getting business logic mixed in
- you want clear use-case boundaries

**Avoid when**
- the app is tiny and one function is enough
- a service layer would become vague pass-through code

**Code smells**
- business rules in HTTP handlers or UI actions
- duplicate orchestration across commands, workers, and routes

**Structure**
- define one service per cohesive use-case area
- inject repositories and collaborators into the service
- keep handlers responsible only for mapping input and output

**Example**
A conversation service owns run creation, guidance application, and thread updates while the API layer stays thin.

---

### Sharding

**Family:** Architectural
**Aliases:** partitioning
**Related:** bulkhead, queue-based-load-leveling

**Summary**
Split data or workload across partitions so growth and contention are spread instead of centralized.

**Use when**
- one store or queue is becoming a bottleneck
- work can be partitioned by a stable key
- independent scaling matters

**Avoid when**
- the dataset or workload is small
- cross-shard coordination would be harder than the current bottleneck

**Code smells**
- hotspots on one giant store or queue
- global contention for unrelated tenants or keys

**Structure**
- choose a partition key deliberately
- keep shard routing explicit
- plan for rebalancing and cross-shard queries

**Example**
Large multi-tenant task queues could shard by workspace id to reduce contention.

---

### Sidecar

**Family:** Architectural
**Aliases:** companion service
**Related:** ambassador, gateway

**Summary**
Attach supporting capabilities alongside a primary service so concerns like proxying, metrics, or auth stay out of core code.

**Use when**
- cross-cutting infrastructure should be deployed separately from the main app
- a service needs local helper capabilities with shared lifecycle

**Avoid when**
- the environment is too simple for extra runtime pieces
- in-process composition already works well

**Code smells**
- main service code owns infrastructure glue that could be delegated
- cross-cutting concerns complicate the core deployment

**Structure**
- run the helper next to the primary service
- keep the contract between them explicit
- avoid letting the sidecar own core business logic

**Example**
A local proxy sidecar could add auth and rate control in front of a model server.

---

### Specification

**Family:** Architectural
**Aliases:** business rule object
**Related:** repository, strategy

**Summary**
Represent business rules and query criteria as reusable objects so rule logic can be combined, named, and tested independently.

**Use when**
- eligibility or filtering rules are reused in multiple places
- business conditions should be composable
- query criteria and domain rules share the same language

**Avoid when**
- there is only one tiny rule
- plain predicates are already clearer

**Code smells**
- duplicated eligibility checks
- long boolean expressions copied across services or queries

**Structure**
- encapsulate one rule per specification
- allow composition with and, or, and not operations where useful
- keep rule names aligned with domain language

**Example**
A ready-to-run task specification identifies tasks whose dependencies are complete and status is pending.

---

### Strangler Fig

**Family:** Architectural
**Aliases:** incremental replacement
**Related:** anti-corruption-layer, hexagonal-architecture

**Summary**
Replace legacy behavior gradually by routing one slice at a time to new code instead of rewriting everything at once.

**Use when**
- a rewrite is too risky to do in one step
- legacy and new systems must coexist temporarily
- you can route traffic by feature or boundary

**Avoid when**
- the old system is small enough for direct replacement
- dual-running would create more confusion than value

**Code smells**
- big-bang rewrite plans with high failure risk
- legacy code can only be replaced safely in slices

**Structure**
- put a routing boundary in front of old and new implementations
- move one capability at a time to the new path
- track remaining legacy surface explicitly

**Example**
A legacy dashboard endpoint can be strangled gradually by routing selected pages to the new React app first.

---

### Throttle

**Family:** Architectural
**Aliases:** throttling
**Related:** debounce, rate-limiter

**Summary**
Allow an action at most once per interval so repeated triggers are sampled instead of fully processed.

**Use when**
- you need periodic updates under heavy trigger frequency
- some intermediate events can be skipped safely
- continuous activity should still produce occasional output

**Avoid when**
- only the final event matters
- precise per-event handling is required

**Code smells**
- scroll or resize handlers run too often
- polling or status updates flood the system

**Structure**
- track the last allowed execution time
- drop or defer triggers inside the interval
- decide whether trailing execution should run

**Example**
A transcript scroll listener can throttle expensive layout updates during rapid scrolling.

---

### Token Bucket

**Family:** Architectural
**Aliases:** leaky bucket
**Related:** rate-limiter, throttle

**Summary**
Allow bursts up to a bucket size while enforcing an average refill rate over time.

**Use when**
- short bursts are acceptable but average rate must be bounded
- you want a concrete rate-limiting algorithm

**Avoid when**
- a simple fixed delay is enough
- the system does not need burst tolerance

**Code smells**
- spiky request patterns overwhelm a dependency
- naive counters block too aggressively or too loosely

**Structure**
- track tokens and refill over time
- consume tokens per operation
- reject or delay when empty

**Example**
A token bucket can allow brief bursts of search requests while keeping provider usage under control.

---

### Unit of Work

**Family:** Architectural
**Aliases:** transaction boundary
**Related:** repository, saga

**Summary**
Track a set of related changes and commit them together so persistence stays consistent across one business operation.

**Use when**
- multiple repositories must commit together
- one workflow needs a clear transaction boundary
- you need coordinated save and rollback semantics

**Avoid when**
- writes are isolated and independent
- the extra abstraction would only wrap one save call

**Code smells**
- partial updates when one persistence step fails
- transaction logic repeated across handlers

**Structure**
- collect changes within one boundary object
- commit or rollback at the end of the use case
- keep repositories focused on aggregates while the unit of work owns transaction lifetime

**Example**
A billing workflow updates invoice and payment records through one unit of work to avoid partial persistence.

---

### Value Object

**Family:** Architectural
**Aliases:** immutable value
**Related:** domain-model, aggregate

**Summary**
Model concepts by their values instead of identity so equality, validation, and invariants stay explicit and local.

**Use when**
- a concept is defined entirely by its data
- immutability improves safety and clarity
- validation should happen once at creation

**Avoid when**
- identity and lifecycle matter more than value equality
- plain primitives are already sufficient and obvious

**Code smells**
- primitive obsession
- duplicate validation and formatting logic for the same concept

**Structure**
- wrap related primitives in a small immutable type
- enforce invariants in one place
- compare by value rather than instance identity

**Example**
A ConversationId value object prevents mixing run ids, task ids, and conversation ids accidentally.

---

### Write-Behind

**Family:** Architectural
**Aliases:** write back cache
**Related:** write-through, outbox

**Summary**
Acknowledge writes quickly in the cache and flush them to the backing store asynchronously later.

**Use when**
- write latency matters more than immediate persistence
- temporary buffering is acceptable
- you can tolerate controlled eventual consistency

**Avoid when**
- data loss risk is unacceptable
- flush complexity outweighs performance benefits

**Code smells**
- slow backing writes dominate response time
- callers block on persistence that could be delayed

**Structure**
- buffer writes in the cache
- flush asynchronously with retries
- track dirty state and failure handling explicitly

**Example**
A metrics accumulator can use write-behind semantics before flushing aggregated counters to disk.

---

### Write-Through

**Family:** Architectural
**Aliases:** write through cache
**Related:** read-through, write-behind

**Summary**
Write to the cache and backing store in one path so the cache stays immediately consistent with writes.

**Use when**
- read-after-write consistency with cache matters
- write latency is acceptable
- the cache should mirror committed state immediately

**Avoid when**
- write latency must stay minimal
- temporary cache inconsistency is acceptable

**Code smells**
- stale cache entries after writes
- manual dual writes scattered across code

**Structure**
- route writes through one boundary that updates both cache and store
- handle failures consistently
- make the source of truth explicit

**Example**
Runtime config updates can use write-through semantics to keep in-memory state aligned with disk immediately.

---

### CQRS

**Family:** Architectural
**Aliases:** command query responsibility segregation
**Related:** event-sourcing, repository

**Summary**
Separate reads and writes into distinct models so each can be optimized and scaled independently.

**Use when**
- read and write workloads differ significantly in complexity or scale
- projections or simplified read models improve performance or clarity
- eventual consistency between models is acceptable

**Avoid when**
- a single model handles both reads and writes cleanly
- the added complexity of two models outweighs the benefit

**Code smells**
- one model trying to serve both complex queries and write validation poorly
- read queries forcing expensive transformations on write-optimized structures

**Structure**
- define separate command models for writes and query models for reads
- keep write commands focused on intent, not data retrieval
- derive or project read models from domain events or state changes

**Example**
A run queue accepts write commands through a task service while a lightweight projection serves dashboard lists.

---

### Anti-Corruption Layer

**Family:** Architectural
**Aliases:** acl, corruption layer
**Related:** adapter, hexagonal-architecture

**Summary**
Place a translation boundary between your domain model and an external system with incompatible concepts so the core stays clean.

**Use when**
- an external API or legacy service uses terminology or structures that clash with your domain language
- you want to protect your domain model from unpredictable external changes
- multiple external systems need different translations but share a common internal model

**Avoid when**
- the external system already aligns well with your domain
- a simple adapter suffices without a full translation layer

**Code smells**
- domain methods containing provider-specific header manipulation or vendor error handling
- external terminology leaking into domain class names and method signatures

**Structure**
- define one translation boundary per external system
- map external concepts into domain terms before crossing the boundary
- keep the core domain unaware of external quirks

**Example**
An ACL wraps a legacy dashboard API so your task model never sees its non-standard error responses.

---

### BFF (Backend for Frontend)

**Family:** Architectural
**Aliases:** backend for frontend
**Related:** facade, gateway, service-layer

**Summary**
Provide a tailored backend endpoint or service per frontend client so each UI gets exactly the data shape and operations it needs without over-fetching.

**Use when**
- different clients need different data shapes or workflows
- you want to avoid thin wrappers around complex internal APIs for every UI variation
- mobile and web clients have very different performance or feature requirements

**Avoid when**
- one general-purpose API already serves all clients well
- BFF layers would multiply maintenance burden without real benefit

**Code smells**
- frontends doing heavy client-side data reshaping to match backend response shapes
- one endpoint returning nested data that only half the UI uses

**Structure**
- define one BFF boundary per major client type
- let the BFF orchestrate internal services and reshape responses for its client
- keep internal APIs focused on reusable use cases, not UI specifics

**Example**
A React dashboard BFF endpoint assembles task summaries from multiple internal services instead of forcing the frontend to make three separate calls.

---

### Adapter Registry

**Family:** Architectural
**Aliases:** adapter registry
**Related:** adapter, registry, plugin

**Summary**
Maintain a discoverable catalog of adapters so the system can route requests to the right provider implementation by key or capability at runtime.

**Use when**
- multiple provider implementations exist and selection depends on configuration or context
- you need hot-swappable providers without restarting or redeploying
- different features should use different providers dynamically

**Avoid when**
- only one provider implementation exists
- a simple dependency injection container covers the variation cleanly

**Code smells**
- long switch statements selecting provider implementations by name
- configuration drift where code expects providers that are not registered

**Structure**
- define an adapter interface per capability domain
- register adapters by stable keys at startup or discovery time
- look up and invoke adapters through the registry at runtime

**Example**
A search adapter registry lets the system switch between Bing, Open Library, or custom search backends by configuration without changing query logic.

---

### Backpressure

**Family:** Architectural
**Aliases:** [none listed]
**Related:** bulkhead, queue-based-load-leveling

**Summary**
Signal producers to slow down when consumers cannot keep up so the system avoids memory exhaustion and cascading failures under load.

**Use when**
- upstream traffic can overwhelm downstream processing capacity
- dropping or queuing without limits causes resource exhaustion
- you need graceful degradation instead of crashes

**Avoid when**
- producers and consumers are already naturally balanced
- backpressure mechanisms add more complexity than the problem justifies

**Code smells**
- unbounded queues growing until memory is exhausted
- downstream timeouts causing upstream retries that make overload worse

**Structure**
- track consumer capacity explicitly
- propagate backpressure signals upstream through controlled flow
- apply limits at ingress points or well-chosen intermediate boundaries

**Example**
A task ingestion pipeline applies backpressure when the worker pool is full, preventing new submissions from overwhelming memory.

---

### Bulkhead

**Family:** Architectural
**Aliases:** [none listed]
**Related:** circuit-breaker, backpressure

**Summary**
Isolate resources into separate pools or partitions so a failure or overload in one area cannot take down the entire system.

**Use when**
- different workflows or external dependencies have different risk profiles
- one slow dependency should not exhaust threads or connections used by others
- you need fault isolation between logical subsystems

**Avoid when**
- the system is small enough that shared resources are not a risk
- isolation boundaries would fragment code without reducing real failure surface

**Code smells**
- one slow external call starving all other operations of threads or connections
- cascading timeouts across unrelated features sharing resource pools

**Structure**
- partition resources like thread pools, connection pools, or queues by dependency or feature
- cap capacity per partition explicitly
- fail fast with clear error messages when a partition is saturated

**Example**
Run execution, notification delivery, and search requests each get their own worker pools so a stuck search does not block task processing.

---

### Coordinator

**Family:** Architectural
**Aliases:** [none listed]
**Related:** orchestrator, mediator

**Summary**
Manage multi-component workflows by delegating step execution to collaborators while tracking progress and handling failures across the sequence.

**Use when**
- a workflow involves multiple independent services or tools that must be called in order
- you need centralized error handling and retry logic for composite operations
- step results need to be aggregated before proceeding

**Avoid when**
- the workflow is trivial enough that direct calls are clearer
- the coordinator would become a god object routing everything through itself

**Code smells**
- scattered try-catch blocks repeating similar error handling across workflow steps
- callers managing their own progress tracking for composite operations

**Structure**
- define clear step interfaces for each collaborator
- keep progress tracking and failure recovery in the coordinator
- let collaborators focus on executing their specific responsibility

**Example**
A coordination workflow runs detection, summarization, and notification steps sequentially while handling per-step timeouts and retries centrally.

---

# Anti-Pattern Catalog

Below are all anti-pattern cards embedded for lookup by name or alias.

---

### Anemic Domain Model

**Aliases:** anemic model
**Recommended Patterns:** Domain Model, Aggregate, Policy

**Summary**
Domain objects hold data only, while all real business rules live elsewhere in procedural services.

**Symptoms**
- entities are mostly getters and setters
- services own invariants and transitions
- state mutation is wide open

**Why it hurts**
- rules are duplicated and easy to bypass
- domain language is weak
- objects do not protect their own consistency

**Detection hints**
- look for services mutating entity fields directly
- watch for model classes with no meaningful behavior

**Example**
If Run is just a record and every status rule lives in utilities, the model is anemic.

---

### Big Ball of Mud

**Aliases:** mud
**Recommended Patterns:** Hexagonal Architecture, Strangler Fig, Service Layer

**Summary**
The system lacks clear boundaries, so modules are tangled, inconsistent, and hard to evolve safely.

**Symptoms**
- imports cross boundaries arbitrarily
- similar problems are solved differently in different areas
- architecture diagrams no longer reflect reality

**Why it hurts**
- small changes have unpredictable impact
- new contributors copy accidental patterns
- cleanup work feels endless

**Detection hints**
- look for cycles, mixed responsibilities, and inconsistent naming across layers
- notice when no one can explain the boundary model simply

**Example**
A workspace where routes, state files, domain logic, and UI shaping all intermix freely trends toward Big Ball of Mud.

---

### Callback Hell

**Aliases:** pyramid of doom
**Recommended Patterns:** Pipeline, Orchestrator

**Summary**
Async flow nests deeply, making sequencing, errors, and state hard to follow.

**Symptoms**
- nested callbacks grow to the right
- error handling is inconsistent across levels
- state is threaded manually through many closures

**Why it hurts**
- control flow becomes unreadable
- failures leak or double-handle
- maintenance is psychologically expensive

**Detection hints**
- look for deeply nested callbacks or chained anonymous functions
- notice repeated error branches in async code

**Example**
A browser reproduction flow implemented as nested callbacks instead of clear steps is Callback Hell.

---

### Circular Dependencies

**Aliases:** dependency cycle
**Recommended Patterns:** Hexagonal Architecture, Service Layer, Mediator

**Summary**
Modules depend on each other in loops, making initialization, reuse, and testing harder.

**Symptoms**
- A imports B and B imports A indirectly or directly
- startup order becomes fragile
- small refactors trigger cycle errors

**Why it hurts**
- boundaries lose direction
- reuse and packaging become harder
- mental models become tangled

**Detection hints**
- inspect import graphs and module cycles
- notice components that cannot be understood in isolation

**Example**
If dashboard state helpers import API route code and API code imports dashboard helpers, there is a circular dependency.

---

### Copy-Paste Programming

**Aliases:** copy paste
**Recommended Patterns:** Template Method, Strategy, Service Layer

**Summary**
Behavior is duplicated by cloning existing code and editing it slightly instead of extracting shared structure.

**Symptoms**
- near-identical blocks recur across files
- bug fixes must be applied in multiple places
- naming drifts but structure remains the same

**Why it hurts**
- defects spread across clones
- maintenance cost multiplies
- shared intent becomes hard to see

**Detection hints**
- search for similar code blocks with small differences
- inspect repeated sequences of validation, logging, and branching

**Example**
Duplicating three worker flows and changing only one line in each is Copy-Paste Programming.

---

### Dead Code

**Aliases:** unused code
**Recommended Patterns:** Strangler Fig, Feature Toggle

**Summary**
Unused branches, modules, or abstractions remain in the codebase after the original need has vanished.

**Symptoms**
- paths are never called
- flags and branches remain long after rollout
- helpers exist only for historical reasons

**Why it hurts**
- noise hides live behavior
- maintenance and onboarding slow down
- stale branches invite accidental reuse

**Detection hints**
- look for unreferenced modules, stale toggles, or always-false branches
- inspect comments describing long-removed scenarios

**Example**
An old dashboard branch preserved after the new React flow fully replaced it is Dead Code.

---

### Feature Envy

**Aliases:** envy
**Recommended Patterns:** Domain Model, Value Object, Repository

**Summary**
A method spends more time using another object's data than its own object's state.

**Symptoms**
- methods reach deeply into another object
- logic lives far from the data it reasons about
- getters dominate the implementation

**Why it hurts**
- behavior drifts away from the natural owner
- encapsulation weakens
- refactoring gets harder because knowledge is misplaced

**Detection hints**
- look for train-wreck access chains and repeated getters
- see whether another object supplies most of the method data

**Example**
A formatter that pulls many raw fields from Run and manually computes transition validity may belong closer to the Run model.

---

### God Object

**Aliases:** blob
**Recommended Patterns:** Facade, Service Layer, Hexagonal Architecture

**Summary**
One class or module accumulates too many responsibilities, knows too much, and becomes the default place to add more behavior.

**Symptoms**
- one large file or class keeps growing
- many unrelated methods and fields live together
- changes to one concern frequently touch the same module

**Why it hurts**
- high coupling and low cohesion slow every change
- testing becomes broad and brittle
- ownership boundaries disappear

**Detection hints**
- look for large modules importing many unrelated collaborators
- watch for classes changed by many unrelated tickets
- notice files that orchestrate and implement domain logic at once

**Example**
A giant controller that validates input, performs business rules, reads storage, formats responses, and sends notifications is a God Object.

---

### Golden Hammer

**Aliases:** favorite tool syndrome
**Recommended Patterns:** Strategy, Adapter, Facade

**Summary**
One familiar pattern or technology is forced onto many problems even when it does not fit.

**Symptoms**
- the same abstraction appears everywhere regardless of need
- simple cases get complex frameworks or patterns
- teams defend one solution before examining the problem

**Why it hurts**
- complexity rises without proportional benefit
- local optimizations distort the design
- maintenance requires understanding unnecessary indirection

**Detection hints**
- look for a repeated pattern introduced even in tiny cases
- notice explanations that start with the tool rather than the problem

**Example**
Using an event bus for every local callback, even inside one small module, is a Golden Hammer smell.

---

### Inappropriate Intimacy

**Aliases:** intimacy
**Recommended Patterns:** Facade, Aggregate, Mediator

**Summary**
Two modules know too much about each other's internals and change together constantly.

**Symptoms**
- friends access private-ish state through many getters
- changes in one module break the other frequently
- one object manages another object's internal lifecycle

**Why it hurts**
- encapsulation erodes
- responsibilities blur
- independent evolution becomes difficult

**Detection hints**
- look for deep access chains between two recurring modules
- inspect pairs that are almost always changed together

**Example**
A UI component that manipulates the storage internals of the run queue shows Inappropriate Intimacy.

---

### Lava Flow

**Aliases:** fossilized code
**Recommended Patterns:** Strangler Fig, Feature Toggle

**Summary**
Old unfinished or abandoned code remains embedded in active paths because no one feels safe removing it.

**Symptoms**
- commented-out code and half-used abstractions remain
- ancient flags and branches linger indefinitely
- nobody knows whether a stale path is still needed

**Why it hurts**
- new design must route around old residue
- fear of removal accumulates
- clarity decays over time

**Detection hints**
- look for obsolete TODOs, disabled branches, and do not touch comments
- inspect modules nobody claims to own

**Example**
An old generated tool loading path kept alive just in case after a replacement shipped is Lava Flow.

---

### Leaky Abstraction

**Aliases:** leak
**Recommended Patterns:** Facade, Adapter, Gateway

**Summary**
An abstraction claims to hide details, but callers must still know the hidden system's quirks to use it correctly.

**Symptoms**
- callers branch on implementation details anyway
- abstraction-specific caveats leak into many sites
- the generic API exposes provider terms

**Why it hurts**
- false simplicity misleads callers
- switching implementations is still painful
- bugs appear at boundary seams

**Detection hints**
- look for comments like except on provider X at call sites
- inspect generic APIs exposing vendor-specific flags

**Example**
A supposedly generic search API that requires callers to know Bing-specific challenge behavior is leaky.

---

### Long Parameter List

**Aliases:** parameter bloat
**Recommended Patterns:** Builder, Value Object, Dependency Injection

**Summary**
Functions or constructors take too many primitive parameters, obscuring intent and increasing call-site mistakes.

**Symptoms**
- many same-typed arguments appear together
- call sites need comments to explain parameter order
- optional flags keep accumulating

**Why it hurts**
- readability drops
- wrong argument ordering becomes easy
- shared concepts stay implicit

**Detection hints**
- look for functions with many positional arguments
- notice repeated bundles of related inputs

**Example**
A function taking workspaceId, conversationId, runId, userId, title, status, retries, timeout, and mode may need restructuring.

---

### Magic Numbers and Strings

**Aliases:** magic values
**Recommended Patterns:** Value Object, Policy

**Summary**
Important meanings are encoded as unexplained literals scattered through the code.

**Symptoms**
- repeated status strings and numeric thresholds appear inline
- callers must remember special literal meanings
- business rules depend on unexplained constants

**Why it hurts**
- intent is hidden
- changes require hunting literals
- typos become bugs

**Detection hints**
- search for repeated literals with semantic meaning
- notice thresholds and flags with no named explanation

**Example**
Inline high, 3, and 1500 appearing throughout retry or thinking-level logic can be magic values.

---

### Overengineering

**Aliases:** accidental complexity
**Recommended Patterns:** Facade, Service Layer, Null Object

**Summary**
The design contains more abstraction, configurability, or indirection than the real problem requires.

**Symptoms**
- tiny problems have many layers
- simple changes require understanding many abstractions
- the design optimizes hypothetical future cases

**Why it hurts**
- delivery slows down
- teams fear touching code
- abstractions stop matching real usage

**Detection hints**
- look for unused extension points and one-implementation interfaces everywhere
- notice complexity justified only by possible future scale

**Example**
Building a full CQRS plus event-sourcing stack for one local config file is overengineering.

---

### Primitive Obsession

**Aliases:** primitive obsession
**Recommended Patterns:** Value Object, Domain Model

**Summary**
Domain concepts are represented by bare strings, numbers, and booleans instead of meaningful types.

**Symptoms**
- many loosely related primitives travel together
- validation and formatting repeat across modules
- invalid combinations are easy to create

**Why it hurts**
- business rules leak across the system
- names and constraints stay implicit
- mixing identifiers and units becomes easy

**Detection hints**
- look for repeated regex or range validation on the same primitive fields
- watch for long parameter lists of strings and numbers

**Example**
Passing raw conversationId, runId, and taskId strings everywhere instead of typed wrappers is Primitive Obsession.

---

### Service Locator

**Aliases:** locator
**Recommended Patterns:** Dependency Injection, Factory Method

**Summary**
Code reaches into a global registry or container to pull dependencies instead of receiving them explicitly.

**Symptoms**
- methods fetch collaborators from global state
- dependencies are hidden from constructors and function signatures
- tests must mutate shared registries to control behavior

**Why it hurts**
- hidden coupling makes code harder to reason about
- test setup becomes fragile
- global state leaks across features

**Detection hints**
- look for getService, resolve, or container usage deep inside business logic
- notice constructors with no dependencies but many hidden lookups

**Example**
A worker that calls globalContainer.get("queue") and globalContainer.get("logger") internally exhibits Service Locator.

---

### Shotgun Surgery

**Aliases:** scattered change
**Recommended Patterns:** Facade, Service Layer, Domain Model

**Summary**
A small feature change forces edits across many scattered files because related behavior is not localized.

**Symptoms**
- one change touches many modules
- coordination logic is duplicated across boundaries
- behavior is split by technical layer instead of cohesive responsibility

**Why it hurts**
- safe changes become slow and error-prone
- teams miss one of the required edits
- understanding impact takes too long

**Detection hints**
- inspect commits that modify many files for one behavior change
- look for repeated orchestration snippets

**Example**
Adding one new run status should not require editing serializers, UI mappings, workers, validators, and analytics in many places.

---

### Singleton Abuse

**Aliases:** global singleton
**Recommended Patterns:** Dependency Injection, Registry

**Summary**
A singleton is used as a convenience global for many unrelated concerns, making state hidden and tests brittle.

**Symptoms**
- many modules read and mutate one global instance
- reset logic is needed between tests
- the singleton becomes a dumping ground

**Why it hurts**
- global state obscures dependencies
- parallelism and tests get harder
- responsibility boundaries disappear

**Detection hints**
- look for static getInstance calls everywhere
- see whether the singleton owns unrelated concerns

**Example**
A global runtime manager storing config, caches, queues, and UI state is singleton abuse.

---

### Spaghetti Code

**Aliases:** spaghetti
**Recommended Patterns:** Pipeline, Service Layer, Orchestrator

**Summary**
Control flow is tangled, ad hoc, and hard to trace because structure has eroded.

**Symptoms**
- logic jumps unpredictably between branches and helpers
- naming and sequencing feel inconsistent
- understanding one path requires following many special cases

**Why it hurts**
- maintainers lose confidence
- bugs hide in edge cases
- refactoring risk feels high

**Detection hints**
- look for long functions with many branches, flags, and exits
- inspect code where no clear primary path emerges

**Example**
A giant worker loop with nested conditionals, early exits, and inline retries can drift into spaghetti code.

---

### Temporal Coupling

**Aliases:** order dependency
**Recommended Patterns:** Builder, Template Method, State

**Summary**
Code only works if methods are called in a hidden order that the API does not make explicit.

**Symptoms**
- initialization steps must happen in sequence
- objects are invalid until several calls complete
- bugs come from missing one setup call

**Why it hurts**
- APIs become trap-filled
- callers must memorize lifecycle order
- partial initialization bugs occur

**Detection hints**
- look for comments saying must call X before Y
- inspect objects with setup followed by start or finalize methods

**Example**
A run object that requires setModel, setContext, setPermissions, then start in the right order has temporal coupling.

---

### Tight Coupling

**Aliases:** rigid coupling
**Recommended Patterns:** Dependency Injection, Adapter, Hexagonal Architecture

**Summary**
Modules depend directly on concrete details so changes ripple outward and testing becomes hard.

**Symptoms**
- business code imports infrastructure classes directly
- small changes require many coordinated updates
- mocks are hard because interfaces are absent

**Why it hurts**
- swapping implementations is expensive
- testability suffers
- boundaries become brittle

**Detection hints**
- look for concrete provider imports in domain code
- notice constructors creating deep collaborator graphs internally

**Example**
A domain service that directly new()s file stores, HTTP clients, and UI notifiers is tightly coupled.

---

When an anti-pattern is detected, do not stop at naming it. Follow through to a documented healthier pattern or explicit simplification.
