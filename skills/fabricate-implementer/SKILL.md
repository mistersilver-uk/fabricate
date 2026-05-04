---
name: fabricate-implementer
description: Implement a single planned Fabricate change in the JavaScript, Svelte, and Vite codebase with focused tests and validation gates. Use when an active OpenSpec change under `openspec/changes/` defines the task and code or test files need to change under `src/`, `tests/`, or related runtime files, with `npm test` and `npm run build` required before handoff.
---

# Fabricate Implementer

Keep this skill aligned with the `fabricate_implementer` custom Codex agent.

## Required context

- `AGENTS.md`
- the active change folder under `openspec/changes/`
- relevant `openspec/specs/`, `src/`, and `tests/` files
- `skills/javascript-structural-design/SKILL.md` when the task changes JavaScript module boundaries, collaborator wiring, API shape, or test seams
- `skills/javascript-mastery/SKILL.md` when the task involves tricky JavaScript semantics, async flow, closures, coercion, prototypes, or `this` behavior
- current git diff when continuing existing work

## Workflow

1. Read the active change folder before touching code.
2. Confirm the task scope and keep changes limited to that task.
3. Add or adjust tests first when practical.
4. Load `javascript-structural-design` when the change reshapes dependencies, constructors, module boundaries, or test seams.
5. Load `javascript-mastery` when the change depends on non-trivial JavaScript behavior or language edge cases.
6. Implement the minimum change that satisfies the plan.
7. For UI changes, inspect the rendered outcome against the planned criteria before handoff; do not treat screenshot creation alone as validation.
8. If implementation reveals a durable product rule, update the relevant canonical spec or active change design doc.
9. Run validation gates after each logical change set:
   - `npm test`
   - `npm run build`
10. If either gate fails, fix the problem and rerun both gates.
11. Summarize the changed files, validation results, screenshot artifacts, and any follow-up work.

## Implementation rules

- Follow existing patterns before inventing new ones.
- Prefer JavaScript ES modules and Svelte 5 patterns already used in this repo.
- Use `javascript-structural-design` as the default reference for dependency seams, cohesion, constructors, and behavior-first APIs.
- Use `javascript-mastery` as the default reference for JavaScript-specific correctness questions before inventing local style rules.
- Prefer explicit collaborators over `context`, `container`, or `manager` grab bags.
- Avoid exported utility buckets, hidden mutable singletons, and constructors that do real work when a local abstraction or injected dependency will do.
- Do not import Foundry runtime globals such as `game`, `ui`, `Hooks`, or `CONFIG`.
- Do not use `any` without an inline justification comment in TypeScript-adjacent code.
- Keep the work single-task scoped.
- Do not add npm dependencies unless the plan explicitly justifies them.
- In Foundry UI CSS, avoid generic state classes such as `.disabled`, `.active`, and `.selected` unless they are safely component-scoped; prefer component-specific state classes such as `.is-disabled`.
- For Svelte, CSS, layout, and other UI-focused changes, verify against the local Vite dev server first when available and use the user-provided dev URL if one exists.
- Use `npm run test:foundry` for UI changes only when the task depends on Foundry runtime integration, no dev server is available, or reproducible container-backed evidence is required.
- If `npm run test:foundry` conflicts with a local Foundry on port `30000`, use matching alternate environment variables such as `FOUNDRY_HOST_PORT=30001 FOUNDRY_URL=http://localhost:30001`.
- Treat Docker startup conflicts, launch reconnects, and stale container-name failures as harness infrastructure unless the app loaded and failed a product assertion.
- For card, overlay, menu, disabled-state, and icon-button interactions, add real browser pointer hit-tests when feasible. `elementFromPoint` checks catch CSS overlays and global Foundry styles that mounted tests can miss.
- For compact rails, headers, fact cards, buttons, and fixed navigation areas, test long localized/content strings so wrapping, truncation, and stable geometry are explicit.
- For image-card UI, use representative fixture data where practical so at least one screenshot proves the linked image path as well as fallback behavior.
- Record what each inspected screenshot proves and explicitly name any remaining fixture gap.

## Foundry V13 checks

When the task touches Foundry APIs, verify these cases:

- Wrap `game.documentTypes.Item` with `Array.from()` before array-style operations.
- Prefer `game.documentTypes` over `game.system.documentTypes`, with fallback only when needed.
- Use `sheet.changeTab(tabName, groupName)` for ApplicationV2 tab switching.
- Preserve `flags.core.sourceId` when embedded items must map back to source items.
- Use `CraftingSystemManager.getSystems()` and `getItems(systemId)`.

## Commit rule

If the user asks for a commit, use Conventional Commits in this form:

`<type>(#<issue>): <short description>`

Validate with `npx commitlint` before pushing.

## Expected output

Provide:

- changed file list
- test and build status
- known limitations or deferred follow-ups
