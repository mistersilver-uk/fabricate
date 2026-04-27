# Design: Improve JavaScript Structural Design Skill

## Decisions

1. Keep `SKILL.md` as the fast path.
   - Add a short execution protocol modeled on the Go skill's workflow.
   - Add one topic routing table that points to `references/elegant-objects.md` and `references/testable-code.md`.
   - Add one concise object/module checklist for review and refactoring.
   - Keep the fast path below 130 lines and avoid duplicating examples that belong in references.
   - Omit a separate TL;DR and reference index because the topic table serves both purposes.

2. Use references for concrete examples.
   - `elegant-objects.md` should cover behavior-first objects/modules, object shape choices, naming, composition, immutable boundaries, and utility-module limits.
   - `testable-code.md` should cover constructor work, collaborator digging, globals, object graph setup, and tests that reveal bad structure.

3. Keep JavaScript adaptation explicit.
   - ES module APIs are the default for cohesive stateless behavior and stable exported contracts.
   - Plain objects are acceptable for immutable values, configuration, or narrow strategy objects, but should not become getter/setter data bags.
   - Closures are acceptable when a factory needs to capture a small set of collaborators without exposing mutable internals.
   - Classes are acceptable when identity, lifecycle, state transitions, or multiple injected collaborators make behavior clearer.
   - Svelte stores are UI state boundaries, not generic service containers or domain workflow owners.
   - Foundry globals should stay at runtime edges behind narrow adapters or localized call sites.
   - The expected output must name the chosen shape and briefly reject at least one weaker alternative when the choice is material.

4. Avoid dogma.
   - The skill should treat Elegant Objects as design pressure, not a rulebook.
   - Private pure helpers are acceptable inside cohesive modules.
   - Exported helpers are acceptable when they express a stable domain abstraction.

## Proposed Content Changes

- `SKILL.md`
  - add an "Execution Protocol" section
  - replace "Read Only The Reference You Need" with one table of topics, triggers, references, and quick moves
  - add a "Boundary Shape Rubric" section
  - add an "Elegant JavaScript Object Checklist" section
  - retain the existing JavaScript adaptation and expected output guidance

- `references/elegant-objects.md`
  - add concrete JavaScript before/after examples for behavior-first APIs, boundary shape choice, naming, and utility module extraction
  - add a section on immutable boundaries and owned representations
  - add a section on Fabricate-specific object/module choices

- `references/testable-code.md`
  - add concrete examples for boring constructors, direct collaborator injection, global adapters, and test setup smells
  - add review prompts that tie test pain back to production structure

## Verification

- inspect the changed files for concise progressive disclosure and no duplicated long-form content
- run a focused grep/read validation that confirms the new sections exist and `SKILL.md` stays below 130 lines
- validate the acceptance scenarios from the proposal by checking that each has a clear decision point and output expectation in the skill or references
- ask the implementer and quality engineer agents to review both the proposal and the final implementation for blocking feedback
