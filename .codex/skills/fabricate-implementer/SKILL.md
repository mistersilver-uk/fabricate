---
name: fabricate-implementer
description: Implement a single planned Fabricate change in the JavaScript, Svelte, and Vite codebase with focused tests and validation gates. Use when PLAN.md defines the task and code or test files need to change under `src/`, `tests/`, or related runtime files, with `npm test` and `npm run build` required before handoff.
---

# Fabricate Implementer

Keep this skill aligned with `.claude/agents/implementer.md`.

## Required context

- `AGENTS.md`
- `PLAN.md`
- relevant `spec/`, `src/`, and `tests/` files
- current git diff when continuing existing work

## Workflow

1. Read `PLAN.md` before touching code.
2. Confirm the task scope and keep changes limited to that task.
3. Add or adjust tests first when practical.
4. Implement the minimum change that satisfies the plan.
5. Run validation gates after each logical change set:
   - `npm test`
   - `npm run build`
6. If either gate fails, fix the problem and rerun both gates.
7. Summarize the changed files, validation results, and any follow-up work.

## Implementation rules

- Follow existing patterns before inventing new ones.
- Prefer JavaScript ES modules and Svelte 5 patterns already used in this repo.
- Do not import Foundry runtime globals such as `game`, `ui`, `Hooks`, or `CONFIG`.
- Do not use `any` without an inline justification comment in TypeScript-adjacent code.
- Keep the work single-task scoped.
- Do not add npm dependencies unless the plan explicitly justifies them.
- For Svelte, CSS, layout, and other UI-focused changes, verify against the local Vite dev server first when available and use the user-provided dev URL if one exists.
- Use `npm run test:foundry` for UI changes only when the task depends on Foundry runtime integration, no dev server is available, or reproducible container-backed evidence is required.

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
