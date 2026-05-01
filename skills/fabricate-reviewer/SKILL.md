---
name: fabricate-reviewer
description: Perform an independent review of Fabricate changes for correctness, regression risk, test quality, and Foundry V13 compatibility. Use after implementation is complete, when the user asks for a review, or before docs and issue closure.
---

# Fabricate Reviewer

Keep this skill aligned with the `fabricate_reviewer` custom Codex agent.

## Required context

- the active change folder under `openspec/changes/`
- current git diff
- relevant canonical spec files for the changed area
- `skills/javascript-structural-design/SKILL.md` when reviewing JavaScript structure, dependency seams, or testability
- prior test and build results if available

## Review workflow

1. Review the diff with a findings-first mindset.
2. Check correctness, regression risk, and missing edge cases.
3. Check whether the structure keeps dependencies explicit, constructors boring, and responsibilities cohesive when JavaScript boundaries changed.
4. Check test quality and whether coverage matches the risk.
5. Verify Foundry compatibility assumptions for touched APIs.
6. For UI changes, verify screenshots are evaluated against acceptance criteria, not just generated.
7. Run `npm test` and `npm run build` if validation is missing, stale, or suspicious.
8. Return one gate status on the first line:
   - `APPROVED`
   - `NEEDS_CHANGES`
   - `BLOCKED`

## Review checklist

- Types are explicit and defensible.
- Dependencies are explicit; the code does not dig through `context`, `manager`, or similar grab-bag collaborators.
- Constructors and factories do not hide real work or environment-sensitive setup.
- Classes and modules have one clear responsibility.
- API surfaces are behavior-first rather than getter-heavy data bags.
- Global state is isolated behind seams that tests can control.
- Tests are meaningful, not trivial.
- Svelte components follow existing repo patterns.
- No stray debug logging remains.
- Validation passes without warnings that matter.
- UI-only changes use Vite-first verification when available, with container-based validation reserved for runtime-sensitive or reproducibility-focused checks.
- UI screenshot claims identify what the artifact proves: first view, clipping, spacing, alignment, image fidelity, scroll containment, visible controls, and relevant responsive sizes.
- Card, overlay, menu, disabled-state, and icon-button workflows have live pointer hit-test coverage when rendered hit targets could differ from DOM structure.
- Foundry UI CSS avoids unscoped generic state classes such as `.disabled`, `.active`, and `.selected` where global styles could interfere.
- Image UI tests or fixtures prove linked-image priority, or the remaining screenshot gap is explicitly called out.

## Foundry V13 checks

When reviewing Foundry-facing code, verify:

- `game.documentTypes.Item` is converted before array methods.
- V13 document types come from `game.documentTypes`, not only `game.system.documentTypes`.
- Programmatic tab switches use `changeTab`, not DOM click hacks.
- Embedded copies preserve `flags.core.sourceId` when needed.
- Manager calls use `getSystems()` and `getItems(systemId)`.
- Browser test helpers account for V13 API shapes.

## Expected output

- first line: status token only
- then severity-ordered findings with `file:line` references
- if no findings, say so explicitly and list residual risks or testing gaps
