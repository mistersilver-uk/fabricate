---
name: javascript-structural-design
description: Structure JavaScript modules, objects, and collaborators so code is readable, explicit in its dependencies, easy to change, and easy to test. Use when designing or refactoring JS boundaries, reviewing maintainability or testability, or deciding how responsibilities should be split.
---

# JavaScript Structural Design

Use this skill when a change touches JavaScript module boundaries, collaborator wiring, object responsibilities, API shape, or testability.

## Execution Protocol

1. Name the behavior that must change and the smallest public boundary that should own it.
2. Choose the boundary shape before coding: ES module API, plain object, closure/factory, class, Svelte store, or Foundry adapter.
3. Make dependencies explicit at that boundary and keep runtime/global lookup at the edge.
4. Check the design against the object checklist below.
5. Load only the reference needed for the problem you are solving.

## Topic Router

| Topic | Trigger | Quick move | Reference |
| --- | --- | --- | --- |
| Behavior-first API | callers fetch data then orchestrate work | move the behavior behind the owning boundary | `references/elegant-objects.md` |
| Boundary shape | unclear class/function/store/module choice | choose by ownership, state, lifecycle, and dependencies | `references/elegant-objects.md` |
| Utility growth | exported helpers become a broad bucket | extract a named domain abstraction or keep helpers private | `references/elegant-objects.md` |
| Naming and cohesion | names end in `Manager`, `Service`, `Helper`, or contain "and" | rename around the owned concept or split responsibilities | `references/elegant-objects.md` |
| Constructor work | creation performs I/O, lookup, setup, or branching | move work to composition or an explicit method | `references/testable-code.md` |
| Collaborator digging | code receives a context/container to fetch another object | inject the specific collaborator directly | `references/testable-code.md` |
| Global/runtime leakage | `game`, `ui`, `Hooks`, `CONFIG`, clocks, or randomness spread inward | localize access behind a narrow runtime edge | `references/testable-code.md` |
| Brittle tests | setup needs mocks returning mocks or global resets | redesign the public seam before adding more test plumbing | `references/testable-code.md` |

## Design Workflow

1. Start with the behavior that must change, then define the narrowest public seam that owns it.
2. Make dependencies explicit at that seam.
   - Inject the specific collaborator needed.
   - Avoid passing `context`, `manager`, `container`, `environment`, or other grab-bag objects just to dig through them later.
3. Keep creation boring.
   - Constructors and factories should mostly assign collaborators, normalize cheap values, or validate invariants.
   - Push I/O, service lookup, branching setup, and heavy object graph construction to the composition edge.
4. Keep modules and objects small and cohesive.
   - If the description of a unit naturally contains "and", split it.
   - If fields are used by only one subset of methods, extract a smaller unit.
5. Prefer behavior-first APIs over data bags.
   - Ask a module or object to do work or produce a representation.
   - Do not add getters and setters by default just to let outside code orchestrate internals.
6. Confine mutation and global access.
   - Prefer immutable inputs and return values; accept mutation only at measured hot paths or where a Foundry API contract demands it.
   - Isolate Foundry globals, clocks, randomness, and third-party statics at thin edges that are easy to fake in tests.
7. Test the seam, not the internals.
   - Write tests against public behavior and narrow collaborator contracts.
   - Avoid designs that require mocks returning mocks or tests that reach through multiple layers.

## Boundary Shape Rubric

- Use an ES module API for cohesive stateless behavior with a small stable exported contract.
- Use a plain object for immutable values, configuration, or a narrow strategy; avoid getter/setter data bags.
- Use a closure or factory when a small collaborator set should be captured without exposing mutable internals.
- Use a class when identity, lifecycle, state transitions, or several injected collaborators make behavior clearer.
- Use a Svelte store for UI state and derived view state, not as a domain service container.
- Use a Foundry adapter or localized call site for runtime globals and third-party statics.

## Elegant JavaScript Object Checklist

Flag or refactor these patterns when they create real risk:

- constructors or init paths that perform real work
- method chains that dig through collaborators
- exported utility dumping grounds or hidden module singletons
- classes or modules with mixed responsibilities
- job-title names like `ThingManager`, `ParserService`, or `ContextHolder`
- getter-heavy APIs that expose internal state instead of owning behavior

## JavaScript Adaptation

Elegant Objects is stricter than this codebase needs.
Apply the direction, not dogma:

- Private module-scope pure helpers are fine when they support one cohesive module.
- Exported helpers are acceptable only when they form a clear abstraction with a stable contract, not a generic `utils` bucket.
- Not every boundary needs a class.
Functions and closures are fine if dependencies stay explicit and the seam stays testable.
- Foundry globals are unavoidable at runtime edges.
Wrap or localize them instead of letting them leak through the whole call chain.

## Expected Output

When you use this skill, explain the structural decision in terms of:

- selected boundary shape and any material rejected alternative
- owned behavior
- explicit dependencies
- cohesion and split points
- test seam and validation impact
