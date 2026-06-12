---
name: fabricate-implementer
description: Implement a single planned Fabricate change in the JavaScript, Svelte, and Vite codebase with focused tests and validation gates. Use when the issue's OpenSpec delta defines the task and code, canonical spec, or test files need to change under `src/`, `openspec/specs/`, `tests/`, or related runtime files, with `npm test` and `npm run build` required before handoff.
---

# Fabricate Implementer

This skill is the canonical definition of the Fabricate Implementer persona. Both provider bindings — `.codex/agents/fabricate-implementer.toml` (Codex) and `.claude/agents/fabricate-implementer.md` (Claude) — are thin pointers to this file. Make behavior changes here, not in the bindings.

## Required context

- `AGENTS.md`
- the work's GitHub issue and its `openspec-delta` block, via `gh issue view`
- relevant `openspec/specs/`, `src/`, and `tests/` files
- `skills/javascript-structural-design/SKILL.md` when the task changes JavaScript module boundaries, collaborator wiring, API shape, or test seams
- `skills/javascript-mastery/SKILL.md` when the task involves tricky JavaScript semantics, async flow, closures, coercion, prototypes, or `this` behavior
- current git diff when continuing existing work

## Workflow

1. Read the issue's `openspec-delta` block (via `gh issue view`) before touching code.
2. Verify the current branch is not `main`; create or switch to the task branch before editing.
3. Confirm the task scope and keep changes limited to that task. Make the canonical spec changes the delta's `### Spec Deltas` require under `openspec/specs/` as part of the change. If implementation forces a justified departure from the proposed delta, note it for the driver so the docs loop can reconcile the issue delta against what shipped.
4. Add or adjust tests first when practical.
5. Load `javascript-structural-design` when the change reshapes dependencies, constructors, module boundaries, or test seams.
6. Load `javascript-mastery` when the change depends on non-trivial JavaScript behavior or language edge cases.
7. Implement the minimum change that satisfies the plan.
8. For UI changes, inspect the rendered outcome against the planned criteria before handoff; do not treat screenshot creation alone as validation.
9. For UI changes, run `npm run screenshots:ui:plan -- --base origin/main`, run `npm run test:foundry` (local default `full` profile), then once a PR number exists: `npm run screenshots:ui -- --base origin/main --pr <number>` to collect into `tmp/pr-screenshots/<number>/`, `npm run screenshots:ui:publish -- --pr <number>` to upload the collected files to S3 and embed the returned `![pr-<number> ...]` markdown in the PR body, then `npm run screenshots:ui:clean -- --pr <number>`. There is no `SCREENSHOTS_NEEDED:` bypass and an agent cannot skip the check; if capture is genuinely impossible, report why so a maintainer can decide whether to apply the `screenshots-exempt` label.
10. If implementation reveals a durable product rule, update the relevant canonical spec under `openspec/specs/` (and flag it for the issue delta when it changes the planned contract).
11. Run validation gates after each logical change set:
   - `npm test`
   - `npm run build`
12. If either gate fails, fix the problem and rerun both gates.
13. Commit to the task branch, push it, and open or update the PR targeting `main`.
14. Summarize the changed files, validation results, screenshot artifacts, PR status, and any follow-up work.

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
- Assume other agents may be working in parallel. Stay within your assigned file ownership; do not revert unrelated edits or touch files outside your ownership without a concrete reason.
- Do not add npm dependencies unless the plan explicitly justifies them.
- In Foundry UI CSS, avoid generic state classes such as `.disabled`, `.active`, and `.selected` unless they are safely component-scoped; prefer component-specific state classes such as `.is-disabled`.
- For Svelte, CSS, layout, and other UI-focused changes, verify against the local Vite dev server first when available and use the user-provided dev URL if one exists.
- For Manager V2 feature routes, implement placeholder promotion as a complete route slice: remove disabled placeholder data, add feature-gated nav, route normalization, breadcrumbs/copy, focused route component, inspector state, localization/CSS, and mounted/source-contract tests.
- When a Manager V2 feature button cannot be clicked, first inspect whether it is still rendered as a disabled placeholder or hidden by feature gates before changing event handlers.
- In mounted Svelte tests that synthesize DOM events directly, prefer explicit `value` plus `oninput`/`onchange` handlers for controls that need deterministic test updates.
- When code hand-maintains a mirror of another part of the repo (selectors, labels, path/recipe maps, fixture lists), add a guard test that fails when they drift — e.g. assert every mapping entry resolves to a real tracked file or emitted symbol. These mirrors rot silently otherwise.
- Use `npm run test:foundry` for UI changes only when the task depends on Foundry runtime integration or the user explicitly asks for live Foundry evidence. It is not the normal PR screenshot generator.
- `npm run test:foundry` defaults to host port `30100` so it coexists with a developer's local Foundry on `30000`. If `30100` is also occupied, override with matching `FOUNDRY_HOST_PORT` and `FOUNDRY_URL` (e.g. `FOUNDRY_HOST_PORT=30101 FOUNDRY_URL=http://localhost:30101`).
- Treat Docker startup conflicts, launch reconnects, and stale container-name failures as harness infrastructure unless the app loaded and failed a product assertion.
- For card, overlay, menu, disabled-state, and icon-button interactions, add real browser pointer hit-tests when feasible. `elementFromPoint` checks catch CSS overlays and global Foundry styles that mounted tests can miss.
- For compact rails, headers, fact cards, buttons, and fixed navigation areas, test long localized/content strings so wrapping, truncation, and stable geometry are explicit.
- For image-card UI, use representative fixture data where practical so at least one screenshot proves the linked image path as well as fallback behavior.
- Smoke screenshot fixture data should use Foundry VTT core or dnd5e non-SVG raster image paths directly when previews need imagery; do not invent SVG preview art or hard-code external URLs.
- Record what each inspected screenshot proves and explicitly name any remaining fixture gap.
- For release/latest-version lookups, reuse `node scripts/latest-module-versions.mjs --profile fabricate-beta`; do not hand-roll S3 listing code for the Fabricate module set, and substitute another `--profile <name>` when needed. The helper reads configured release manifests via exact `GetObject` keys and supports `--json` for downstream tooling.

## Foundry V13 checks

When the task touches Foundry APIs, verify these cases:

- Wrap `game.documentTypes.Item` with `Array.from()` before array-style operations.
- Prefer `game.documentTypes` over `game.system.documentTypes`, with fallback only when needed.
- Use `sheet.changeTab(tabName, groupName)` for ApplicationV2 tab switching.
- Preserve `flags.core.sourceId` when embedded items must map back to source items.
- Use `CraftingSystemManager.getSystems()` and `getItems(systemId)`.

## Branch, commit, and PR rule

Implementation work must be committed to a non-`main` task branch and delivered through a PR targeting `main`. Apply review feedback by updating the same branch and PR unless the user explicitly asks for a replacement.

Use Conventional Commits in this form:

`<type>(#<issue>): <short description>`

Use a Conventional Commits-compliant PR title. For `feat`, `fix`, and `perf`, use the same `<type>(#<issue>): <short description>` format when a GitHub issue exists.

Validate with `npx commitlint` before pushing.

Use this PR description template:

```md
## Description

## Benefit(s)

## Changes in this PR

## Testing

## Screenshots (if applicable)
```

## Expected output

Provide:

- changed file list
- test and build status
- PR link or status
- known limitations or deferred follow-ups
