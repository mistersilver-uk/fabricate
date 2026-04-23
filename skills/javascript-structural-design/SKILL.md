---
name: javascript-structural-design
description: Structure JavaScript modules, objects, and collaborators so code is readable, explicit in its dependencies, easy to change, and easy to test. Use when designing or refactoring JS boundaries, reviewing maintainability or testability, or deciding how responsibilities should be split.
---

# JavaScript Structural Design

Use this skill when a change touches JavaScript module boundaries, collaborator wiring, object responsibilities, API shape, or testability.

## Read Only The Reference You Need

- `references/elegant-objects.md` for behavior-first APIs, cohesion, naming, composition, immutability, and avoiding static or global utility design.
- `references/testable-code.md` for concrete testability smells such as constructors that do work, collaborator digging, global state, and modules that do too much.

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
   - Prefer immutable inputs and return values when practical.
   - Isolate Foundry globals, clocks, randomness, and third-party statics at thin edges that are easy to fake in tests.
7. Test the seam, not the internals.
   - Write tests against public behavior and narrow collaborator contracts.
   - Avoid designs that require mocks returning mocks or tests that reach through multiple layers.

## Review Heuristics

Flag or refactor these patterns when they create real risk:

- constructors or init paths that perform real work
- method chains that dig through collaborators
- exported utility dumping grounds or hidden module singletons
- classes or modules with mixed responsibilities
- job-title names like `ThingManager`, `ParserService`, or `ContextHolder`
- getter-heavy APIs that expose internal state instead of owning behavior

## JavaScript Adaptation

Elegant Objects is stricter than this codebase needs. Apply the direction, not dogma:

- Private module-scope pure helpers are fine when they support one cohesive module.
- Exported helpers are acceptable only when they form a clear abstraction with a stable contract, not a generic `utils` bucket.
- Not every boundary needs a class. Functions and closures are fine if dependencies stay explicit and the seam stays testable.
- Foundry globals are unavoidable at runtime edges. Wrap or localize them instead of letting them leak through the whole call chain.

## Expected Output

When you use this skill, explain the structural decision in terms of:

- owned behavior
- explicit dependencies
- cohesion and split points
- test seam and validation impact
