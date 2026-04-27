# Proposal: Improve JavaScript Structural Design Skill

## Summary

Refine `skills/javascript-structural-design/` so it is as operationally useful as the referenced Go style skill while staying concise and pragmatic for Fabricate's JavaScript, Svelte, and Foundry runtime constraints.

## Assessment

The current skill is effective as a short reminder of the intended design direction. It correctly emphasizes explicit collaborators, boring constructors, small cohesive modules, behavior-first APIs, confined mutation, and testable boundaries.

Compared with the referenced Go style skill, it is weaker as an execution aid:

- it lacks a quick rules table that maps common design topics to deeper references
- the reference files are mostly principle summaries, with few JavaScript-specific examples or refactoring moves
- it does not provide a concrete implementation/review protocol for agents to follow before coding
- it has no compact checklist for elegant JavaScript objects and modules
- it does not clearly distinguish JavaScript adaptation choices such as classes, closures, plain objects, Svelte stores, and Foundry adapters

## Motivation

Fabricate uses JavaScript surfaces where structural drift is easy: modules can grow into utility buckets, globals can leak through call chains, and objects can become passive data bags. A richer skill should give agents concrete patterns for preventing that drift without forcing strict object-oriented dogma.

## Scope

- expand `skills/javascript-structural-design/SKILL.md` with a concise execution protocol, quick rules table, and review checklist
- add an explicit boundary-shape rubric for ES module APIs, plain objects, closures, classes, Svelte stores, and Foundry adapters
- deepen `references/elegant-objects.md` with JavaScript-specific elegant object/module patterns and before/after examples
- deepen `references/testable-code.md` with concrete dependency, constructor, global-state, and test-boundary examples
- keep the existing skill directory shape and provider metadata

## Out Of Scope

- refactoring production runtime code
- adding lint rules or automated enforcement
- adopting Elegant Objects literally where JavaScript functions, closures, Svelte stores, or Foundry runtime adapters are a better fit
- changing existing agent files unless the skill metadata becomes stale

## Desired Outcome

After the change, an agent using the skill should be able to:

- decide which reference file to load for a structural problem
- choose between module functions, closures, classes, and Svelte stores based on ownership and dependencies
- identify passive data bags, broad utility modules, constructor work, collaborator digging, and global leakage
- propose a focused refactor with a clear public boundary and validation plan

## Acceptance Scenarios

The finished skill should support these scenario checks:

- class vs closure: choose a class only when identity, lifecycle, state, or injected collaborators make it clearer than module functions or a closure
- boring constructor: move I/O, runtime lookup, branching setup, and heavy graph construction out of creation paths
- Foundry global boundary: keep `game`, `ui`, `Hooks`, `CONFIG`, clocks, randomness, and third-party statics localized behind narrow runtime edges
- Svelte store boundary: treat stores as UI state surfaces, not service containers or domain workflow owners
- utility module split: extract a named domain abstraction when exported helpers become a broad bucket
- negative control: leave a simple cohesive pure helper alone when it is private to one module and does not hide dependencies
